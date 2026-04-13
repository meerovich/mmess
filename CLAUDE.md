<!-- GSD:project-start source:PROJECT.md -->
## Project

**mmess**

A self-hosted HTTPS messenger with real-time WebSocket communication, designed for personal use among friends. Web-based client with support for text messages, file/image sharing, and both private and group chats.

**Core Value:** Instant, reliable message delivery between users over a secure WebSocket connection — if messaging doesn't work flawlessly in real-time, nothing else matters.

### Constraints

- **Deployment**: Self-hosted VPS with Docker — must be easy to deploy and maintain
- **Security**: TLS for all connections (HTTPS + WSS), no plaintext traffic
- **Scale**: Small user base (tens of users, not thousands)
- **Platform**: Web browser only for v1
<!-- GSD:project-end -->

<!-- GSD:stack-start source:research/STACK.md -->
## Technology Stack

## Recommended Stack
### Backend Runtime
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Node.js | 22.x LTS | Server runtime | Largest ecosystem, most stable for production, best library compatibility. Bun is faster in benchmarks but its Node.js compatibility still has edge cases; production surprises with Bun are well-documented. For a self-hosted messenger where reliability beats raw throughput, Node.js wins on "no surprises" grounds. |
### HTTP + WebSocket Server Framework
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Fastify | 5.8.x | HTTP REST API server | 2-3x the throughput of Express, schema-based validation, TypeScript-native, active v5 maintenance. |
| ws | 8.20.x | WebSocket server | Minimal, RFC 6455-compliant, ~3KB/connection memory footprint. Integrates cleanly with Fastify via `@fastify/websocket`. No fallback overhead like Socket.IO. |
| @fastify/websocket | latest | Fastify-ws integration | Official Fastify plugin that wraps `ws`, gives WebSocket routes the same request lifecycle as HTTP routes. |
### Database
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| PostgreSQL | 16.x | Primary data store (users, messages, rooms, sessions) | Handles concurrent writes correctly — SQLite serializes writes and would struggle under simultaneous message inserts. PostgreSQL's JSONB, full-text search (for message search), and row-level locking are genuinely useful for a messenger. Rock-solid Docker image. |
### ORM / Query Layer
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Drizzle ORM | 0.45.x | Database query layer + migrations | SQL-native TypeScript ORM: schema defined in TypeScript, queries look like SQL, type safety without code generation. Faster feedback loop than Prisma (no `prisma generate` step). Lightweight — 57KB bundle vs Prisma's heavier runtime. Migrations via `drizzle-kit`. |
| postgres (npm) | latest | PostgreSQL driver | The `postgres` npm package (not `pg`) is the modern, high-performance PostgreSQL driver recommended by the Drizzle team for new projects. |
### Authentication
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| JWT (`jsonwebtoken`) | 9.x | Stateless auth tokens for REST + WebSocket | Self-contained tokens pass the auth claim into the WebSocket upgrade request without a server-side session lookup on every message. Appropriate for a single-server self-hosted app where token revocation (logout) is handled with a short expiry + refresh token pattern. |
| `argon2` (npm) | latest | Password hashing | Argon2id is the 2025 gold standard (recommended by OWASP, winner of Password Hashing Competition). Memory-hard: resistant to GPU/ASIC brute force. Minimum config: 19MB memory, 2 iterations, Argon2id variant. |
| `@fastify/jwt` | latest | JWT integration for Fastify | Official Fastify plugin — hooks into request lifecycle cleanly, no manual middleware wiring. |
### File Storage
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Local filesystem (Docker volume) | — | Image and file uploads | For tens of users with infrequent file sharing, a mounted Docker volume is the simplest, most reliable approach. No S3 compatibility layer needed. Files served via Fastify's `@fastify/static` or through a dedicated Nginx `location` block. |
### Frontend
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| React | 19.x | UI framework | Largest ecosystem, best tooling, most familiar for most developers. React 19 is stable. The project is a SPA (no SSR needed — content is auth-gated), so React's overhead versus Svelte is irrelevant at this scale. |
| Vite | 6.x | Build tool + dev server | The de facto standard for React SPA development post-CRA. Native ES modules in dev = instant startup. SWC-based transforms. Simple config. |
| TypeScript | 5.x | Language | Type safety across full stack, especially important for message schema alignment between frontend and backend. |
| React Router | 6.x | Client-side routing | Standard SPA routing. Simple for the auth → chat layout this app needs. |
### Reverse Proxy / TLS
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Caddy | 2.x | Reverse proxy + automatic TLS | Caddy handles Let's Encrypt certificate issuance and renewal automatically — zero cron jobs, zero Certbot setup, zero manual cert renewal. A Caddyfile for this use case is 5-10 lines. WebSocket proxying works out of the box (`proxy_protocol` headers set automatically). Significantly less operational toil than Nginx + Certbot. |
### Deployment
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Docker + Docker Compose | latest stable | Container orchestration | Single-host deployment for a personal project. Docker Compose defines: `postgres`, `backend`, `frontend` (or serve static via Caddy), `caddy`. Named volumes for PostgreSQL data and file uploads. |
## Alternatives Considered
| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Runtime | Node.js 22 | Bun | Production stability, library compatibility; raw speed irrelevant at this scale |
| WS library | ws + @fastify/websocket | Socket.IO | Socket.IO adds overhead + fallback complexity; native WS is sufficient |
| WS library | ws | uWebSockets.js | C++ binding complexity in Docker; overkill for tens of users |
| HTTP framework | Fastify | Express | Express is 3x slower, no native TypeScript, no schema validation |
| Database | PostgreSQL | SQLite | SQLite single-writer bottleneck under concurrent WebSocket writes |
| ORM | Drizzle ORM | Prisma | Drizzle is faster to iterate (no codegen), SQL-native, smaller bundle |
| Auth | JWT + Argon2id | Sessions | JWT avoids per-message DB lookups on WebSocket connections |
| Password hash | Argon2id | bcrypt | Argon2id is OWASP's 2025 recommendation; better GPU/ASIC resistance |
| File storage | Local filesystem | MinIO | MinIO community edition degraded in late 2025; local volume simpler at this scale |
| Frontend | React + Vite | Next.js | No SSR needed; Next.js adds complexity for zero benefit (all content auth-gated) |
| Frontend | React + Vite | Svelte | React ecosystem advantage; Svelte perf gains irrelevant for chat UI |
| Reverse proxy | Caddy | Nginx | Caddy's automatic TLS eliminates Certbot maintenance overhead |
## Installation (Reference)
# Backend
# Frontend
## Confidence Summary
| Area | Confidence | Basis |
|------|------------|-------|
| Node.js 22 LTS | HIGH | Official Node.js release schedule |
| Fastify 5.8.x | HIGH | npm verified, OpenJS Foundation announcement |
| ws 8.20.x | HIGH | npm verified, recent publish |
| PostgreSQL 16 | HIGH | Official PostgreSQL versioning |
| Drizzle ORM 0.45.x | MEDIUM | npm verified but pre-1.0; API stable in practice |
| JWT + Argon2id auth | HIGH | OWASP Password Storage Cheat Sheet 2025 |
| React 19 + Vite | HIGH | npm verified (React 19.2.4), Vite official docs |
| Caddy v2 TLS | HIGH | Caddy official docs, widespread production adoption |
| Local filesystem storage | HIGH | MinIO community edition deprecation confirmed by multiple sources |
## Sources
- Node.js release schedule: https://nodejs.org/en/about/previous-releases
- Fastify npm: https://www.npmjs.com/package/fastify (v5.8.4)
- ws npm: https://www.npmjs.com/package/ws (v8.20.0)
- Drizzle ORM npm: https://www.npmjs.com/package/drizzle-orm (v0.45.2)
- React versions: https://react.dev/versions (v19.2.4)
- Vite docs: https://vite.dev/guide/
- Caddy automatic HTTPS: https://caddyserver.com/docs/automatic-https
- OWASP Password Storage: https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html
- MinIO community edition abandonment: https://www.xda-developers.com/minio-alternative-garage/ (confirmed late 2025)
- Fastify vs Express benchmark: https://betterstack.com/community/guides/scaling-nodejs/fastify-express/
- Prisma v7 architecture changes: https://techsy.io/blog/prisma-vs-drizzle-orm (Rust engine removed, pure TS)
- Drizzle vs Prisma 2026: https://www.bytebase.com/blog/drizzle-vs-prisma/
- Caddy vs Nginx TLS: https://mangohost.net/blog/nginx-vs-caddy-in-2025-which-is-better-for-performance-and-tls-automation-2/
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

### Versioning & Deploy (MANDATORY)
1. **Every deploy MUST increment the version** (semver patch minimum: 1.4.9 → 1.4.10)
2. **minClientVersion always equals APP_VERSION** — server health forces reload for ANY version mismatch. Users always run the latest client.
3. **Deploy flow** (from Windows):
   - Build client: `VITE_APP_VERSION=X.Y.Z npx vite build`
   - Tar + upload: `tar -czf ... && pscp ...`
   - On VPS: extract dist, `sed` version in package.json
   - If server code changed: `docker compose build api` + recreate api+caddy
   - If client-only: `docker compose restart caddy`
4. **Never reuse a version number** — even for small CSS fixes
5. **After deploy**: send notification to miha via bot API with changelog
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

Architecture not yet mapped. Follow existing patterns found in the codebase.
<!-- GSD:architecture-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd:quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd:debug` for investigation and bug fixing
- `/gsd:execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->



<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd:profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
