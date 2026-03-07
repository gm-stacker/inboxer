---
name: docker-conventions
description: Use this skill for any task involving Docker, containerisation, 
docker-compose, Dockerfiles, deployment scripts, or environment variable 
configuration for the Inboxer/KAE project.
---

# Docker Conventions Skill

## Mission
Ensure all Docker configuration for the KAE project is consistent, 
secure, and production-appropriate. The app consists of two containers 
(C# backend, React frontend) with a host-mounted Obsidian vault volume. 
All configuration must work identically on macOS (local dev) and 
Unraid (network deployment).

## Project stack
- Backend: C# .NET 10, ASP.NET Core Web API
- Frontend: React + Vite + TypeScript
- Vault: local folder of .md files, mounted as a host volume
- AI: Gemini API (external, key via environment variable)
- No database — vault folder is the only persistent data store

---

## Backend Dockerfile conventions

Always use multi-stage builds. Never use a single-stage build for .NET.
```dockerfile
# Stage 1: Build
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY ["Backend.csproj", "./"]
RUN dotnet restore
COPY . .
RUN dotnet publish -c Release -o /app/publish

# Stage 2: Runtime
FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
WORKDIR /app
COPY --from=build /app/publish .
EXPOSE 5000
ENV ASPNETCORE_URLS=http://+:5000
ENTRYPOINT ["dotnet", "Backend.dll"]
```

### Backend rules
- Always use `mcr.microsoft.com/dotnet/sdk:10.0` for build stage
- Always use `mcr.microsoft.com/dotnet/aspnet:10.0` for runtime stage — 
  never use the SDK image at runtime (it is 3x larger)
- Set `ASPNETCORE_URLS=http://+:5000` — never use HTTPS inside the 
  container for local/Unraid deployment
- Never hardcode the Gemini API key — always read from environment variable
- Never hardcode the vault path — always read from environment variable
- The vault path environment variable name is `VAULT_PATH`
- The Gemini API key environment variable name is `GEMINI_API_KEY`
- `VaultWatcherService` must receive `VAULT_PATH` at runtime, not build time
- Backend .dockerignore must exclude: `obj/`, `bin/`, `*.user`, 
  `*.suo`, `.vs/`, `appsettings.Development.json`

### Backend environment variables (all required)
```
GEMINI_API_KEY=        # Gemini API key, never baked into image
VAULT_PATH=            # Absolute path to vault inside container 
                         (e.g. /vault)
ASPNETCORE_ENVIRONMENT=Production
ASPNETCORE_URLS=http://+:5000
```

---

## Frontend Dockerfile conventions

Use a two-stage build: Vite build stage, then serve with a lightweight 
static server. Do NOT use nginx for local/Unraid deployment — use 
`vite preview` or `serve` to keep it simple.
```dockerfile
# Stage 1: Build
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ARG VITE_API_URL=http://localhost:5000
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

# Stage 2: Serve
FROM node:20-alpine AS runtime
WORKDIR /app
RUN npm install -g serve
COPY --from=build /app/dist ./dist
EXPOSE 5173
CMD ["serve", "-s", "dist", "-l", "5173"]
```

### Frontend rules
- Always use `node:20-alpine` — never use the full node image
- The backend API URL is a Vite build-time variable: `VITE_API_URL`
- `VITE_API_URL` must be passed as a Docker build ARG so it is baked 
  into the static build output — it cannot be injected at runtime for 
  a static Vite build
- Default value for `VITE_API_URL` should be `http://localhost:5000` 
  for local dev
- For Unraid deployment, `VITE_API_URL` will be the Unraid server's 
  local IP (e.g. `http://192.168.1.x:5000`)
- Never use nginx unless explicitly requested — `serve` is sufficient 
  and easier to debug
- Frontend .dockerignore must exclude: `node_modules/`, `dist/`, 
  `.env.local`, `.env.*.local`
- TypeScript strict mode treats unused variables as build errors 
  in production. All declared variables and functions in the 
  frontend must either be used or prefixed with underscore.

### Frontend environment variables
```
VITE_API_URL=          # Backend API base URL, build-time only
                         Default: http://localhost:5000
```

---

## docker-compose.yml conventions
```yaml
version: '3.8'

services:
  backend:
    build:
      context: ./Backend
      dockerfile: Dockerfile
    ports:
      - "5000:5000"
    environment:
      - GEMINI_API_KEY=${GEMINI_API_KEY}
      - VAULT_PATH=/vault
      - ASPNETCORE_ENVIRONMENT=Production
      - ASPNETCORE_URLS=http://+:5000
    volumes:
      - ${OBSIDIAN_VAULT_PATH}:/vault:rw
    restart: unless-stopped

  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
      args:
        - VITE_API_URL=${VITE_API_URL:-http://localhost:5000}
    ports:
      - "5173:5173"
    depends_on:
      - backend
    restart: unless-stopped
```

### docker-compose rules
- Always use `restart: unless-stopped` — never `always` (prevents 
  boot loops during development) and never omit restart policy
- The vault volume always mounts to `/vault` inside the backend 
  container — this is the fixed internal path
- The host-side vault path comes from `OBSIDIAN_VAULT_PATH` in `.env`
- Volume mount must always be `:rw` — VaultWatcherService writes 
  frontmatter back to vault files
- `depends_on` ensures backend starts before frontend but does not 
  guarantee the backend API is ready — this is acceptable for MVP
- Never put secrets directly in docker-compose.yml — always reference 
  from `.env` via `${VARIABLE_NAME}`
- Never commit docker-compose.override.yml to version control

---

## .env file conventions

### .env.example (commit this to version control)
```
# KAE / Inboxer Environment Configuration
# Copy this file to .env and fill in your values
# Never commit .env to version control

# Gemini API Key (required)
GEMINI_API_KEY=your_gemini_api_key_here

# Absolute path to your Obsidian vault on the HOST machine
# macOS example:  /Users/yourname/Documents/ObsidianVault
# Unraid example: /mnt/user/obsidian-vault
OBSIDIAN_VAULT_PATH=/path/to/your/obsidian/vault

# Backend API URL as seen from the browser (not from inside Docker)
# Local dev:  http://localhost:5000
# Unraid:     http://192.168.1.xxx:5000
VITE_API_URL=http://localhost:5000
```

### .env rules
- `.env` must always be in `.gitignore` — never committed
- `.env.example` must always be committed and kept up to date
- All three variables are required — the app will not function 
  without any of them
- Never add a `VAULT_PATH` variable to .env — this is the internal 
  container path (`/vault`) and is hardcoded in docker-compose.yml. 
  Only `OBSIDIAN_VAULT_PATH` (the host path) goes in .env

---

## deploy.sh conventions
```bash
#!/bin/bash
set -e

echo "🛑 Stopping existing containers..."
docker compose down

echo "🔨 Rebuilding images..."
docker compose build --no-cache

echo "🚀 Starting stack..."
docker compose up -d

echo ""
echo "✅ KAE is running:"
echo "   Frontend: http://localhost:5173"
echo "   Backend:  http://localhost:5000"
```

### deploy.sh rules
- Always use `set -e` — script must exit immediately on any error
- Always use `--no-cache` on rebuild to prevent stale layer issues
- Always run detached (`-d`) — never block the terminal
- Script must be chmod +x before first use: `chmod +x deploy.sh`
- Never use `docker-compose` (v1 syntax) — always use `docker compose` 
  (v2 syntax, no hyphen)
- Add a logs convenience command at the end:
```bash
  echo "   Logs: docker compose logs -f"
```

---

## Unraid deployment notes (for future reference)
- Copy `docker-compose.yml` and `.env` to Unraid via SCP or file share
- Update `OBSIDIAN_VAULT_PATH` in `.env` to the Unraid vault path
- Update `VITE_API_URL` in `.env` to the Unraid server's local IP
- The frontend Dockerfile must be rebuilt with the new `VITE_API_URL` 
  ARG since it is baked in at build time — a simple `.env` change is 
  not sufficient for the frontend
- Unraid uses Docker Compose via the Community Apps plugin — the same 
  compose file works without modification
- Recommended Unraid vault location: `/mnt/user/appdata/kae-vault/`
- Do not use Unraid's template system — use Compose directly

---

## What never to do
- Never use the SDK image at runtime for .NET
- Never hardcode API keys, vault paths, or IP addresses in any 
  Dockerfile or docker-compose.yml
- Never mount the vault as read-only (`:ro`) — VaultWatcherService 
  must write back
- Never use `docker-compose` v1 syntax (hyphenated)
- Never commit `.env` to version control
- Never bake `VITE_API_URL` as a hardcoded value — always pass 
  as a build ARG from .env
- Never use nginx unless explicitly requested
- Never skip `--no-cache` in the deploy script during MVP phase