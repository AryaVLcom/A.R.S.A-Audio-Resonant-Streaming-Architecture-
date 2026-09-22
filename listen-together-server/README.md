# ARSA Listen Together — Self-Hosted Backend Server

A lightweight, self-hosted Node.js + Express + `ws` WebSocket backend for the **ARSA** (`com.arsa.aryavl`) Android app's **Listen Together** shared listening feature.

The server speaks the exact JSON wire protocol expected by the client (`Protocol.kt` / `ListenTogetherClient.kt`) with zero app modifications needed.

---

## Features

- **Express HTTP API**:
  - `POST /api/rooms` and `POST /allocate`: Generates 6-character room codes.
  - `GET /health`: Uptime, active room count, and active user metrics.
  - `GET /test`: Built-in browser participant client for testing without two physical phones.
  - `GET /`: Info & endpoint documentation.
- **Raw WebSocket Server (`ws`)**:
  - Direct connection to `/room/<CODE>`, `/ws`, or root `/`.
  - Supports heartbeat ping/pong, connection lifecycle, and error recovery.
- **Full In-Memory Room State**:
  - Host & guest roles with approval flow (`join_request` -> `approve_join` / `reject_join`).
  - Control modes: `owner` (host controls playback) and `everyone` (all participants control playback).
  - Authoritative playback state sync (`play`, `pause`, `seek`, `change_track`, queue operations) with `from_user_id` loop prevention and `server_time` drift correction.
  - Reconnection support with `session_token` (auto-reconnect without re-approval).
  - Real-time chat relay with replies.
  - Track suggestions: guests suggest songs, host approves/rejects, approved songs automatically added to queue.
  - Buffer synchronization (`buffer_wait` / `buffer_complete`) when changing tracks.
  - Host disconnect grace period (90 seconds) before automatic promotion of the next oldest connected member.
  - Room lifecycle & TTL (configurable room expiry, warning notifications, and session extensions).

---

## Quick Start (Local)

```bash
cd listen-together-server
npm install
npm start
```

The server starts on `http://0.0.0.0:3000`.

To run the automated test suites:
```bash
# Run the client protocol smoke test:
npm test

# Run the comprehensive feature test suite:
npm run test:full
```

---

## Connecting from the ARSA Android App

1. In the ARSA app, go to:
   **Settings → Integrations → Listen Together → Custom Server URL**
2. Enter your server's WebSocket URL:
   - Local network (for testing on LAN): `ws://192.168.x.x:3000`
   - Public server with SSL: `wss://your-domain.com` (or `wss://<app-name>.onrender.com`, `wss://<app-name>.hf.space`)
3. Return to the main screen, open **Listen Together**, and tap **Create Room** or **Join Room**.

---

### 2. Deploy to Render (Recommended & Free)

Render provides free SSL (`https://` and `wss://`) out of the box with WebSocket support.

#### Option A: One-Click / Web Service (Manual)
1. Push this folder (`listen-together-server`) or your repository to **GitHub** or **GitLab**.
2. Log into [Render Dashboard](https://dashboard.render.com).
3. Click **New +** → **Web Service**.
4. Connect your repository and configure:
   - **Name**: `arsa-sync` (or your choice)
   - **Root Directory**: `listen-together-server` (leave empty if this repo is standalone)
   - **Runtime**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Instance Type**: `Free`
5. Under **Advanced**:
   - **Health Check Path**: `/health`
6. Click **Deploy Web Service**.

#### Option B: Render Blueprint
If you have `render.yaml` in your repo:
1. In Render, click **New +** → **Blueprint**.
2. Connect your repo and Render will automatically apply the settings from [`render.yaml`](./render.yaml).

Once deployed, Render gives you a URL like:
`https://arsa-sync.onrender.com`

Your WebSocket address for the ARSA app is:
`wss://arsa-sync.onrender.com`

> **Note on Render Free Tier**: Free tier instances spin down after 15 minutes of inactivity. When you connect after it sleeps, it takes ~30–50 seconds for the initial wake-up. You can keep it active with a free ping monitor (e.g. UptimeRobot or cron pinging `https://<your-service>.onrender.com/health` every 10 minutes) or upgrade to Render Starter.

### 3. Docker / VPS
Build and run the container:
```bash
docker build -t arsa-listen-together .
docker run -d -p 3000:3000 --name arsa-sync arsa-listen-together
```
Set up Nginx or Caddy with SSL for `wss://your-domain.com`.

### 4. Hugging Face Spaces
- Create a new Space with Docker SDK.
- Push the repository files (`Dockerfile`, `package.json`, `server.js`).
- Port `3000` will be exposed with HTTPS/WSS automatically.

---

## Configuration / Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | Server listening port |
| `HOST` | `0.0.0.0` | Bind address |
| `ROOM_TTL_HOURS` | `6` | Room lifetime in hours before automatic expiration |
| `MAX_EXTENSIONS` | `2` | Number of times the host may extend the room |
| `EXTENSION_HOURS` | `3` | Hours added per session extension |
| `MAX_MEMBERS` | `20` | Maximum participants allowed per room |

---

## License

GPL-3.0 (same as ARSA project).
