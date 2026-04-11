# Phase 6: UI & Deploy - Context

**Gathered:** 2026-04-11
**Status:** Ready for planning

<domain>
## Phase Boundary

Final polish phase: 3-state theme toggle (light/dark/system) with CSS custom property variants, inline client-side conversation search filtering by chat name + participant username, mobile polish (viewport meta, safe-area insets, 16px input font fix, PWA manifest), and production deployment artifacts (`.env.production` template, README deploy guide, docker-compose healthchecks for all services, backup shell script). No CI/CD — manual `git pull && docker compose up -d --build`.

Also includes a small CSS debt cleanup: replace pre-existing `color: white` hardcodes in `ConversationItem.module.css` and `MessageItem.module.css` with `var(--color-on-accent)` (noted in Phase 4 verification as inherited debt).

</domain>

<decisions>
## Implementation Decisions

### Dark Theme
- **D-01:** 3-state theme: `light` | `dark` | `system`. Default = `system`.
- **D-02:** System mode follows `prefers-color-scheme` media query; uses a `matchMedia` listener so the theme updates live when the OS setting changes.
- **D-03:** Persist selection in `localStorage` under key `mmess.theme`. No DB sync in v1.
- **D-04:** Implementation pattern: apply `data-theme="light"` or `data-theme="dark"` attribute on `<html>`. CSS variables in `tokens.css` are defined under `:root` (defaults + light tokens), with overrides in `:root[data-theme="dark"] { ... }`. When mode is `system`, resolve to `light` or `dark` before applying the attribute.
- **D-05:** Inline pre-hydration script in `index.html` (runs before React mounts) applies the stored theme to prevent flash of wrong theme on page load.
- **D-06:** Toggle UI: a 3-button segmented control or icon trio in the sidebar footer area (bottom of `ConversationList`), next to the current user's avatar. Icons: sun / moon / monitor. Active state uses accent color background.
- **D-07:** New tokens added for dark mode (transcribed into tokens.css under `:root[data-theme="dark"]`):
  - `--color-surface`: `#1a1a1a` (was #ffffff)
  - `--color-surface-secondary`: `#242424` (was #f4f5f7)
  - `--color-text`: `#e8eaed` (replaces any hardcoded text color)
  - `--color-text-muted`: `#9aa0a6`
  - `--color-border`: `#3c4043`
  - `--color-accent`: `#8ab4f8` (was #0b57d0 — lighter for dark bg contrast)
  - `--color-accent-muted`: `#1e3a5f` (was #e8f0fe)
  - `--color-destructive`: `#f28b82` (was #c5221f)
  - `--color-file-card-bg`: `#2a2a2a` (was #f8f9fa)
  - `--color-lightbox-backdrop`: `rgba(0, 0, 0, 0.92)` (was 0.85 — slightly denser on dark)
  - `--color-presence-online`: `#4ade80` (brighter green)
  - `--color-presence-offline`: `#6b7280` (dimmer grey)
  - `--color-on-accent`: `#0a0a0a` (inverse of light mode's white)
- **D-08:** Audit of existing CSS modules required: replace any hardcoded colors (`#fff`, `white`, `black`, `#000`, hex values) with token references. Known offenders: `ConversationItem.module.css` (`.unreadBadge`), `MessageItem.module.css` (`.deleteBtn`). Also audit for `color: white` / `#ffffff` anywhere else.

### Conversation Search
- **D-09:** Inline search input in the ConversationList header (above the "New chat" / "New group" buttons)
- **D-10:** Client-side filter — `state.conversations` already in ChatContext is filtered in a derived value inside `ConversationList`. No new API endpoint.
- **D-11:** Search scope: match `conversation.name` (case-insensitive substring) OR any `participant.username` in the conversation's participants array
- **D-12:** Empty state: when search query produces zero results, show "No conversations match '[query]'" in the list area
- **D-13:** Clear button (×) inside input, appears when query is non-empty
- **D-14:** Keyboard shortcut: `Ctrl+K` / `Cmd+K` focuses the search input
- **D-15:** No highlighting of matched text in the result list (v1 simplicity); just filter-by-match

### Mobile Polish
- **D-16:** `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">` in `client/index.html`
- **D-17:** CSS safe-area-inset env() on ChatLayout root for iOS notches: `padding-top: env(safe-area-inset-top); padding-bottom: env(safe-area-inset-bottom);`
- **D-18:** Text input minimum font-size 16px to prevent iOS Safari zoom on focus. Audit MessageInput, search input, modal inputs — raise any that are below 16px.
- **D-19:** Audit all buttons/clickable elements — ensure minimum 44×44px hit area via `min-width: 44px; min-height: 44px;` (or `padding` that achieves this). Already required by UI-SPEC but needs enforcement pass.
- **D-20:** PWA manifest file at `client/public/manifest.json`:
  - name: "mmess"
  - short_name: "mmess"
  - start_url: "/"
  - display: "standalone"
  - background_color: "#ffffff" (light), theme_color: "#0b57d0" (accent)
  - icons: 192×192 and 512×512 PNG generated from a simple "mm" wordmark (Claude's discretion: inline SVG → PNG tool or pre-generated)
- **D-21:** Link manifest in index.html: `<link rel="manifest" href="/manifest.json">`
- **D-22:** Theme-color meta tag in index.html that matches accent color (enables iOS Safari status bar tint)
- **D-23:** No service worker in v1 (no offline support yet). Just the manifest so "Add to Home Screen" works.

### Production Deployment
- **D-24:** `.env.production.example` template file at project root with ALL required variables documented:
  - `DOMAIN` — e.g. `mmess.example.com`
  - `JWT_SECRET` — with a command to generate (`openssl rand -hex 32`)
  - `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`
  - `DATABASE_URL` — derived pattern
  - `NODE_ENV=production`
  - `LOG_LEVEL=info`
- **D-25:** README.md at project root (or replace existing if present) with production deploy guide. Sections:
  1. Prerequisites (Docker, Docker Compose, a domain pointing at the VPS)
  2. Clone and configure (`.env.production`)
  3. First run (`docker compose up -d`)
  4. Create first admin invite via `docker compose exec api npm run invite`
  5. Register the admin account via the web UI
  6. Day-2 operations: logs, restart, update, backup, restore
- **D-26:** Docker Compose healthchecks for all three services:
  - `postgres`: `pg_isready -U $POSTGRES_USER`
  - `api`: `curl -f http://localhost:3000/health || exit 1` (requires curl in the image OR use wget OR rely on the existing /health endpoint with Node's built-in http module)
  - `caddy`: `caddy version` (process liveness only — Caddy doesn't expose a health endpoint on the admin API in our setup)
- **D-27:** Backup script at `scripts/backup.sh`:
  - `pg_dump` of postgres container into timestamped `backups/db-YYYY-MM-DD.sql.gz`
  - `tar czf backups/uploads-YYYY-MM-DD.tar.gz` of the `mmess_uploads` volume contents
  - Keeps last 7 backups (hard-coded retention)
  - Runs via `docker compose exec postgres pg_dump ...` — no direct volume access from host needed
- **D-28:** Restore script at `scripts/restore.sh` accepts a date argument and inverts the backup process
- **D-29:** No CI/CD. Manual deploy via `git pull && docker compose up -d --build && docker compose logs -f --tail=100 api`. Document in README.

### CSS Debt Cleanup (inherited from Phase 4 verification)
- **D-30:** Replace `color: white` in `ConversationItem.module.css` `.unreadBadge` with `var(--color-on-accent)`
- **D-31:** Replace `color: white` in `MessageItem.module.css` `.deleteBtn` with `var(--color-on-accent)`
- **D-32:** Final grep audit: `grep -rn "color:\s*(white|black|#fff|#000)" client/src/` must return zero matches after Phase 6. All colors MUST use tokens.

### Claude's Discretion
- Exact dark mode color adjustments within the locked palette — fine-tune contrast as needed during execution
- PWA icon generation approach (hand-draw inline SVG → rasterize, or use a simple placeholder and improve later)
- Whether backup script uses `bash` or `sh` (use bash for arrays/readability)
- Whether to add a separate settings page or keep theme toggle inline in sidebar (D-06 locks inline)
- Exact segmented-control styling for the 3-state theme toggle
- Whether to use React context for theme state or a small custom hook with localStorage — both valid

</decisions>

<canonical_refs>
## Canonical References

### Research
- `.planning/research/STACK.md` — Caddy config reference
- `.planning/research/PITFALLS.md` — #9 TLS cert renewal (Caddy handles this automatically; README should note it)

### Project
- `.planning/PROJECT.md`
- `.planning/REQUIREMENTS.md` — UI-01, UI-02, UI-03

### Prior Phases
- `.planning/phases/03-messaging-core/03-UI-SPEC.md` — Design tokens to extend with dark mode overrides
- `.planning/phases/03-messaging-core/03-CONTEXT.md` — D-09/D-10 (responsive sidebar split at 768px)
- `.planning/phases/04-groups-presence/04-VERIFICATION.md` — CSS debt noted
- `.planning/phases/05-file-sharing/05-UI-SPEC.md` — Tokens added in Phase 5 (file-card-bg, lightbox-backdrop)

### Existing Code
- `client/index.html` — add viewport meta, manifest link, theme-color meta, inline pre-hydration script
- `client/src/styles/tokens.css` — add dark mode variant under `:root[data-theme="dark"]`
- `client/src/components/chat/ConversationList.tsx` — add search input + footer theme toggle
- `client/src/components/chat/ChatLayout.tsx` — safe-area insets
- `client/src/components/chat/ConversationItem.module.css` — fix `color: white`
- `client/src/components/chat/MessageItem.module.css` — fix `color: white`
- `docker-compose.yml` — add healthcheck blocks to all 3 services
- `docker-compose.dev.yml` — add healthchecks (may reuse)
- `server/Dockerfile` — may need `wget` or similar for api healthcheck
- `.env.example` (exists from Phase 1) — promote to `.env.production.example` or create new

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `tokens.css` already structured as `:root { ... }` with named CSS custom properties — dark mode is a 15-line addition
- CSS Modules everywhere — no Tailwind migration needed
- ConversationList has a scrollable sidebar-items section — search input fits in the header naturally
- Modal pattern from GroupSettingsModal/Lightbox — reusable for any future settings dialog
- `/health` endpoint exists in `server/src/index.ts` — reusable for Docker healthcheck
- `.env.example` from Phase 1 is the starting template for `.env.production.example`

### Schema Extensions Needed
None — all Phase 6 changes are frontend + infrastructure.

### Integration Points
- Theme toggle component lives in `client/src/components/common/ThemeToggle.tsx` (new), mounted inside ConversationList footer
- Pre-hydration theme script inlined in `index.html` <head>
- Search state lives as local `useState` inside `ConversationList` (no context needed — single consumer)
- Mobile safe-area added as CSS env() calls on `ChatLayout.module.css`
- Docker healthchecks added directly to both compose files

</code_context>

<specifics>
## Specific Ideas

- Segmented theme control: three 36×36 buttons side-by-side with 1px border, active button gets accent bg + on-accent text
- Pre-hydration script (minified): `<script>(function(){var t=localStorage.getItem('mmess.theme')||'system';var r=t==='system'?(matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light'):t;document.documentElement.dataset.theme=r;})();</script>`
- Search input: magnifier icon inside input on the left, × clear icon on the right when query is non-empty
- PWA icons: start with a simple colored square + "mm" text (Claude generates inline SVG → uses a node tool or CDN service to rasterize, OR ships just SVG if browsers accept)
- Healthcheck for api service: use Node's built-in HTTP (`node -e "require('http').get('http://localhost:3000/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"`) — no need to add wget to image

</specifics>

<deferred>
## Deferred Ideas

- Service worker / offline mode → v2
- Desktop notifications when window closed → v2 (requires service worker + Web Push)
- Custom color themes beyond light/dark → v2
- DB-synced theme preference across devices → v2
- CI/CD via GitHub Actions → v2 (manual deploy is sufficient)
- Automated cert renewal alerting → Caddy handles this silently; v2 if monitoring is needed
- i18n / multi-language UI → out of v1
- Accessibility audit (full WCAG AA pass) → incremental; basic aria-labels already in place from Phase 3+
- Per-conversation theme override → out of scope
- Message full-text search → V2-03 (already deferred to v2 in roadmap)

</deferred>

---

*Phase: 06-ui-deploy*
*Context gathered: 2026-04-11*
