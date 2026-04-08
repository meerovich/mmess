# Technology Stack

**Project:** mmess — self-hosted HTTPS WebSocket messenger
**Researched:** 2026-04-08
**Scale target:** Tens of users (personal circle of friends), single VPS

---

## Recommended Stack

### Backend Runtime

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Node.js | 22.x LTS | Server runtime | Largest ecosystem, most stable for production, best library compatibility. Bun is faster in benchmarks but its Node.js compatibility still has edge cases; production surprises with Bun are well-documented. For a self-hosted messenger where reliability beats raw throughput, Node.js wins on "no surprises" grounds. |

**Confidence: HIGH** — Node.js 22 is the active LTS as of 2025, long-term support through 2027.

**Why not Bun:** Bun is faster in benchmarks (52k req/s vs Node's 13k), but `ws`, `Fastify`, and most middleware libraries are battle-tested specifically on Node. At this scale (tens of users), raw throughput is irrelevant; operational stability matters more.

**Why not Deno:** Ecosystem maturity and npm compatibility lag behind. More friction for no meaningful gain.

---

### HTTP + WebSocket Server Framework

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Fastify | 5.8.x | HTTP REST API server | 2-3x the throughput of Express, schema-based validation, TypeScript-native, active v5 maintenance. |
| ws | 8.20.x | WebSocket server | Minimal, RFC 6455-compliant, ~3KB/connection memory footprint. Integrates cleanly with Fastify via `@fastify/websocket`. No fallback overhead like Socket.IO. |
| @fastify/websocket | latest | Fastify-ws integration | Official Fastify plugin that wraps `ws`, gives WebSocket routes the same request lifecycle as HTTP routes. |

**Confidence: HIGH** — Both packages verified on npm with recent publish dates (within weeks).

**Why not Socket.IO:** Socket.IO adds ~60KB bundle overhead and ~15KB/connection memory vs ws's ~3KB. Its fallback transports (long-polling) are unnecessary — all modern browsers support WebSocket natively. The reconnection/room abstractions are useful but implementable manually for this scope.

**Why not uWebSockets.js:** Performance is 3-8x better than ws but the C++ bindings create platform-specific compilation complexity in Docker and require careful versioning. Overkill for tens of users and higher maintenance burden.

**Why not Express:** Express peaks at ~20-30k req/s vs Fastify's 70-80k. More importantly, Express has no native TypeScript support, slower JSON serialization (no schema), and no built-in validation. In 2025 Fastify is the clear winner for new projects.

---

### Database

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| PostgreSQL | 16.x | Primary data store (users, messages, rooms, sessions) | Handles concurrent writes correctly — SQLite serializes writes and would struggle under simultaneous message inserts. PostgreSQL's JSONB, full-text search (for message search), and row-level locking are genuinely useful for a messenger. Rock-solid Docker image. |

**Confidence: HIGH** — PostgreSQL 16 is current stable (17 released late 2024, both production-ready).

**Why not SQLite:** Single-writer bottleneck. Even for tens of users, multiple WebSocket connections writing messages simultaneously will hit SQLite's serialization wall and produce delays or errors under concurrent load. SQLite is appropriate for local development only.

**Why not MongoDB:** Relational data (users → rooms → messages → read-receipts) fits a relational model naturally. No need for the operational overhead of a document store here.

---

### ORM / Query Layer

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Drizzle ORM | 0.45.x | Database query layer + migrations | SQL-native TypeScript ORM: schema defined in TypeScript, queries look like SQL, type safety without code generation. Faster feedback loop than Prisma (no `prisma generate` step). Lightweight — 57KB bundle vs Prisma's heavier runtime. Migrations via `drizzle-kit`. |
| postgres (npm) | latest | PostgreSQL driver | The `postgres` npm package (not `pg`) is the modern, high-performance PostgreSQL driver recommended by the Drizzle team for new projects. |

**Confidence: MEDIUM** — Drizzle is actively developed and widely adopted, but still pre-1.0 (0.45.x). The API is stable in practice; breaking changes are well-communicated. Prisma 7 dropped its Rust engine and is now pure TypeScript, making the performance gap smaller, but Drizzle's SQL-native DX is still better for a project of this size.

**Why not Prisma:** Prisma's schema-first approach (separate `.prisma` file, `prisma generate`) adds friction. Drizzle's schema-in-TypeScript means faster iteration during development. Prisma 7 is better than before but Drizzle wins on DX for smaller focused projects.

**Why not raw SQL (pg):** Manual query building and no migration tooling — acceptable but creates maintenance burden.

---

### Authentication

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| JWT (`jsonwebtoken`) | 9.x | Stateless auth tokens for REST + WebSocket | Self-contained tokens pass the auth claim into the WebSocket upgrade request without a server-side session lookup on every message. Appropriate for a single-server self-hosted app where token revocation (logout) is handled with a short expiry + refresh token pattern. |
| `argon2` (npm) | latest | Password hashing | Argon2id is the 2025 gold standard (recommended by OWASP, winner of Password Hashing Competition). Memory-hard: resistant to GPU/ASIC brute force. Minimum config: 19MB memory, 2 iterations, Argon2id variant. |
| `@fastify/jwt` | latest | JWT integration for Fastify | Official Fastify plugin — hooks into request lifecycle cleanly, no manual middleware wiring. |

**Confidence: HIGH** — Argon2id recommendation is from OWASP's current password storage cheat sheet. JWT with short expiry + refresh is the established pattern for stateless WebSocket auth.

**Auth flow:** HTTP login endpoint issues a short-lived access JWT (15 min) + long-lived refresh JWT (7 days, stored in HttpOnly cookie). WebSocket upgrade sends access JWT in the `Authorization` header (or query param as fallback). Server validates JWT on connection; no per-message DB lookup required.

**Why not sessions (express-session style):** Server-side sessions require a session store (Redis or DB). With JWT, the WebSocket server needs no DB lookup to authenticate an already-connected client. For this scale, JWT's "hard to revoke" problem is mitigated by short access token TTL.

**Why not bcrypt:** Still secure at cost factor 12+, but Argon2id is unambiguously better against modern GPU attacks. New projects should use Argon2id.

---

### File Storage

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Local filesystem (Docker volume) | — | Image and file uploads | For tens of users with infrequent file sharing, a mounted Docker volume is the simplest, most reliable approach. No S3 compatibility layer needed. Files served via Fastify's `@fastify/static` or through a dedicated Nginx `location` block. |

**Confidence: HIGH** — MinIO is in a deteriorated state (the company abandoned the open-source community edition in late 2025, stripping essential admin functions). Garage and SeaweedFS are viable S3-compatible alternatives but add operational complexity unnecessary for this scale.

**Implementation:** Store uploads under a configured `UPLOAD_DIR` path, bind-mounted as a named Docker volume. Fastify handles multipart upload parsing via `@fastify/multipart`. Files are addressable via URL slugs, not exposed paths. A size cap per upload (e.g., 50MB) enforced server-side.

**Future migration path:** If S3 compatibility is ever needed, wrapping the storage layer behind a simple interface abstraction makes it easy to swap to Garage or AWS S3 later without changing business logic.

---

### Frontend

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| React | 19.x | UI framework | Largest ecosystem, best tooling, most familiar for most developers. React 19 is stable. The project is a SPA (no SSR needed — content is auth-gated), so React's overhead versus Svelte is irrelevant at this scale. |
| Vite | 6.x | Build tool + dev server | The de facto standard for React SPA development post-CRA. Native ES modules in dev = instant startup. SWC-based transforms. Simple config. |
| TypeScript | 5.x | Language | Type safety across full stack, especially important for message schema alignment between frontend and backend. |
| React Router | 6.x | Client-side routing | Standard SPA routing. Simple for the auth → chat layout this app needs. |

**Confidence: HIGH** — React 19.x is the current stable version (19.2.4 as of early 2026). Vite is firmly established as the standard build tool.

**Why not Next.js:** No SSR/SSG needed. All pages are auth-gated; SEO is irrelevant. Next.js adds deployment complexity (Node.js server required for SSR) for zero benefit in this use case. A plain Vite SPA can be served as static files from Nginx.

**Why not Svelte:** Svelte's performance advantage is real but irrelevant for a chat UI (the bottleneck is WebSocket message latency, not re-render performance). React's ecosystem (component libraries, debugging tools, community resources) justifies the marginal overhead for this use case.

**Why not Vue:** React edges out Vue on ecosystem breadth and TypeScript integration tightness. No strong reason to choose Vue over React for a new project with no existing Vue codebase.

---

### Reverse Proxy / TLS

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Caddy | 2.x | Reverse proxy + automatic TLS | Caddy handles Let's Encrypt certificate issuance and renewal automatically — zero cron jobs, zero Certbot setup, zero manual cert renewal. A Caddyfile for this use case is 5-10 lines. WebSocket proxying works out of the box (`proxy_protocol` headers set automatically). Significantly less operational toil than Nginx + Certbot. |

**Confidence: HIGH** — Caddy v2 is stable and in widespread production use. Its automatic HTTPS is the defining advantage for self-hosted Docker deployments.

**Why not Nginx + Certbot:** Nginx requires: install, write config, install Certbot, configure renewal timer/cron, debug certificate paths, reload on renewal. Caddy requires: install, write 5-line Caddyfile, run. For a self-hosted personal project, Caddy's zero-maintenance TLS is a clear win. Nginx is the right choice when you need complex rewrites, `ngx_http_*` modules, or have an existing Nginx setup.

**WebSocket proxying in Caddy:**
```
reverse_proxy /ws localhost:3000 {
    transport http {
        versions 1.1
    }
}
```
Caddy handles the `Upgrade` and `Connection` headers correctly by default.

---

### Deployment

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Docker + Docker Compose | latest stable | Container orchestration | Single-host deployment for a personal project. Docker Compose defines: `postgres`, `backend`, `frontend` (or serve static via Caddy), `caddy`. Named volumes for PostgreSQL data and file uploads. |

**Confidence: HIGH** — Docker Compose is the standard tool for this deployment pattern.

**Service topology:**
```
Caddy (host port 80/443)
  └── /api, /ws  → backend:3000  (Fastify + ws)
  └── /          → frontend static files (served by Caddy directly)

backend:3000
  └── postgres:5432

postgres:5432
  └── named volume: postgres_data

backend:3000
  └── named volume: uploads_data
```

Static frontend files (built by Vite) can be served directly by Caddy from a shared volume, eliminating a dedicated Nginx container for static serving.

---

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

---

## Installation (Reference)

```bash
# Backend
npm install fastify @fastify/websocket @fastify/jwt @fastify/multipart @fastify/static @fastify/cors
npm install ws drizzle-orm postgres jsonwebtoken argon2
npm install -D typescript @types/node drizzle-kit tsx

# Frontend
npm create vite@latest frontend -- --template react-ts
npm install react-router-dom
```

---

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

---

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
