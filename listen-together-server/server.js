/**
 * ARSA Listen Together — Self-Hosted Node.js Backend Server
 *
 * Implements the real wire protocol for com.arsa.aryavl.listentogether:
 * - Express HTTP endpoints: /api/rooms, /allocate, /health, /test, /
 * - Raw WebSocket server (ws) for live room sessions
 * - In-memory ephemeral room management (no database required)
 * - Complete state synchronization, control modes, chat, track suggestions,
 *   reconnection with tokens, buffer sync, and lifecycle management.
 */

import http from 'http';
import crypto from 'crypto';
import express from 'express';
import cors from 'cors';
import { WebSocketServer, WebSocket } from 'ws';

// --- Configuration ---
const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || '0.0.0.0';
const ROOM_TTL_HOURS = parseFloat(process.env.ROOM_TTL_HOURS || '6');
const MAX_EXTENSIONS = parseInt(process.env.MAX_EXTENSIONS || '2', 10);
const EXTENSION_HOURS = parseFloat(process.env.EXTENSION_HOURS || '3');
const MAX_MEMBERS = parseInt(process.env.MAX_MEMBERS || '20', 10);
const HOST_GRACE_MS = 90_000; // 90 seconds before promoting next member
const BUFFER_TIMEOUT_MS = 10_000; // 10s wait for clients buffer
const EXPIRY_WARNING_MS = 10 * 60_000; // 10 minutes before expiry

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;

function generateCode() {
  let out = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    out += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return out;
}

// --- Wire Protocol Message Types ---
const C2S = {
  CREATE_ROOM: 'create_room',
  JOIN_ROOM: 'join_room',
  LEAVE_ROOM: 'leave_room',
  APPROVE_JOIN: 'approve_join',
  REJECT_JOIN: 'reject_join',
  PLAYBACK_ACTION: 'playback_action',
  BUFFER_READY: 'buffer_ready',
  KICK_USER: 'kick_user',
  TRANSFER_HOST: 'transfer_host',
  PING: 'ping',
  CHAT: 'chat',
  REQUEST_SYNC: 'request_sync',
  RECONNECT: 'reconnect',
  SUGGEST_TRACK: 'suggest_track',
  APPROVE_SUGGESTION: 'approve_suggestion',
  REJECT_SUGGESTION: 'reject_suggestion',
  SET_CONTROL_MODE: 'set_control_mode',
  EXTEND_SESSION: 'extend_session',
};

const S2C = {
  ROOM_CREATED: 'room_created',
  JOIN_REQUEST: 'join_request',
  JOIN_APPROVED: 'join_approved',
  JOIN_REJECTED: 'join_rejected',
  USER_JOINED: 'user_joined',
  USER_LEFT: 'user_left',
  SYNC_PLAYBACK: 'sync_playback',
  BUFFER_WAIT: 'buffer_wait',
  BUFFER_COMPLETE: 'buffer_complete',
  ERROR: 'error',
  PONG: 'pong',
  HOST_CHANGED: 'host_changed',
  KICKED: 'kicked',
  SYNC_STATE: 'sync_state',
  RECONNECTED: 'reconnected',
  USER_RECONNECTED: 'user_reconnected',
  USER_DISCONNECTED: 'user_disconnected',
  SUGGESTION_RECEIVED: 'suggestion_received',
  SUGGESTION_APPROVED: 'suggestion_approved',
  SUGGESTION_REJECTED: 'suggestion_rejected',
  CONTROL_MODE_CHANGED: 'control_mode_changed',
  ROOM_EXPIRING: 'room_expiring',
  ROOM_CLOSED: 'room_closed',
  CHAT: 'chat',
};

function encodeMsg(type, payload) {
  return JSON.stringify(payload === undefined ? { type } : { type, payload });
}

function sendMsg(ws, type, payload) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    try {
      ws.send(encodeMsg(type, payload));
    } catch (err) {
      console.error('[WS Send Error]', err.message);
    }
  }
}

// --- In-Memory Room Store ---
// rooms: Map<string, Room>
// tokens: Map<string, { roomCode, userId }>
const rooms = new Map();
const tokenIndex = new Map();

class Room {
  constructor(roomCode) {
    this.roomCode = roomCode;
    this.hostId = null;
    this.controlMode = 'owner'; // 'owner' | 'everyone'
    this.currentTrack = null;
    this.isPlaying = false;
    this.position = 0; // ms
    this.lastUpdate = Date.now();
    this.volume = 1.0;
    this.queue = [];

    // users: Map<userId, { userId, username, ws, role, sessionToken, isConnected, joinedAt }>
    this.users = new Map();
    // pendingJoinRequests: Map<userId, { userId, username, sessionToken, ws }>
    this.pendingJoinRequests = new Map();
    // pendingSuggestions: Map<suggestionId, { suggestionId, fromUserId, fromUsername, trackInfo }>
    this.pendingSuggestions = new Map();
    // bufferWait: { trackId, waitingFor: Set<userId>, timeoutTimer } | null
    this.bufferWait = null;

    this.blockedUserIds = new Set();
    this.blockedUsernames = new Set();

    this.createdAt = Date.now();
    this.expiresAt = Date.now() + Math.round(ROOM_TTL_HOURS * 3600 * 1000);
    this.extensionsUsed = 0;
    this.warned = false;

    this.hostGraceTimer = null;
    this.warningTimer = null;
    this.expiryTimer = null;
    this.emptyRoomTimer = null;

    this.scheduleTimers();
  }

  scheduleTimers() {
    this.clearTimers();

    const now = Date.now();
    const timeUntilExpiry = Math.max(0, this.expiresAt - now);
    const timeUntilWarning = Math.max(0, timeUntilExpiry - EXPIRY_WARNING_MS);

    if (!this.warned && timeUntilWarning > 0) {
      this.warningTimer = setTimeout(() => {
        this.warned = true;
        this.broadcast(S2C.ROOM_EXPIRING, {
          expires_at: this.expiresAt,
          extensions_left: Math.max(0, MAX_EXTENSIONS - this.extensionsUsed),
        });
      }, timeUntilWarning);
    }

    this.expiryTimer = setTimeout(() => {
      this.closeRoom('Room expired');
    }, timeUntilExpiry);
  }

  clearTimers() {
    if (this.warningTimer) clearTimeout(this.warningTimer);
    if (this.expiryTimer) clearTimeout(this.expiryTimer);
    if (this.hostGraceTimer) clearTimeout(this.hostGraceTimer);
    if (this.emptyRoomTimer) clearTimeout(this.emptyRoomTimer);
    if (this.bufferWait?.timeoutTimer) clearTimeout(this.bufferWait.timeoutTimer);
  }

  snapshot() {
    const userList = Array.from(this.users.values()).map((u) => ({
      user_id: u.userId,
      username: u.username,
      is_host: u.userId === this.hostId,
      is_connected: u.isConnected,
    }));

    return {
      room_code: this.roomCode,
      host_id: this.hostId || '',
      users: userList,
      current_track: this.currentTrack,
      is_playing: this.isPlaying,
      position: this.position,
      last_update: this.lastUpdate,
      volume: this.volume,
      queue: this.queue,
      control_mode: this.controlMode,
      expires_at: this.expiresAt,
      extensions_used: this.extensionsUsed,
    };
  }

  broadcast(type, payload, excludeUserId = null) {
    for (const [uid, user] of this.users.entries()) {
      if (excludeUserId && uid === excludeUserId) continue;
      if (user.ws && user.isConnected) {
        sendMsg(user.ws, type, payload);
      }
    }
  }

  getHostSockets() {
    const hostUser = this.users.get(this.hostId);
    return hostUser && hostUser.ws && hostUser.isConnected ? [hostUser.ws] : [];
  }

  promoteNextHost() {
    // Find the connected member who joined earliest
    const candidates = Array.from(this.users.values())
      .filter((u) => u.isConnected && u.userId !== this.hostId)
      .sort((a, b) => a.joinedAt - b.joinedAt);

    if (candidates.length > 0) {
      const nextHost = candidates[0];
      this.hostId = nextHost.userId;
      nextHost.role = 'host';
      console.log(`[Room ${this.roomCode}] Host promoted to ${nextHost.username} (${nextHost.userId})`);
      this.broadcast(S2C.HOST_CHANGED, {
        new_host_id: nextHost.userId,
        new_host_name: nextHost.username,
      });
    } else {
      console.log(`[Room ${this.roomCode}] No connected members available to promote.`);
    }
  }

  checkEmptyRoom() {
    const hasConnected = Array.from(this.users.values()).some((u) => u.isConnected);
    if (!hasConnected) {
      if (!this.emptyRoomTimer) {
        // Destroy empty room after 5 minutes of no connected users
        this.emptyRoomTimer = setTimeout(() => {
          this.closeRoom('Room empty');
        }, 5 * 60_000);
      }
    } else {
      if (this.emptyRoomTimer) {
        clearTimeout(this.emptyRoomTimer);
        this.emptyRoomTimer = null;
      }
    }
  }

  closeRoom(reason) {
    console.log(`[Room ${this.roomCode}] Closing room: ${reason}`);
    this.broadcast(S2C.ROOM_CLOSED, { reason });
    this.clearTimers();

    // Close all user sockets
    for (const user of this.users.values()) {
      if (user.ws) {
        try {
          user.ws.close(1000, reason);
        } catch { /* ignore */ }
      }
      tokenIndex.delete(user.sessionToken);
    }
    for (const pending of this.pendingJoinRequests.values()) {
      if (pending.ws) {
        try {
          sendMsg(pending.ws, S2C.JOIN_REJECTED, { reason: 'Room closed' });
          pending.ws.close(1000, reason);
        } catch { /* ignore */ }
      }
    }

    rooms.delete(this.roomCode);
  }
}

// --- Express App ---
const app = express();
app.use(cors());
app.use(express.json());

// 1. Room Allocation: POST /api/rooms & POST /allocate
function allocateRoomHandler(req, res) {
  let roomCode;
  for (let i = 0; i < 10; i++) {
    const candidate = generateCode();
    if (!rooms.has(candidate)) {
      roomCode = candidate;
      break;
    }
  }

  if (!roomCode) {
    return res.status(503).json({ error: 'could_not_allocate_room' });
  }

  const room = new Room(roomCode);
  rooms.set(roomCode, room);
  console.log(`[Allocate] Room created: ${roomCode}`);
  return res.json({ room_code: roomCode });
}

app.post('/api/rooms', allocateRoomHandler);
app.post('/allocate', allocateRoomHandler);

// 2. Health check endpoint
app.get('/health', (req, res) => {
  let totalUsers = 0;
  for (const r of rooms.values()) {
    for (const u of r.users.values()) {
      if (u.isConnected) totalUsers++;
    }
  }
  res.json({
    ok: true,
    version: '2.0.0',
    rooms: rooms.size,
    users: totalUsers,
    uptime: Math.floor(process.uptime()),
  });
});

// 3. Web test client
const TEST_CLIENT_HTML = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>ARSA Sync — Test Client</title>
<style>
:root{color-scheme:dark}
*{box-sizing:border-box}
body{margin:0;font:15px/1.5 ui-sans-serif,system-ui,-apple-system,sans-serif;background:#0b0b0f;color:#f2f2f7;padding:24px;max-width:760px;margin-inline:auto}
h1{font-size:19px;margin:0 0 2px}
.sub{color:#8e8e93;font-size:13px;margin-bottom:20px}
.card{background:#1c1c1e;border:1px solid #2c2c2e;border-radius:16px;padding:16px;margin-bottom:14px}
label{display:block;font-size:12px;color:#8e8e93;margin-bottom:6px}
input{width:100%;padding:11px 13px;border-radius:11px;border:1px solid #3a3a3c;background:#2c2c2e;color:#fff;font-size:15px}
.row{display:flex;gap:10px;flex-wrap:wrap;margin-top:12px}
button{padding:11px 16px;border-radius:11px;border:0;background:#0a84ff;color:#fff;font-size:14px;font-weight:600;cursor:pointer}
button.sec{background:#2c2c2e;color:#f2f2f7}
button:disabled{opacity:.35;cursor:not-allowed}
.pill{display:inline-block;padding:3px 10px;border-radius:999px;font-size:12px;background:#2c2c2e;color:#8e8e93;margin-right:6px}
.pill.on{background:#0a84ff33;color:#64d2ff}
pre{background:#000;border-radius:12px;padding:12px;max-height:320px;overflow:auto;font:12px/1.5 ui-monospace,monospace;color:#98989d;margin-top:10px}
</style></head><body>
<h1>ARSA Sync — Test Client</h1>
<div class="sub">Connect to an active room as a second participant for testing.</div>
<div class="card">
  <label>Room code</label>
  <input id="code" placeholder="ABC123" autocapitalize="characters">
  <label style="margin-top:12px">Username</label>
  <input id="name" value="browser-test">
  <div class="row">
    <button id="join">Join room</button>
    <button id="leave" class="sec" disabled>Leave</button>
  </div>
</div>
<div class="card">
  <div id="pills"><span class="pill" id="st">disconnected</span></div>
  <div class="row">
    <button class="act sec" data-a="play" disabled>Play</button>
    <button class="act sec" data-a="pause" disabled>Pause</button>
    <button class="act sec" data-a="skip_next" disabled>Next</button>
    <button class="act sec" data-a="skip_prev" disabled>Prev</button>
  </div>
</div>
<div class="card">
  <label>Live State & Logs</label>
  <pre id="log">// Messages will appear here</pre>
</div>
<script>
let ws=null;
const codeEl=document.getElementById('code');
const nameEl=document.getElementById('name');
const joinBtn=document.getElementById('join');
const leaveBtn=document.getElementById('leave');
const logEl=document.getElementById('log');
const stEl=document.getElementById('st');

function log(msg){logEl.textContent=new Date().toLocaleTimeString()+' '+JSON.stringify(msg,null,2)+'\\n'+logEl.textContent;}

joinBtn.onclick=()=>{
  const code=codeEl.value.trim().toUpperCase();
  const name=nameEl.value.trim();
  if(!code||!name)return alert('Code and username required');
  const proto=location.protocol==='https:'?'wss:':'ws:';
  ws=new WebSocket(proto+'//'+location.host+'/room/'+code);
  ws.onopen=()=>{
    stEl.textContent='connected, requesting join...';
    stEl.className='pill on';
    ws.send(JSON.stringify({type:'join_room',payload:{room_code:code,username:name}}));
  };
  ws.onmessage=(e)=>{
    const msg=JSON.parse(e.data);
    log(msg);
    if(msg.type==='join_approved'){
      stEl.textContent='in room ('+code+')';
      joinBtn.disabled=true;
      leaveBtn.disabled=false;
      document.querySelectorAll('.act').forEach(b=>b.disabled=false);
    }
  };
  ws.onclose=()=>{
    stEl.textContent='disconnected';
    stEl.className='pill';
    joinBtn.disabled=false;
    leaveBtn.disabled=true;
    document.querySelectorAll('.act').forEach(b=>b.disabled=true);
  };
};

leaveBtn.onclick=()=>{if(ws){ws.send(JSON.stringify({type:'leave_room'}));ws.close();}};
document.querySelectorAll('.act').forEach(b=>{
  b.onclick=()=>{
    if(ws)ws.send(JSON.stringify({type:'playback_action',payload:{action:b.dataset.a,server_time:Date.now()}}));
  };
});
</script>
</body></html>`;

app.get('/test', (req, res) => {
  res.setHeader('content-type', 'text/html; charset=utf-8');
  res.send(TEST_CLIENT_HTML);
});

// 4. Root information endpoint
app.get('/', (req, res) => {
  res.json({
    service: 'ARSA Listen Together Server',
    status: 'running',
    version: '2.0.0',
    usage: {
      android_app_setting: 'Settings -> Integrations -> Listen Together -> Custom Server URL',
      websocket_url: `${req.protocol === 'https' ? 'wss' : 'ws'}://${req.get('host')}`,
      allocate_endpoint: 'POST /api/rooms',
      test_ui: '/test',
      health: '/health',
    },
  });
});

// --- HTTP Server and WebSocket Upgrade Handling ---
const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (request, socket, head) => {
  const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
  const pathname = url.pathname;

  // Accept /room/:code, /ws, and /
  const roomMatch = pathname.match(/^\/room\/([A-Z0-9]{4,12})$/i);
  let roomCode = null;
  if (roomMatch) {
    roomCode = roomMatch[1].toUpperCase();
  }

  wss.handleUpgrade(request, socket, head, (ws) => {
    ws.urlRoomCode = roomCode; // may be null if connected to root / or /ws
    wss.emit('connection', ws, request);
  });
});

// --- WebSocket Connection Handler ---
wss.on('connection', (ws, request) => {
  // Attached socket state
  ws.userId = null;
  ws.roomCode = ws.urlRoomCode || null;
  ws.sessionToken = null;
  ws.isAlive = true;

  ws.on('pong', () => {
    ws.isAlive = true;
  });

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return sendMsg(ws, S2C.ERROR, { code: 'bad_json', message: 'Invalid JSON message' });
    }

    handleClientMessage(ws, msg);
  });

  ws.on('close', () => {
    handleSocketDisconnect(ws);
  });

  ws.on('error', (err) => {
    console.error('[WS Error]', err.message);
  });
});

// Heartbeat ping interval
const pingInterval = setInterval(() => {
  for (const client of wss.clients) {
    if (!client.isAlive) {
      client.terminate();
      continue;
    }
    client.isAlive = false;
    client.ping();
  }
}, 30000);

// --- Protocol Message Router ---
function handleClientMessage(ws, msg) {
  const { type, payload = {} } = msg;

  switch (type) {
    case C2S.PING:
      sendMsg(ws, S2C.PONG);
      break;

    case C2S.CREATE_ROOM:
      handleCreateRoom(ws, payload);
      break;

    case C2S.JOIN_ROOM:
      handleJoinRoom(ws, payload);
      break;

    case C2S.APPROVE_JOIN:
      handleApproveJoin(ws, payload);
      break;

    case C2S.REJECT_JOIN:
      handleRejectJoin(ws, payload);
      break;

    case C2S.RECONNECT:
      handleReconnect(ws, payload);
      break;

    case C2S.PLAYBACK_ACTION:
      handlePlaybackAction(ws, payload);
      break;

    case C2S.REQUEST_SYNC:
      handleRequestSync(ws);
      break;

    case C2S.SET_CONTROL_MODE:
      handleSetControlMode(ws, payload);
      break;

    case C2S.SUGGEST_TRACK:
      handleSuggestTrack(ws, payload);
      break;

    case C2S.APPROVE_SUGGESTION:
      handleApproveSuggestion(ws, payload);
      break;

    case C2S.REJECT_SUGGESTION:
      handleRejectSuggestion(ws, payload);
      break;

    case C2S.CHAT:
      handleChat(ws, payload);
      break;

    case C2S.KICK_USER:
      handleKickUser(ws, payload);
      break;

    case C2S.TRANSFER_HOST:
      handleTransferHost(ws, payload);
      break;

    case C2S.BUFFER_READY:
      handleBufferReady(ws, payload);
      break;

    case C2S.EXTEND_SESSION:
      handleExtendSession(ws);
      break;

    case C2S.LEAVE_ROOM:
      handleLeaveRoom(ws);
      break;

    default:
      sendMsg(ws, S2C.ERROR, { code: 'unknown_type', message: `Unhandled message type: ${type}` });
  }
}

// --- Message Handlers ---

function handleCreateRoom(ws, payload) {
  const username = (payload.username || 'Host').trim();
  let code = ws.roomCode;

  let room;
  if (code && rooms.has(code)) {
    room = rooms.get(code);
  } else {
    // Mint new room code if connected on root
    if (!code) {
      for (let i = 0; i < 10; i++) {
        const candidate = generateCode();
        if (!rooms.has(candidate)) {
          code = candidate;
          break;
        }
      }
    }
    room = new Room(code);
    rooms.set(code, room);
  }

  const userId = crypto.randomUUID();
  const sessionToken = crypto.randomUUID();

  ws.userId = userId;
  ws.roomCode = code;
  ws.sessionToken = sessionToken;

  room.hostId = userId;
  const member = {
    userId,
    username,
    ws,
    role: 'host',
    sessionToken,
    isConnected: true,
    joinedAt: Date.now(),
  };

  room.users.set(userId, member);
  tokenIndex.set(sessionToken, { roomCode: code, userId });

  console.log(`[Room ${code}] Host attached: ${username} (${userId})`);

  sendMsg(ws, S2C.ROOM_CREATED, {
    room_code: code,
    user_id: userId,
    session_token: sessionToken,
    state: room.snapshot(),
  });
}

function handleJoinRoom(ws, payload) {
  const code = (payload.room_code || ws.roomCode || '').trim().toUpperCase();
  const username = (payload.username || 'Guest').trim();

  if (!code || !rooms.has(code)) {
    return sendMsg(ws, S2C.JOIN_REJECTED, { reason: 'Room not found or expired' });
  }

  const room = rooms.get(code);

  if (room.blockedUsernames.has(username)) {
    return sendMsg(ws, S2C.JOIN_REJECTED, { reason: 'You have been blocked from this room' });
  }

  if (room.users.size >= MAX_MEMBERS) {
    return sendMsg(ws, S2C.JOIN_REJECTED, { reason: 'Room is full' });
  }

  const userId = crypto.randomUUID();
  const sessionToken = crypto.randomUUID();

  ws.userId = userId;
  ws.roomCode = code;
  ws.sessionToken = sessionToken;

  // Add to pending
  room.pendingJoinRequests.set(userId, {
    userId,
    username,
    sessionToken,
    ws,
  });

  console.log(`[Room ${code}] Join request from ${username} (${userId})`);

  // Forward join request to host
  const hostSockets = room.getHostSockets();
  if (hostSockets.length > 0) {
    for (const hostWs of hostSockets) {
      sendMsg(hostWs, S2C.JOIN_REQUEST, {
        user_id: userId,
        username,
      });
    }
  } else {
    // If no host is currently connected, auto-approve or reject
    console.log(`[Room ${code}] No host connected to approve; waiting for host`);
  }
}

function handleApproveJoin(ws, payload) {
  const room = rooms.get(ws.roomCode);
  if (!room) return;

  if (ws.userId !== room.hostId) {
    return sendMsg(ws, S2C.ERROR, { code: 'forbidden', message: 'Only host can approve joins' });
  }

  const targetUserId = payload.user_id;
  const pending = room.pendingJoinRequests.get(targetUserId);
  if (!pending) return;

  room.pendingJoinRequests.delete(targetUserId);

  const newMember = {
    userId: targetUserId,
    username: pending.username,
    ws: pending.ws,
    role: 'guest',
    sessionToken: pending.sessionToken,
    isConnected: true,
    joinedAt: Date.now(),
  };

  room.users.set(targetUserId, newMember);
  tokenIndex.set(pending.sessionToken, { roomCode: room.roomCode, userId: targetUserId });

  console.log(`[Room ${room.roomCode}] Join approved for ${pending.username} (${targetUserId})`);

  // Send join_approved with current room state to approved guest
  sendMsg(pending.ws, S2C.JOIN_APPROVED, {
    room_code: room.roomCode,
    user_id: targetUserId,
    session_token: pending.sessionToken,
    state: room.snapshot(),
  });

  // Broadcast user_joined to all other members
  room.broadcast(S2C.USER_JOINED, {
    user_id: targetUserId,
    username: pending.username,
  }, targetUserId);
}

function handleRejectJoin(ws, payload) {
  const room = rooms.get(ws.roomCode);
  if (!room) return;

  if (ws.userId !== room.hostId) {
    return sendMsg(ws, S2C.ERROR, { code: 'forbidden', message: 'Only host can reject joins' });
  }

  const targetUserId = payload.user_id;
  const pending = room.pendingJoinRequests.get(targetUserId);
  if (!pending) return;

  room.pendingJoinRequests.delete(targetUserId);
  const reason = payload.reason || 'Host rejected your join request';

  sendMsg(pending.ws, S2C.JOIN_REJECTED, { reason });
  try {
    pending.ws.close(1000, reason);
  } catch { /* ignore */ }
}

function handleReconnect(ws, payload) {
  const token = payload.session_token;
  if (!token) {
    return sendMsg(ws, S2C.JOIN_REJECTED, { reason: 'Session token required' });
  }

  const entry = tokenIndex.get(token);
  if (!entry) {
    return sendMsg(ws, S2C.ERROR, { code: 'session_not_found', message: 'Session expired' });
  }

  const room = rooms.get(entry.roomCode);
  if (!room) {
    tokenIndex.delete(token);
    return sendMsg(ws, S2C.ERROR, { code: 'session_not_found', message: 'Room no longer exists' });
  }

  const member = room.users.get(entry.userId);
  if (!member) {
    tokenIndex.delete(token);
    return sendMsg(ws, S2C.ERROR, { code: 'session_not_found', message: 'User not found in room' });
  }

  // Close existing old socket if still lingering
  if (member.ws && member.ws !== ws) {
    try {
      member.ws.close(1000, 'replaced');
    } catch { /* ignore */ }
  }

  ws.userId = member.userId;
  ws.roomCode = room.roomCode;
  ws.sessionToken = token;

  member.ws = ws;
  member.isConnected = true;

  // If host reconnected, cancel grace timer
  if (room.hostId === member.userId && room.hostGraceTimer) {
    clearTimeout(room.hostGraceTimer);
    room.hostGraceTimer = null;
  }

  console.log(`[Room ${room.roomCode}] Reconnected user: ${member.username} (${member.userId})`);

  sendMsg(ws, S2C.RECONNECTED, {
    room_code: room.roomCode,
    user_id: member.userId,
    state: room.snapshot(),
    is_host: room.hostId === member.userId,
  });

  room.broadcast(S2C.USER_RECONNECTED, {
    user_id: member.userId,
    username: member.username,
  }, member.userId);
}

function handlePlaybackAction(ws, payload) {
  const room = rooms.get(ws.roomCode);
  if (!room) return;

  const isHost = ws.userId === room.hostId;
  if (room.controlMode === 'owner' && !isHost) {
    return sendMsg(ws, S2C.ERROR, { code: 'forbidden', message: 'Only the host can control playback' });
  }

  const action = payload.action;
  const now = Date.now();

  let trackChanged = false;

  switch (action) {
    case 'play':
      room.isPlaying = true;
      if (typeof payload.position === 'number') room.position = payload.position;
      break;
    case 'pause':
      room.isPlaying = false;
      if (typeof payload.position === 'number') room.position = payload.position;
      break;
    case 'seek':
      if (typeof payload.position === 'number') room.position = payload.position;
      break;
    case 'set_volume':
      if (typeof payload.volume === 'number') room.volume = payload.volume;
      break;
    case 'change_track':
    case 'skip_next':
    case 'skip_prev':
      if (payload.track_info) room.currentTrack = payload.track_info;
      room.position = typeof payload.position === 'number' ? payload.position : 0;
      room.isPlaying = true;
      trackChanged = true;
      break;
    case 'queue_add':
      if (payload.track_info) {
        if (payload.insert_next) {
          room.queue.unshift(payload.track_info);
        } else {
          room.queue.push(payload.track_info);
        }
      }
      break;
    case 'queue_remove':
      if (payload.track_id) {
        room.queue = room.queue.filter((t) => t.id !== payload.track_id);
      }
      break;
    case 'queue_clear':
      room.queue = [];
      break;
    case 'sync_queue':
      if (Array.isArray(payload.queue)) {
        room.queue = payload.queue;
      }
      break;
  }

  room.lastUpdate = now;

  // Stamped with from_user_id and server_time
  const broadcastPayload = {
    ...payload,
    from_user_id: ws.userId,
    server_time: now,
  };

  // Broadcast to all room members
  room.broadcast(S2C.SYNC_PLAYBACK, broadcastPayload);

  // If track changed, handle buffer readiness
  if (trackChanged && room.currentTrack?.id) {
    startBufferWait(room, room.currentTrack.id);
  }
}

function startBufferWait(room, trackId) {
  if (room.bufferWait?.timeoutTimer) {
    clearTimeout(room.bufferWait.timeoutTimer);
  }

  const waitingFor = new Set();
  for (const [uid, u] of room.users.entries()) {
    if (u.isConnected) waitingFor.add(uid);
  }

  // If only 1 member, no buffer wait needed
  if (waitingFor.size <= 1) {
    room.bufferWait = null;
    return;
  }

  const timeoutTimer = setTimeout(() => {
    if (room.bufferWait && room.bufferWait.trackId === trackId) {
      console.log(`[Room ${room.roomCode}] Buffer wait timeout for track ${trackId}`);
      room.bufferWait = null;
      room.broadcast(S2C.BUFFER_COMPLETE, { track_id: trackId });
    }
  }, BUFFER_TIMEOUT_MS);

  room.bufferWait = { trackId, waitingFor, timeoutTimer };

  room.broadcast(S2C.BUFFER_WAIT, {
    track_id: trackId,
    waiting_for: Array.from(waitingFor),
  });
}

function handleBufferReady(ws, payload) {
  const room = rooms.get(ws.roomCode);
  if (!room || !room.bufferWait) return;

  if (room.bufferWait.trackId === payload.track_id) {
    room.bufferWait.waitingFor.delete(ws.userId);
    if (room.bufferWait.waitingFor.size === 0) {
      clearTimeout(room.bufferWait.timeoutTimer);
      room.bufferWait = null;
      room.broadcast(S2C.BUFFER_COMPLETE, { track_id: payload.track_id });
    }
  }
}

function handleRequestSync(ws) {
  const room = rooms.get(ws.roomCode);
  if (!room) return;

  const now = Date.now();
  let currentPos = room.position;
  if (room.isPlaying) {
    currentPos += (now - room.lastUpdate);
  }

  sendMsg(ws, S2C.SYNC_STATE, {
    current_track: room.currentTrack,
    is_playing: room.isPlaying,
    position: currentPos,
    last_update: now,
    queue: room.queue,
    volume: room.volume,
    control_mode: room.controlMode,
    expires_at: room.expiresAt,
  });
}

function handleSetControlMode(ws, payload) {
  const room = rooms.get(ws.roomCode);
  if (!room) return;

  if (ws.userId !== room.hostId) {
    return sendMsg(ws, S2C.ERROR, { code: 'forbidden', message: 'Only host can change control mode' });
  }

  const mode = payload.control_mode;
  if (mode !== 'owner' && mode !== 'everyone') {
    return sendMsg(ws, S2C.ERROR, { code: 'bad_request', message: 'Invalid control mode' });
  }

  room.controlMode = mode;
  console.log(`[Room ${room.roomCode}] Control mode changed to ${mode}`);

  room.broadcast(S2C.CONTROL_MODE_CHANGED, {
    control_mode: mode,
  });
}

function handleSuggestTrack(ws, payload) {
  const room = rooms.get(ws.roomCode);
  if (!room) return;

  const member = room.users.get(ws.userId);
  if (!member) return;

  const trackInfo = payload.track_info;
  if (!trackInfo || !trackInfo.id || !trackInfo.title) {
    return sendMsg(ws, S2C.ERROR, { code: 'bad_request', message: 'track_info required' });
  }

  const suggestionId = crypto.randomUUID();
  room.pendingSuggestions.set(suggestionId, {
    suggestionId,
    fromUserId: member.userId,
    fromUsername: member.username,
    trackInfo,
  });

  const hostSockets = room.getHostSockets();
  for (const hostWs of hostSockets) {
    sendMsg(hostWs, S2C.SUGGESTION_RECEIVED, {
      suggestion_id: suggestionId,
      from_user_id: member.userId,
      from_username: member.username,
      track_info: trackInfo,
    });
  }
}

function handleApproveSuggestion(ws, payload) {
  const room = rooms.get(ws.roomCode);
  if (!room) return;

  if (ws.userId !== room.hostId) {
    return sendMsg(ws, S2C.ERROR, { code: 'forbidden', message: 'Only host can approve suggestions' });
  }

  const suggestion = room.pendingSuggestions.get(payload.suggestion_id);
  if (!suggestion) return;

  room.pendingSuggestions.delete(payload.suggestion_id);

  const enrichedTrack = {
    ...suggestion.trackInfo,
    suggested_by: suggestion.fromUsername,
  };

  room.queue.push(enrichedTrack);

  room.broadcast(S2C.SUGGESTION_APPROVED, {
    suggestion_id: suggestion.suggestionId,
    track_info: enrichedTrack,
  });

  room.broadcast(S2C.SYNC_PLAYBACK, {
    action: 'queue_add',
    track_info: enrichedTrack,
    from_user_id: room.hostId,
    server_time: Date.now(),
  });
}

function handleRejectSuggestion(ws, payload) {
  const room = rooms.get(ws.roomCode);
  if (!room) return;

  if (ws.userId !== room.hostId) {
    return sendMsg(ws, S2C.ERROR, { code: 'forbidden', message: 'Only host can reject suggestions' });
  }

  const suggestion = room.pendingSuggestions.get(payload.suggestion_id);
  if (!suggestion) return;

  room.pendingSuggestions.delete(payload.suggestion_id);

  const suggestingUser = room.users.get(suggestion.fromUserId);
  if (suggestingUser && suggestingUser.ws) {
    sendMsg(suggestingUser.ws, S2C.SUGGESTION_REJECTED, {
      suggestion_id: suggestion.suggestionId,
      reason: payload.reason || 'Host rejected suggestion',
    });
  }
}

function handleChat(ws, payload) {
  const room = rooms.get(ws.roomCode);
  if (!room) return;

  const member = room.users.get(ws.userId);
  if (!member) return;

  const chatMsg = {
    user_id: member.userId,
    username: member.username,
    message: payload.message || '',
    timestamp: Date.now(),
    reply_to: payload.reply_to || null,
  };

  room.broadcast(S2C.CHAT, chatMsg);
}

function handleKickUser(ws, payload) {
  const room = rooms.get(ws.roomCode);
  if (!room) return;

  if (ws.userId !== room.hostId) {
    return sendMsg(ws, S2C.ERROR, { code: 'forbidden', message: 'Only host can kick users' });
  }

  const targetUserId = payload.user_id;
  const targetMember = room.users.get(targetUserId);
  if (!targetMember) return;

  const reason = payload.reason || 'Kicked by host';

  if (targetMember.ws) {
    sendMsg(targetMember.ws, S2C.KICKED, { reason });
    try {
      targetMember.ws.close(1000, reason);
    } catch { /* ignore */ }
  }

  room.blockedUserIds.add(targetUserId);
  room.blockedUsernames.add(targetMember.username);
  tokenIndex.delete(targetMember.sessionToken);
  room.users.delete(targetUserId);

  room.broadcast(S2C.USER_LEFT, {
    user_id: targetUserId,
    username: targetMember.username,
  });
}

function handleTransferHost(ws, payload) {
  const room = rooms.get(ws.roomCode);
  if (!room) return;

  if (ws.userId !== room.hostId) {
    return sendMsg(ws, S2C.ERROR, { code: 'forbidden', message: 'Only host can transfer host role' });
  }

  const newHostId = payload.new_host_id;
  const targetMember = room.users.get(newHostId);
  if (!targetMember || !targetMember.isConnected) {
    return sendMsg(ws, S2C.ERROR, { code: 'bad_request', message: 'Target member not found or disconnected' });
  }

  const oldHost = room.users.get(room.hostId);
  if (oldHost) oldHost.role = 'guest';

  room.hostId = newHostId;
  targetMember.role = 'host';

  console.log(`[Room ${room.roomCode}] Host transferred to ${targetMember.username} (${newHostId})`);

  room.broadcast(S2C.HOST_CHANGED, {
    new_host_id: newHostId,
    new_host_name: targetMember.username,
  });
}

function handleExtendSession(ws) {
  const room = rooms.get(ws.roomCode);
  if (!room) return;

  if (ws.userId !== room.hostId) {
    return sendMsg(ws, S2C.ERROR, { code: 'forbidden', message: 'Only host can extend session' });
  }

  if (room.extensionsUsed >= MAX_EXTENSIONS) {
    return sendMsg(ws, S2C.ERROR, { code: 'max_extensions', message: 'No session extensions remaining' });
  }

  room.extensionsUsed++;
  room.expiresAt += Math.round(EXTENSION_HOURS * 3600 * 1000);
  room.warned = false;
  room.scheduleTimers();

  sendMsg(ws, S2C.SYNC_STATE, {
    current_track: room.currentTrack,
    is_playing: room.isPlaying,
    position: room.position,
    last_update: room.lastUpdate,
    queue: room.queue,
    volume: room.volume,
    control_mode: room.controlMode,
    expires_at: room.expiresAt,
  });
}

function handleLeaveRoom(ws) {
  handleSocketDisconnect(ws, true);
}

function handleSocketDisconnect(ws, explicitLeave = false) {
  if (!ws.roomCode) return;
  const room = rooms.get(ws.roomCode);
  if (!room) return;

  // 1. Remove from pending join requests if waiting
  if (ws.userId && room.pendingJoinRequests.has(ws.userId)) {
    room.pendingJoinRequests.delete(ws.userId);
    return;
  }

  // 2. Member disconnect
  const member = ws.userId ? room.users.get(ws.userId) : null;
  if (!member) return;

  if (explicitLeave) {
    console.log(`[Room ${room.roomCode}] User left: ${member.username} (${member.userId})`);
    tokenIndex.delete(member.sessionToken);
    room.users.delete(member.userId);
    room.broadcast(S2C.USER_LEFT, {
      user_id: member.userId,
      username: member.username,
    });

    if (room.hostId === member.userId) {
      room.promoteNextHost();
    }
  } else {
    // Temporary drop
    console.log(`[Room ${room.roomCode}] User disconnected: ${member.username} (${member.userId})`);
    member.isConnected = false;
    room.broadcast(S2C.USER_DISCONNECTED, {
      user_id: member.userId,
      username: member.username,
    });

    if (room.hostId === member.userId) {
      console.log(`[Room ${room.roomCode}] Host disconnected, starting ${HOST_GRACE_MS / 1000}s grace timer`);
      if (room.hostGraceTimer) clearTimeout(room.hostGraceTimer);
      room.hostGraceTimer = setTimeout(() => {
        if (!member.isConnected && room.hostId === member.userId) {
          room.promoteNextHost();
        }
      }, HOST_GRACE_MS);
    }
  }

  room.checkEmptyRoom();
}

// --- Graceful Shutdown ---
function cleanupAndExit() {
  console.log('[Server] Shutting down...');
  clearInterval(pingInterval);
  for (const room of rooms.values()) {
    room.closeRoom('Server shutdown');
  }
  server.close(() => {
    process.exit(0);
  });
}

process.on('SIGINT', cleanupAndExit);
process.on('SIGTERM', cleanupAndExit);

// --- Start Server ---
server.listen(PORT, HOST, () => {
  console.log(`=============================================`);
  console.log(`ARSA Listen Together Server running!`);
  console.log(`HTTP Endpoint:      http://${HOST}:${PORT}`);
  console.log(`WebSocket Endpoint: ws://${HOST}:${PORT}`);
  console.log(`Allocate Room:      POST http://${HOST}:${PORT}/api/rooms`);
  console.log(`Test UI:            http://${HOST}:${PORT}/test`);
  console.log(`Health Check:       http://${HOST}:${PORT}/health`);
  console.log(`=============================================`);
});

export { app, server, rooms };
