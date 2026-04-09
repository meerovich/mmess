---
phase: 01-foundation
plan: "02"
subsystem: infra
tags: [drizzle, postgresql, typescript, fastify, schema, migrations, orm]

# Dependency graph
requires:
  - 01-01 (npm workspace monorepo, Fastify 5 server skeleton, drizzle-orm installed)
provides:
  - Complete Drizzle ORM schema for all 7 tables with UUID PKs and snake_case columns
  - Drizzle db client (db export) using postgres npm driver
  - Migration runner that executes automatically on Fastify startup
  - drizzle.config.ts for running db:generate with drizzle-kit
  - .env.example documenting all required environment variables
affects: [02-auth, 03-messaging, 04-groups-presence, 05-file-sharing]

# Tech tracking
tech-stack:
  added:
    - drizzle-orm/postgres-js (postgres-js driver integration)
    - drizzle-orm/postgres-js/migrator (programmatic migration runner)
    - drizzle-kit (via drizzle.config.ts)
  patterns:
    - Drizzle schema defined in TypeScript with pgTable, uuid, varchar, text, timestamp, pgEnum, boolean, integer
    - Separate migration client (max:1) to avoid connection pool conflicts during startup
    - ESM __dirname polyfill via fileURLToPath(import.meta.url)
    - Auto-migration on Fastify startup before app.listen() (decision D-10)

key-files:
  created:
    - server/src/db/schema.ts
    - server/src/db/index.ts
    - server/src/db/migrate.ts
    - server/drizzle.config.ts
    - server/.env.example
  modified:
    - server/src/index.ts

key-decisions:
  - "Full schema defined upfront (D-09): all 7 tables in one file to avoid mid-feature schema migrations"
  - "UUID PKs with gen_random_uuid() (D-07): prevents ID enumeration attacks and enables offline ID generation"
  - "snake_case column names (D-08): matches PostgreSQL conventions, consistent with SQL queries"
  - "Timestamps on all tables (D-11): created_at + updated_at via spread helper; message_reactions has created_at only (no updates)"
  - "Auto-migration on startup (D-10): ensures schema is always current before Fastify accepts connections"
  - "Separate migration postgres client (max:1): avoids pool conflicts during drizzle migrate"

requirements-completed: [INFRA-02, INFRA-04]

# Metrics
duration: ~15min (continuation after partial previous attempt)
completed: 2026-04-08
---

# Phase 01 Plan 02: Drizzle Schema + Migration Runner Summary

**Full Drizzle ORM schema (7 tables, UUID PKs, snake_case) with auto-running migration runner wired to Fastify startup via separate postgres migration client**

## Performance

- **Duration:** ~15 min (resumed from partial state — Task 1 was pre-committed, Task 2 completed)
- **Completed:** 2026-04-08
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments

- Complete Drizzle schema: users, conversations, conversation_participants, messages, message_reactions, files, sessions — all with UUID PKs (except conversation_participants which uses composite unique key), snake_case columns, created_at/updated_at timestamps
- Drizzle db client (`server/src/db/index.ts`) using postgres npm driver with DATABASE_URL validation
- Migration runner (`server/src/db/migrate.ts`) uses a dedicated `max:1` postgres client, resolves migrations folder relative to ESM __dirname
- `server/src/index.ts` updated to call `await runMigrations()` before `app.listen()`
- `server/drizzle.config.ts` pointing at schema.ts and ./drizzle output folder
- `server/.env.example` documenting DATABASE_URL, PORT, HOST, LOG_LEVEL, JWT secrets, and upload config
- TypeScript compilation clean (`npx tsc --noEmit` exits 0)

## Task Commits

1. **Task 1: Drizzle schema — all 7 tables** - `16728ae` (feat)
2. **Task 2: Migration runner + Fastify startup** - `b79d03f` (feat)

## Files Created/Modified

- `server/src/db/schema.ts` - All 7 tables: users, conversations, conversation_participants, messages, message_reactions, files, sessions. Enums: conversation_type. Indexes on conversation_participants (user_id, conversation_id), messages (conversation_id + created_at for pagination), sessions (user_id).
- `server/src/db/index.ts` - Drizzle client using postgres driver, exports `db` and `Db` type
- `server/src/db/migrate.ts` - `runMigrations()` function, uses separate postgres client (max:1), resolves drizzle/ migrations folder via fileURLToPath
- `server/drizzle.config.ts` - Drizzle Kit config: dialect postgresql, schema ./src/db/schema.ts, out ./drizzle
- `server/.env.example` - Documents DATABASE_URL, PORT, HOST, LOG_LEVEL, JWT secrets, UPLOAD_DIR, MAX_FILE_SIZE_MB
- `server/src/index.ts` - Updated to import and await runMigrations() before listen

## Decisions Made

- Spread helper `timestamps()` as a function (not object) to allow calling within spread operator in pgTable column definitions
- `conversation_participants` uses composite unique constraint as effective primary key (no surrogate UUID PK) — matches the join-table pattern for many-to-many relationships
- Migration client uses `{ max: 1 }` to avoid holding extra connections during the migration phase
- Import paths use `.js` extension (e.g., `./schema.js`) per ESM NodeNext resolution — TypeScript resolves these to `.ts` files at compile time

## Deviations from Plan

None - plan executed exactly as written. The previous attempt had created all files correctly; this run committed the uncommitted Task 2 files (migrate.ts and updated index.ts).

## Known Stubs

None. All files are fully wired. Migration runner will execute when DATABASE_URL is set and drizzle/ folder contains migration files (generated via `npm run db:generate` in Plan 01-03).

## Self-Check: PASSED

Files verified present:
- server/src/db/schema.ts - EXISTS
- server/src/db/index.ts - EXISTS
- server/src/db/migrate.ts - EXISTS
- server/drizzle.config.ts - EXISTS
- server/.env.example - EXISTS
- server/src/index.ts - EXISTS (modified)

Task commits verified:
- 16728ae - EXISTS (Task 1: Drizzle schema)
- b79d03f - EXISTS (Task 2: Migration runner)

TypeScript: npx tsc --noEmit exits 0 (verified)
runMigrations wired in server/src/index.ts: verified (import + await call present)

---
*Phase: 01-foundation*
*Completed: 2026-04-08*
