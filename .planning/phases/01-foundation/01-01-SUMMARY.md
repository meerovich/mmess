---
phase: 01-foundation
plan: "01"
subsystem: infra
tags: [typescript, node, fastify, drizzle, react, vite, eslint, prettier, npm-workspaces]

# Dependency graph
requires: []
provides:
  - npm workspace monorepo with server/ and client/ directories
  - Fastify 5 server skeleton with /health endpoint
  - React 19 + Vite 6 SPA skeleton with react-router-dom
  - TypeScript strict config for both workspaces (ESM, NodeNext for server, Bundler for client)
  - ESLint 9 flat config with typescript-eslint plugin
  - Prettier formatting rules
  - Base tsconfig with ES2022 target and strict mode
affects: [02-auth, 03-messaging, 04-groups-presence, 05-file-sharing, 06-ui-deploy]

# Tech tracking
tech-stack:
  added:
    - fastify@5.8.x
    - drizzle-orm@0.45.x
    - ws@8.20.x + @fastify/websocket
    - "@fastify/cors, @fastify/jwt, @fastify/multipart, @fastify/static"
    - postgres (npm driver)
    - tsx (dev server with watch)
    - react@19.x
    - react-dom@19.x
    - react-router-dom@6.x
    - vite@6.x + @vitejs/plugin-react
    - typescript@5.x
    - eslint@9.x + @typescript-eslint v8
    - prettier@3.x
  patterns:
    - npm workspaces for monorepo (server + client as named workspaces)
    - tsconfig.base.json extended by workspace configs
    - ESLint 9 flat config (eslint.config.js)
    - ESM throughout (type:module in all package.json files)

key-files:
  created:
    - package.json
    - tsconfig.base.json
    - eslint.config.js
    - .prettierrc
    - .gitignore
    - package-lock.json
    - server/package.json
    - server/tsconfig.json
    - server/src/index.ts
    - client/package.json
    - client/tsconfig.json
    - client/vite.config.ts
    - client/index.html
    - client/src/main.tsx
    - client/src/App.tsx
  modified: []

key-decisions:
  - "ESLint 9 flat config (eslint.config.js) used instead of legacy .eslintrc.json — required by ESLint 9 + @typescript-eslint v8"
  - "allowImportingTsExtensions: true added to client tsconfig — required for .tsx import paths with Vite bundler resolution"
  - "npm workspaces with hoisted node_modules — fastify and shared deps live in root node_modules"
  - "ESM (type:module) throughout both workspaces — aligns with Node.js 22 and Vite 6 native ESM"

patterns-established:
  - "Workspace imports: use relative paths without explicit extensions in server; .tsx extensions allowed in client"
  - "TypeScript extends chain: server/tsconfig.json and client/tsconfig.json both extend tsconfig.base.json"
  - "Environment variables accessed via process.env with nullish coalescing defaults"

requirements-completed: [INFRA-02]

# Metrics
duration: 25min
completed: 2026-04-08
---

# Phase 01 Plan 01: Foundation Scaffold Summary

**npm workspace monorepo with Fastify 5 server skeleton and React 19 + Vite 6 client, both compiling clean under TypeScript strict mode**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-04-08T18:47:00Z
- **Completed:** 2026-04-08T19:12:00Z
- **Tasks:** 3
- **Files modified:** 15

## Accomplishments

- Root monorepo scaffold with npm workspaces, ESLint 9, Prettier, and shared tsconfig
- Server workspace: Fastify 5 skeleton with /health route, Drizzle ORM + ws dependencies installed, tsc --noEmit passes
- Client workspace: React 19 + Vite 6 SPA skeleton, react-router-dom wired, tsc --noEmit and vite build both pass cleanly

## Task Commits

Each task was committed atomically:

1. **Task 1: Root scaffold** - `0f28765` (chore)
2. **Task 2: Server workspace** - `669dd2e` (feat)
3. **Task 3: Client workspace** - `d3e3439` (feat)
4. **Lockfile** - `5365b72` (chore)

**Plan metadata:** _(docs commit — see final commit hash below)_

## Files Created/Modified

- `package.json` - Root workspace config with npm workspaces ["server", "client"]
- `tsconfig.base.json` - Shared TypeScript strict ES2022 NodeNext config
- `eslint.config.js` - ESLint 9 flat config with typescript-eslint rules
- `.prettierrc` - Formatting: singleQuote, semi, tabWidth 2, trailingComma es5
- `.gitignore` - node_modules, dist, .env, *.tsbuildinfo
- `package-lock.json` - Lockfile for reproducible installs
- `server/package.json` - Fastify 5.8, drizzle-orm 0.45, ws 8.20, postgres deps
- `server/tsconfig.json` - NodeNext ESM, extends base, outDir dist
- `server/src/index.ts` - Fastify app with /health GET endpoint
- `client/package.json` - React 19, react-dom 19, react-router-dom 6, Vite 6
- `client/tsconfig.json` - ESNext Bundler resolution, react-jsx, allowImportingTsExtensions
- `client/vite.config.ts` - Vite 6 config with /api and /ws proxies to localhost:3000
- `client/index.html` - SPA entry point
- `client/src/main.tsx` - React 19 StrictMode + BrowserRouter entry
- `client/src/App.tsx` - Minimal App component placeholder

## Decisions Made

- Used ESLint 9 flat config (`eslint.config.js`) rather than legacy `.eslintrc.json` because `@typescript-eslint` v8 requires ESLint 9, which dropped legacy config support by default
- Added `allowImportingTsExtensions: true` to client tsconfig because Vite's Bundler moduleResolution with explicit `.tsx` import paths requires this flag
- npm workspaces with root-level hoisting — all shared packages live in root `node_modules/`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] ESLint 9 flat config instead of .eslintrc.json**
- **Found during:** Task 1 (Root scaffold)
- **Issue:** Plan specified `"eslint": "^9.0.0"` and `.eslintrc.json` — but ESLint 9 dropped legacy `.eslintrc.*` support. `@typescript-eslint` v8 requires ESLint 9. Using `.eslintrc.json` with ESLint 9 would fail at runtime.
- **Fix:** Created `eslint.config.js` (ESLint 9 flat config format) with equivalent rules
- **Files modified:** `eslint.config.js` (created), `package.json` (lint script updated to `eslint .`)
- **Verification:** ESLint config loads correctly; npm install succeeds
- **Committed in:** `0f28765` (Task 1 commit)

**2. [Rule 1 - Bug] Added allowImportingTsExtensions to client tsconfig**
- **Found during:** Task 3 (Client workspace)
- **Issue:** `src/main.tsx` imports `./App.tsx` with explicit extension — tsc errored: "An import path can only end with a '.tsx' extension when 'allowImportingTsExtensions' is enabled"
- **Fix:** Added `"allowImportingTsExtensions": true` to `client/tsconfig.json` compilerOptions (safe because `noEmit: true` is set and Vite handles bundling)
- **Files modified:** `client/tsconfig.json`
- **Verification:** `npx tsc --noEmit` in client/ exits 0; `npm run build` succeeds
- **Committed in:** `d3e3439` (Task 3 commit)

---

**Total deviations:** 2 auto-fixed (2 Rule 1 bugs)
**Impact on plan:** Both fixes were necessary for correctness — the config as written would have failed. No scope creep.

## Issues Encountered

- Node.js 18.20.4 installed on the system; several packages (fastify 5, glob 11, lru-cache 11) require Node 20+. All installs completed with EBADENGINE warnings but no failures. **For production deployment on Node 22 (per project spec) these warnings will not appear.** Recommend upgrading local Node.js to 22 LTS for full compatibility.

## User Setup Required

None - no external service configuration required for this plan. All scaffold and config only.

## Next Phase Readiness

- Server workspace ready for Phase 2 (Auth): add JWT middleware, user routes, Drizzle schema
- Client workspace ready for Phase 2: add auth pages, protected routes
- ESLint/Prettier configured — run `npm run lint` and `npm run format` from root
- Blocker: local Node.js is v18 but stack targets v22 — upgrade recommended before running dev server

## Self-Check: PASSED

All created files verified present:
- package.json, tsconfig.base.json, eslint.config.js, .prettierrc, .gitignore
- server/package.json, server/tsconfig.json, server/src/index.ts
- client/package.json, client/tsconfig.json, client/vite.config.ts, client/index.html, client/src/main.tsx, client/src/App.tsx
- client/dist/index.html (produced by vite build)
- .planning/phases/01-foundation/01-01-SUMMARY.md

All task commits verified: 0f28765, 669dd2e, d3e3439, 5365b72

---
*Phase: 01-foundation*
*Completed: 2026-04-08*
