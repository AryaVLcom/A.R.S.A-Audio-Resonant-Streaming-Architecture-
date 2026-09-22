/**
 * ARSA Listen Together — Comprehensive Protocol Test Suite
 *
 * Usage:
 *   node test-suite.mjs [http-base-url]
 *   (defaults to http://localhost:3000)
 */

const base = process.argv[2] || 'http://localhost:3000';
const wsBase = base.replace(/^http/, 'ws');

let passed = 0;
let failed = 0;

function assert(ok, msg) {
  if (ok) {
    console.log(`\x1b[32m✔ PASS\x1b[0m  ${msg}`);
    passed++;
  } else {
    console.error(`\x1b[31m✖ FAIL\x1b[0m  ${msg}`);
    failed++;
  }
}

function openSocket(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    ws.inbox = [];
    ws.addEventListener('message', (e) => {
      try {
        ws.inbox.push(JSON.parse(e.data));
      } catch (err) {
        console.error('Failed to parse WS msg:', e.data);
      }
    });
    ws.addEventListener('open', () => resolve(ws));
    ws.addEventListener('error', (err) => reject(err));
  });
}

function send(ws, type, payload) {
  ws.send(JSON.stringify(payload === undefined ? { type } : { type, payload }));
}

async function waitFor(ws, type, filterOrTimeout = 4000, timeoutMs = 4000) {
  let predicate = null;
  if (typeof filterOrTimeout === 'function') {
    predicate = filterOrTimeout;
  } else if (typeof filterOrTimeout === 'number') {
    timeoutMs = filterOrTimeout;
  }
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const idx = ws.inbox.findIndex((m) => m.type === type && (!predicate || predicate(m)));
    if (idx !== -1) {
      return ws.inbox.splice(idx, 1)[0];
    }
    await new Promise((r) => setTimeout(r, 40));
  }
  return null;
}

async function run() {
  console.log(`\nStarting ARSA Listen Together Test Suite against ${base}...\n`);

  // --- 1. HTTP Endpoints ---
  console.log('--- Test Suite 1: HTTP API Endpoints ---');

  // Health check
  const healthRes = await fetch(`${base}/health`);
  const health = await healthRes.json();
  assert(healthRes.ok && health.ok === true && health.version === '2.0.0', 'GET /health returns 200 and version 2.0.0');

  // Allocate via /api/rooms
  const alloc1Res = await fetch(`${base}/api/rooms`, { method: 'POST' });
  const alloc1 = await alloc1Res.json();
  assert(alloc1Res.ok && typeof alloc1.room_code === 'string' && alloc1.room_code.length === 6, `POST /api/rooms allocates 6-char code (${alloc1.room_code})`);

  // Allocate via legacy /allocate alias
  const alloc2Res = await fetch(`${base}/allocate`, { method: 'POST' });
  const alloc2 = await alloc2Res.json();
  assert(alloc2Res.ok && typeof alloc2.room_code === 'string' && alloc2.room_code.length === 6, `POST /allocate returns code (${alloc2.room_code})`);

  // Test UI check
  const testUiRes = await fetch(`${base}/test`);
  assert(testUiRes.ok && testUiRes.headers.get('content-type').includes('text/html'), 'GET /test returns HTML test page');

  // --- 2. WebSocket Connection & Room Creation ---
  console.log('\n--- Test Suite 2: WebSocket Connection & Host Creation ---');

  const roomCode = alloc1.room_code;
  const hostWs = await openSocket(`${wsBase}/room/${roomCode}`);
  send(hostWs, 'create_room', { username: 'AliceHost' });

  const roomCreated = await waitFor(hostWs, 'room_created');
  assert(!!roomCreated, 'Host receives room_created');
  assert(roomCreated?.payload?.room_code === roomCode, 'room_created matches allocated code');
  assert(typeof roomCreated?.payload?.user_id === 'string', 'room_created returns user_id');
  assert(typeof roomCreated?.payload?.session_token === 'string', 'room_created returns session_token');
  assert(roomCreated?.payload?.state?.host_id === roomCreated?.payload?.user_id, 'Host is correctly set in room state');

  const hostUserId = roomCreated?.payload?.user_id;
  const hostToken = roomCreated?.payload?.session_token;

  // Heartbeat ping -> pong
  send(hostWs, 'ping');
  const pong = await waitFor(hostWs, 'pong');
  assert(!!pong, 'ping -> pong works');

  // --- 3. Guest Join & Approval Flow ---
  console.log('\n--- Test Suite 3: Guest Join & Host Approval ---');

  const guest1Ws = await openSocket(`${wsBase}/room/${roomCode}`);
  send(guest1Ws, 'join_room', { room_code: roomCode, username: 'BobGuest' });

  const joinReq = await waitFor(hostWs, 'join_request');
  assert(joinReq?.payload?.username === 'BobGuest', 'Host receives join_request with guest username');
  assert(typeof joinReq?.payload?.user_id === 'string', 'join_request provides user_id');

  const guest1UserId = joinReq?.payload?.user_id;

  // Host approves join
  send(hostWs, 'approve_join', { user_id: guest1UserId });

  const joinApproved = await waitFor(guest1Ws, 'join_approved');
  assert(!!joinApproved, 'Guest receives join_approved');
  assert(joinApproved?.payload?.room_code === roomCode, 'join_approved matches room code');
  assert(joinApproved?.payload?.user_id === guest1UserId, 'join_approved user_id matches');
  assert(typeof joinApproved?.payload?.session_token === 'string', 'join_approved returns session token');
  assert(joinApproved?.payload?.state?.control_mode === 'owner', 'default control_mode is owner');

  const guest1Token = joinApproved?.payload?.session_token;

  const userJoined = await waitFor(hostWs, 'user_joined');
  assert(userJoined?.payload?.user_id === guest1UserId, 'Host receives user_joined event');

  // --- 4. Control Modes & Playback Relay ---
  console.log('\n--- Test Suite 4: Control Modes & Playback Actions ---');

  // In owner mode, guest action should be forbidden
  send(guest1Ws, 'playback_action', { action: 'play' });
  const forbiddenErr = await waitFor(guest1Ws, 'error');
  assert(forbiddenErr?.payload?.code === 'forbidden', 'Guest playback rejected with forbidden in owner mode');

  // Host flips mode to everyone
  send(hostWs, 'set_control_mode', { control_mode: 'everyone' });
  const modeChanged = await waitFor(guest1Ws, 'control_mode_changed');
  assert(modeChanged?.payload?.control_mode === 'everyone', 'control_mode_changed broadcast to guest');

  // Now guest sends playback action
  send(guest1Ws, 'playback_action', { action: 'pause', position: 15400 });
  const syncPause = await waitFor(hostWs, 'sync_playback', (m) => m.payload?.action === 'pause');
  assert(syncPause?.payload?.action === 'pause', 'playback_action relayed to host');
  assert(syncPause?.payload?.position === 15400, 'playback position preserved');
  assert(syncPause?.payload?.from_user_id === guest1UserId, 'server stamped from_user_id = guest');
  assert(typeof syncPause?.payload?.server_time === 'number', 'server stamped server_time');

  // Track change with metadata
  send(hostWs, 'playback_action', {
    action: 'change_track',
    track_id: 'track-99',
    position: 0,
    track_info: {
      id: 'track-99',
      title: 'Bohemian Rhapsody',
      artist: 'Queen',
      album: 'A Night at the Opera',
      duration: 354000,
    },
  });

  const syncTrack = await waitFor(guest1Ws, 'sync_playback', (m) => m.payload?.action === 'change_track');
  assert(syncTrack?.payload?.track_info?.title === 'Bohemian Rhapsody', 'track_info metadata correctly relayed');
  assert(syncTrack?.payload?.from_user_id === hostUserId, 'from_user_id = host');

  // Verify room state sync request
  send(guest1Ws, 'request_sync');
  const syncState = await waitFor(guest1Ws, 'sync_state');
  assert(syncState?.payload?.current_track?.id === 'track-99', 'sync_state returns current_track');
  assert(syncState?.payload?.control_mode === 'everyone', 'sync_state returns current control_mode');

  // --- 5. Track Suggestions Flow ---
  console.log('\n--- Test Suite 5: Track Suggestions ---');

  send(guest1Ws, 'suggest_track', {
    track_info: {
      id: 'sug-123',
      title: 'Starman',
      artist: 'David Bowie',
      duration: 256000,
    },
  });

  const sugReceived = await waitFor(hostWs, 'suggestion_received');
  assert(sugReceived?.payload?.from_username === 'BobGuest', 'Host receives suggestion_received from guest');
  assert(sugReceived?.payload?.track_info?.title === 'Starman', 'Suggestion track title matches');

  const sugId = sugReceived?.payload?.suggestion_id;

  // Host approves suggestion
  send(hostWs, 'approve_suggestion', { suggestion_id: sugId });
  const sugApproved = await waitFor(guest1Ws, 'suggestion_approved');
  assert(sugApproved?.payload?.suggestion_id === sugId, 'suggestion_approved broadcast');

  const queueAdd = await waitFor(guest1Ws, 'sync_playback', (m) => m.payload?.action === 'queue_add');
  assert(queueAdd?.payload?.action === 'queue_add', 'sync_playback with queue_add broadcast on approval');
  assert(queueAdd?.payload?.track_info?.suggested_by === 'BobGuest', 'suggested_by author preserved in track metadata');

  // --- 6. Chat Messaging ---
  console.log('\n--- Test Suite 6: Chat Messaging ---');

  send(guest1Ws, 'chat', { message: 'Hello Alice!' });
  const chatMsg = await waitFor(hostWs, 'chat');
  assert(chatMsg?.payload?.message === 'Hello Alice!', 'Chat message relayed to host');
  assert(chatMsg?.payload?.username === 'BobGuest', 'Chat message includes sender username');
  assert(typeof chatMsg?.payload?.timestamp === 'number', 'Chat message includes timestamp');

  // --- 7. Reconnection with Session Token ---
  console.log('\n--- Test Suite 7: Reconnect with Session Token ---');

  // Close guest socket
  guest1Ws.close();
  const userDisc = await waitFor(hostWs, 'user_disconnected');
  assert(userDisc?.payload?.user_id === guest1UserId, 'Host notified of temporary user_disconnected');

  // Reconnect with same session token
  const guest1ReconnectedWs = await openSocket(`${wsBase}/room/${roomCode}`);
  send(guest1ReconnectedWs, 'reconnect', { session_token: guest1Token });

  const reconnected = await waitFor(guest1ReconnectedWs, 'reconnected');
  assert(!!reconnected, 'Guest receives reconnected response');
  assert(reconnected?.payload?.user_id === guest1UserId, 'Reconnected response returns same user_id');
  assert(reconnected?.payload?.state?.room_code === roomCode, 'Reconnected response includes current room state');

  const userReconnected = await waitFor(hostWs, 'user_reconnected');
  assert(userReconnected?.payload?.user_id === guest1UserId, 'Host receives user_reconnected notification');

  // --- 8. Join Rejection Flow ---
  console.log('\n--- Test Suite 8: Join Rejection Flow ---');

  const guest2Ws = await openSocket(`${wsBase}/room/${roomCode}`);
  send(guest2Ws, 'join_room', { room_code: roomCode, username: 'Charlie' });

  const joinReq2 = await waitFor(hostWs, 'join_request');
  assert(joinReq2?.payload?.username === 'Charlie', 'Host receives join_request from Charlie');

  send(hostWs, 'reject_join', { user_id: joinReq2?.payload?.user_id, reason: 'Room is private right now' });
  const joinRejected = await waitFor(guest2Ws, 'join_rejected');
  assert(joinRejected?.payload?.reason === 'Room is private right now', 'Guest receives join_rejected with custom reason');

  // --- 9. Kick User ---
  console.log('\n--- Test Suite 9: Kick User ---');

  send(hostWs, 'kick_user', { user_id: guest1UserId, reason: 'Test kick' });
  const kicked = await waitFor(guest1ReconnectedWs, 'kicked');
  assert(kicked?.payload?.reason === 'Test kick', 'Target user receives kicked with reason');

  // Attempting reconnect with kicked token must fail
  const kickedReconnectWs = await openSocket(`${wsBase}/room/${roomCode}`);
  send(kickedReconnectWs, 'reconnect', { session_token: guest1Token });
  const kickedFail = await waitFor(kickedReconnectWs, 'error');
  assert(kickedFail?.payload?.code === 'session_not_found', 'Kicked user cannot reconnect with deleted token');
  kickedReconnectWs.close();

  // --- 10. Clean Cleanup ---
  console.log('\n--- Test Suite 10: Clean Shutdown & Cleanup ---');
  hostWs.close();

  console.log('\n=============================================');
  if (failed === 0) {
    console.log(`\x1b[32m✔ ALL ${passed} CHECKS PASSED!\x1b[0m`);
    process.exit(0);
  } else {
    console.error(`\x1b[31m✖ ${failed} CHECKS FAILED (${passed} passed)\x1b[0m`);
    process.exit(1);
  }
}

run().catch((err) => {
  console.error('\nFatal test runner error:', err);
  process.exit(1);
});
