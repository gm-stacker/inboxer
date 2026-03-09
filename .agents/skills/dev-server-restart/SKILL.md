---
name: dev-server-restart
description: Use this skill when any task requires restarting the frontend Vite dev server or the backend .NET server. Also use when diagnosing port conflicts or server startup failures.
---

# Dev Server Restart

## DO NOT USE THIS SKILL FOR
- Changes that don't require a server restart
- Docker-based restarts (see docker-conventions skill)

---

## ⚠️ CRITICAL: Never kill Antigravity

`pkill -9 -f "vite|node"` will kill Antigravity itself along with the dev server.
Use the port-targeted commands below instead.

---

## Frontend Restart (Vite on port 5173)

```bash
# Kill only the process on port 5173
lsof -ti:5173 | xargs kill -9 2>/dev/null
sleep 1

# Start in background, log to file
cd /Users/brucechoi/Desktop/inboxer/frontend
nohup npm run dev > /tmp/frontend.log 2>&1 &

# Confirm it's running (wait up to 5s)
sleep 3 && lsof -i:5173 | grep LISTEN
```

Access at: `http://127.0.0.1:5173` — NEVER `localhost:5173`

Never edit `vite.config.ts` while Vite is running.

---

## Backend Restart (.NET on port 5177)

```bash
# Kill existing backend processes
pkill -f "dotnet run|dotnet.*Backend" 2>/dev/null
lsof -ti:5177 | xargs kill -9 2>/dev/null
sleep 1

# Start in background, log to file
cd /Users/brucechoi/Desktop/inboxer/Backend
nohup dotnet run > /tmp/backend.log 2>&1 &
```

⚠️ Do NOT run any command after the `nohup ... &` line.
The `&` detaches the process. Any subsequent command may trigger SIGHUP and silently kill it.

---

## Checking logs

```bash
tail -f /tmp/frontend.log    # watch frontend startup
tail -f /tmp/backend.log     # watch backend startup

# Check for startup errors
grep -i "error\|fail\|exception" /tmp/backend.log | head -20
```

---

## Health checks

```bash
# Frontend responding
curl -s --max-time 3 http://127.0.0.1:5173/ | head -3

# Backend responding
curl -s --max-time 3 http://127.0.0.1:5177/health

# Ports listening
lsof -i:5173 | grep LISTEN
lsof -i:5177 | grep LISTEN
```

---

## Port conflict resolution

```bash
# Find what's on a port
lsof -i:5173
lsof -i:5177

# Kill specifically (replace PID)
kill -9 [PID]
```
