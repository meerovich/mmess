# Phase 1: Foundation - Context

**Gathered:** 2026-04-08
**Status:** Ready for planning

<domain>
## Phase Boundary

Project scaffold with Docker Compose, PostgreSQL database with full schema, Fastify HTTP server skeleton, and Caddy reverse proxy with auto-TLS. After this phase, `docker compose up` brings up a working stack ready for authentication and messaging features.

</domain>

<decisions>
## Implementation Decisions

### Project Structure
- **D-01:** Monorepo with `server/` and `client/` directories in a single git repository
- **D-02:** TypeScript throughout (both backend and frontend)
- **D-03:** ESLint + Prettier for code quality

### Docker Topology
- **D-04:** Docker Compose with 3 services: `postgres`, `api` (Fastify), `caddy` (reverse proxy)
- **D-05:** Separate `docker-compose.yml` (production) and `docker-compose.dev.yml` (development with hot reload)
- **D-06:** Development mode uses `localhost` with self-signed TLS; production uses real domain with auto Let's Encrypt

### Database Schema
- **D-07:** UUID primary keys for all user-facing entities (users, messages, conversations) — avoids sequential ID enumeration
- **D-08:** `snake_case` for all table and column names
- **D-09:** Full schema defined upfront: users, conversations, conversation_participants, messages, message_reactions, files, sessions — all tables created in Phase 1 even if populated later
- **D-10:** Drizzle ORM with `drizzle-kit` for migrations, run automatically on API startup
- **D-11:** `created_at` and `updated_at` timestamps on all tables

### Network Configuration
- **D-12:** Caddy listens on 80/443, proxies `/api/*` to Fastify and serves static files for frontend
- **D-13:** WebSocket upgrade handled by Caddy at `/ws` path
- **D-14:** CORS configured for same-origin (Caddy serves both API and frontend)

### File Storage
- **D-15:** Named Docker volume `mmess_uploads` for file storage, mounted at `/data/uploads` in API container
- **D-16:** Caddy serves uploaded files directly from the volume (not through Node.js)

### Claude's Discretion
- Specific Drizzle schema column types and constraints
- Exact Caddy configuration syntax
- Docker networking details (internal network names, etc.)
- ESLint/Prettier rule specifics
- Package manager choice (npm vs pnpm)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Research
- `.planning/research/STACK.md` — Technology choices with versions and rationale
- `.planning/research/ARCHITECTURE.md` — Component boundaries and data flow
- `.planning/research/PITFALLS.md` — Critical infrastructure pitfalls (especially #1 Nginx/proxy, #4 file storage, #9 TLS renewal)

### Project
- `.planning/PROJECT.md` — Project vision and constraints
- `.planning/REQUIREMENTS.md` — INFRA-01, INFRA-02, INFRA-04 are this phase's requirements

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- None — greenfield project, no existing code

### Established Patterns
- None — this phase establishes the patterns all subsequent phases will follow

### Integration Points
- Phase 2 (Auth) will add JWT middleware to the Fastify skeleton created here
- Phase 3 (Messaging) will add WebSocket handler to the Fastify server created here
- Phase 5 (File Sharing) will use the Docker volume and Caddy static file serving configured here

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches. User deferred all infrastructure decisions to Claude's judgment.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 01-foundation*
*Context gathered: 2026-04-08*
