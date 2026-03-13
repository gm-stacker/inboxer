---
name: docker-conventions
description: Use this skill when modifying docker-compose.yml, Dockerfiles, container configuration, environment variables, deployment scripts, or writing the DEPLOYMENT.md guide for Inboxer.
---

# Docker Conventions

## DO NOT USE THIS SKILL FOR
- Non-deployment backend changes
- Frontend CSS or component changes
- Vault operations

---

## Rules

### 1. Remove the `version` field from docker-compose.yml
The `version` field is deprecated in Docker Compose v2 and causes warnings.
It must be removed from `docker-compose.yml`. This is a known pending task.

```yaml
# WRONG
version: "3.8"
services:
  ...

# CORRECT
services:
  ...
```

### 2. Environment variables via .env only
All secrets and configuration go in `.env`. Never hardcode in `docker-compose.yml` or Dockerfiles.

Required `.env` entries:
```
GEMINI_API_KEY=
VAULT_PATH=/vault
GOOGLE_PLACES_API_KEY=     # required for Places enrichment — pending
```

The `.env` file must be in `.gitignore`. Never commit it.

### 3. Volume mounts for the vault
The Obsidian vault is mounted as a read-only volume by default:
```yaml
volumes:
  - ${VAULT_PATH}:/vault:ro
```
Only write-enable the vault volume when a specific vault-write feature is being deployed.

### 4. Health checks
Every service must have a health check:
```yaml
healthcheck:
  test: ["CMD", "curl", "-f", "http://localhost:6130/health"]
  interval: 30s
  timeout: 10s
  retries: 3
```

### 5. Port bindings
- Frontend: `5173:5173` (dev), `80:80` (prod)
- Backend: `6130:6130`
- Never bind `0.0.0.0` in production without explicit firewall configuration

### 6. DEPLOYMENT.md requirements
When writing `DEPLOYMENT.md`, it must include:
1. Prerequisites (Docker version, available ports)
2. `.env` setup with every required key documented
3. First-run steps (exact commands)
4. How to restart individual services without downtime
5. How to check logs: `docker compose logs -f [service]`
6. Known issues and workarounds
