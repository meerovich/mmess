# mmess

A self-hosted HTTPS messenger with real-time WebSocket communication.

## Prerequisites

- A VPS or server with Docker and Docker Compose installed
- A domain name pointing at your server's IP (A record in DNS)
- Ports 80 and 443 open in your firewall

## Quick Start

### 1. Clone the repository

```bash
git clone <your-repo-url> mmess
cd mmess
```

### 2. Configure environment

```bash
cp .env.production.example .env
```

Edit `.env` and set:
- `DOMAIN` — your domain (e.g. `chat.example.com`)
- `POSTGRES_PASSWORD` — run `openssl rand -hex 20`
- `DATABASE_URL` — update with the same password as above
- `JWT_ACCESS_SECRET` — run `openssl rand -hex 32`
- `JWT_REFRESH_SECRET` — run `openssl rand -hex 32` (different from access secret)

### 3. Build and start

```bash
docker compose up -d --build
docker compose logs -f --tail=100 api
```

Caddy will automatically obtain a TLS certificate from Let's Encrypt on first start.
Wait until you see `listening on :3000` in the api logs.

### 4. Create the first admin invite

```bash
docker compose exec api node dist/scripts/invite.js
```

This prints a one-time invite link. Open it in your browser to register the first account.

### 5. Register the admin account

Open `https://<your-domain>` in your browser, click the invite link, and register.

---

## Day-2 Operations

### View logs

```bash
docker compose logs -f api          # API logs
docker compose logs -f caddy        # Reverse proxy logs
docker compose logs -f postgres     # Database logs
```

### Restart a service

```bash
docker compose restart api
```

### Update to a new version

Preferred (auto-bumps patch version and rebuilds client + server):

```bash
./scripts/deploy.sh
docker compose logs -f --tail=50 api
```

`scripts/deploy.sh` runs `git pull`, increments the `version` field in the
root `package.json` (e.g. `1.0.3` -> `1.0.4`), rebuilds the client with
`VITE_APP_VERSION` injected, and restarts the stack with `APP_VERSION`
exported for the api container. The running version is visible in the sidebar
footer of the web UI and at `GET /health` (`{ status, version, timestamp }`).

Manual path (no version bump) still works:

```bash
git pull
docker compose up -d --build
docker compose logs -f --tail=50 api
```

### Backup

```bash
./scripts/backup.sh
```

Creates timestamped backups in `./backups/`. Keeps the last 7 of each type.

### Restore

```bash
./scripts/restore.sh YYYY-MM-DD
```

Replaces the current database and uploads with the specified dated backup.

### TLS certificate renewal

Caddy handles certificate renewal automatically. No manual action required.
Certificates are stored in the `caddy_data` named Docker volume.

---

## Architecture

| Component | Technology | Port |
|-----------|-----------|------|
| Reverse proxy + TLS | Caddy 2 | 80, 443 |
| API server | Node.js 22 + Fastify 5 | 3000 (internal) |
| Database | PostgreSQL 16 | 5432 (internal) |
| File storage | Docker named volume | — |

All inter-service traffic stays on the internal Docker network. Only Caddy is exposed to the internet.
