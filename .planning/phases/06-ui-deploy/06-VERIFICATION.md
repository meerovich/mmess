---
phase: 06-ui-deploy
verified: 2026-04-11T22:30:00Z
status: human_needed
score: 11/11 automated must-haves verified
human_verification:
  - test: "Toggle between light/dark/system theme in browser — check for flash-free load in dark mode"
    expected: "No white flash before dark theme applies on hard refresh; theme toggle switches all surfaces immediately"
    why_human: "Pre-hydration script correctness and CSS cascade timing cannot be verified by static analysis"
  - test: "Open app on a 390px-wide mobile viewport (Chrome DevTools device toolbar), navigate to a conversation"
    expected: "Sidebar fills full screen, no horizontal scroll, chat pane appears full-screen on tap, no content clipped by notch"
    why_human: "Responsive layout and safe-area inset behavior requires a live browser render"
  - test: "Focus any text input (search, message compose, modal inputs) on iOS Safari"
    expected: "Viewport does NOT zoom on focus"
    why_human: "iOS Safari zoom behavior requires a real iOS device or Simulator"
  - test: "Type in the conversation search bar, verify filter updates in real-time; press Ctrl+K / Cmd+K"
    expected: "List narrows to matching conversations; empty state shows quoted query; Ctrl+K focuses the input"
    why_human: "Real-time filter and keyboard shortcut require browser interaction"
  - test: "Confirm sidebar footer shows logged-in user avatar + username + 3-button toggle"
    expected: "Footer is visible and all three elements render; toggling theme persists after page reload"
    why_human: "Visual layout and localStorage persistence require live session"
  - test: "Check dark mode with unread badges, action buttons, group settings modal"
    expected: "All text remains readable; no invisible-text against background; badge text is dark (#0a0a0a) not white"
    why_human: "Visual contrast in dark mode requires browser render"
---

# Phase 6: UI & Deploy Verification Report

**Phase Goal:** The application has a polished, responsive interface with theme support and search, deployed to production via Docker Compose with full TLS
**Verified:** 2026-04-11T22:30:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Dark mode applies via `data-theme='dark'` on `<html>` without page reload | VERIFIED | `ThemeToggle.tsx` writes `document.documentElement.dataset.theme = resolveTheme(t)` on every button click; tokens.css has full `:root[data-theme="dark"]` block |
| 2 | No flash of wrong theme on page load | VERIFIED (code) | `index.html` pre-hydration script is first child of `<head>`, reads `mmess.theme` from localStorage and sets `dataset.theme` before React loads; human test required to confirm no flash |
| 3 | CSS color debt is zero — no hardcoded `color: white/black/#fff/#000` | VERIFIED | grep across all `client/src/**/*.css` and `*.tsx` returns zero matches |
| 4 | Dark theme token block covers all 23 D-07 tokens | VERIFIED | `:root[data-theme="dark"]` block in tokens.css (lines 68-92) has all 23 token overrides matching the D-07 locked values exactly |
| 5 | PWA manifest linked and parseable | VERIFIED | `index.html` has `<link rel="manifest" href="/manifest.json">`; `client/public/manifest.json` is valid JSON with `name="mmess"` and two PNG icon entries |
| 6 | Safe-area insets on ChatLayout root | VERIFIED | `ChatLayout.module.css` `.layout` has all 4 `env(safe-area-inset-*)` declarations (count: 4) |
| 7 | ThemeToggle renders 3 buttons at 44×44px; localStorage persistence | VERIFIED | `ThemeToggle.module.css` `.btn` has `width/height/min-width/min-height: 44px`; `.active` uses `var(--color-accent)`; `STORAGE_KEY = 'mmess.theme'`; `matchMedia` listener added/removed in `useEffect` |
| 8 | Conversation search filters by name or participant username | VERIFIED | `ConversationList.tsx` filters `state.conversations` by `conv.name` and `conv.participants[].username`, case-insensitive; empty state shows quoted query |
| 9 | All text inputs have font-size >= 16px (iOS Safari anti-zoom) | VERIFIED | `MessageInput.module.css` `.textarea`: 16px; `NewChatModal.module.css` `.searchInput`: 16px; `NewGroupModal.module.css` `.input`: 16px; `GroupSettingsModal.module.css` `.renameInput` and `.searchInput`: 16px; `ConversationList.module.css` `.searchInput`: 16px |
| 10 | Docker Compose healthchecks on all 3 services | VERIFIED | `docker-compose.yml`: postgres (pg_isready), api (Node.js http.get to `/health`), caddy (`caddy version`) — 3 `healthcheck` blocks confirmed; `docker-compose.dev.yml`: same 3 blocks |
| 11 | Deploy artifacts complete | VERIFIED | `.env.production.example` has DOMAIN, POSTGRES_*, DATABASE_URL, NODE_ENV, JWT_ACCESS_SECRET, JWT_REFRESH_SECRET with `openssl rand` generation hints; `scripts/backup.sh`: pg_dump + uploads tar with 7-backup retention; `scripts/restore.sh`: date arg validation + `gunzip` + confirmation prompt; both scripts are `-rwxr-xr-x`; `README.md`: full deploy workflow from prerequisites to day-2 ops |

**Score:** 11/11 truths verified (automated); 6 items require human browser testing

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `client/src/styles/tokens.css` | Dark theme block `:root[data-theme="dark"]` | VERIFIED | 23 token overrides, locked D-07 values |
| `client/index.html` | Pre-hydration script + viewport-fit=cover + manifest link | VERIFIED | Script is first `<head>` child; `viewport-fit=cover`; `theme-color`; `rel="manifest"` |
| `client/public/manifest.json` | PWA manifest with name + icons | VERIFIED | Valid JSON, name="mmess", 2 icon entries |
| `client/public/icon-192.png` | 192px icon | VERIFIED | File exists in `client/public/` |
| `client/public/icon-512.png` | 512px icon | VERIFIED | File exists in `client/public/` |
| `client/src/components/common/ThemeToggle.tsx` | 3-state toggle, localStorage, matchMedia | VERIFIED | Exports `ThemeToggle`; all three modes implemented; `aria-pressed`; matchMedia cleanup |
| `client/src/components/common/ThemeToggle.module.css` | 44×44px buttons per D-19 | VERIFIED | `min-width: 44px; min-height: 44px` on `.btn` |
| `client/src/components/chat/ConversationList.tsx` | Footer + search + ThemeToggle mount | VERIFIED | Imports and renders `<ThemeToggle />`; search state; Ctrl+K handler; filter logic |
| `client/src/components/chat/ConversationList.module.css` | Search row + footer + clearBtn 44px | VERIFIED | `.footer`, `.searchRow`, `.clearBtn` with `min-width: 44px; min-height: 44px` |
| `client/src/components/chat/ChatLayout.module.css` | Safe-area insets on `.layout` | VERIFIED | 4 `env(safe-area-inset-*)` padding declarations |
| `client/src/components/chat/MessageInput.module.css` | `font-size: 16px` on textarea | VERIFIED | Line 59: `font-size: 16px; /* D-18 */` |
| `client/src/components/chat/NewChatModal.module.css` | `font-size: 16px` on searchInput | VERIFIED | Line 35: `font-size: 16px; /* D-18 */` |
| `client/src/components/chat/NewGroupModal.module.css` | `font-size: 16px` on input | VERIFIED | Line 35: `font-size: 16px; /* D-18 */` |
| `client/src/components/chat/GroupSettingsModal.module.css` | `font-size: 16px` on renameInput + searchInput | VERIFIED | Line 120 (renameInput) + line 294 (searchInput): `font-size: 16px; /* D-18 */` |
| `docker-compose.yml` | 3 healthchecks: postgres, api, caddy | VERIFIED | All 3 present with appropriate test commands |
| `docker-compose.dev.yml` | 3 healthchecks: postgres, api, caddy | VERIFIED | All 3 present; api uses 30s start_period for tsx watch |
| `.env.production.example` | All required vars with generation hints | VERIFIED | DOMAIN, POSTGRES_*, DATABASE_URL, NODE_ENV, LOG_LEVEL, JWT_ACCESS_SECRET, JWT_REFRESH_SECRET documented |
| `scripts/backup.sh` | pg_dump + uploads tar + 7-backup retention | VERIFIED | `docker compose exec postgres pg_dump`, uploads volume archive, `RETENTION=7` with xargs prune |
| `scripts/restore.sh` | Date arg + validate + prompt + gunzip + psql | VERIFIED | `gunzip -c`, `CONFIRM` prompt, `--single-transaction -v ON_ERROR_STOP=1` |
| `README.md` | Full deploy guide | VERIFIED | Prerequisites, clone, configure, build+start, first invite, day-2 ops (logs/restart/update/backup/restore/TLS) |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `index.html` | `tokens.css` dark theme | pre-hydration script sets `dataset.theme` before CSS | WIRED | Script reads `mmess.theme` from localStorage, writes `document.documentElement.dataset.theme` |
| `index.html` | `manifest.json` | `<link rel="manifest">` | WIRED | `<link rel="manifest" href="/manifest.json" />` present |
| `ThemeToggle.tsx` | `document.documentElement.dataset.theme` | Direct DOM write on click | WIRED | `applyTheme(t)` calls `document.documentElement.dataset.theme = resolveTheme(t)` |
| `ThemeToggle.tsx` | `localStorage` | `localStorage.setItem('mmess.theme', value)` | WIRED | `select()` calls `localStorage.setItem(STORAGE_KEY, t)` |
| `ConversationList.tsx` | `ThemeToggle` | Import + render in footer div | WIRED | `import { ThemeToggle } from '../common/ThemeToggle'` + `<ThemeToggle />` in footer |
| `docker-compose.yml api healthcheck` | `/health` endpoint | Node.js http.get to `http://localhost:3000/health` | WIRED | Exact pattern `localhost:3000/health` present in test command |
| `scripts/backup.sh` | postgres service | `docker compose exec postgres` | WIRED | Line 21: `docker compose -f "$PROJECT_DIR/docker-compose.yml" exec -T postgres` |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `ConversationList.tsx` | `state.conversations` | `useChat()` from `ChatContext` | Yes — fetched from API on mount, updated via WebSocket | FLOWING |
| `ConversationList.tsx` | `user` (footer) | `useAuth()` from `AuthContext` — `/api/auth/me` on mount | Yes — API call to real endpoint | FLOWING |
| `ThemeToggle.tsx` | `theme` state | `localStorage.getItem('mmess.theme') ?? 'system'` | Yes — real persisted value | FLOWING |

### Behavioral Spot-Checks

Step 7b: SKIPPED for CSS/HTML/shell-script artifacts (no runnable entry points for static analysis). Docker and scripts require a running stack. ThemeToggle and search require a browser session. Flagged for human verification below.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| UI-01 | 06-01, 06-03 | Responsive web interface that works on desktop and mobile browsers | VERIFIED (code) / NEEDS HUMAN (render) | ChatLayout has `@media (max-width: 767px)` responsive rules; safe-area insets; mobile font-size floor enforced |
| UI-02 | 06-01, 06-02 | User can toggle between light and dark theme | VERIFIED (code) / NEEDS HUMAN (visual) | ThemeToggle wired to `dataset.theme`; localStorage persistence; matchMedia for system mode |
| UI-03 | 06-02 | Conversation list with search/filter functionality | VERIFIED (code) / NEEDS HUMAN (interaction) | Search state, filter logic, Ctrl+K, empty state all present in ConversationList.tsx |

All three requirements are fully implemented in code. Human verification is required for runtime behavior.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `GroupSettingsModal.module.css` | 399 | `font-size: 12px` | INFO | This is `.avatarOverlay` — the semi-transparent hover label over avatar images. It is NOT a text input and does not trigger iOS Safari zoom. Not a D-18 violation. |
| `client/src/styles/tokens.css` | 65 | `--color-on-dark-bg: #ffffff` | INFO | Light-mode-only fixed-context token for elements with always-dark backgrounds (Lightbox, avatar overlay). Intentionally excluded from dark mode block — it is always white regardless of theme. Used correctly in Lightbox and GroupSettingsModal avatar overlay. Not a color debt item. |

No blockers or warnings found.

### Human Verification Required

#### 1. Flash-of-Wrong-Theme Test

**Test:** Hard-refresh (`Ctrl+Shift+R`) the app while in dark mode
**Expected:** No white flash before dark background appears; page loads dark immediately
**Why human:** Static analysis cannot verify CSS cascade timing and pre-hydration script execution order in a live browser

#### 2. Mobile Layout — Sidebar + Notch

**Test:** Open Chrome DevTools device toolbar, set viewport to iPhone 14 (390×844). Navigate to a conversation.
**Expected:** Sidebar fills full width, no horizontal scrollbar, chat pane appears full-screen; content not clipped by notch area
**Why human:** `env(safe-area-inset-*)` and `@media (max-width: 767px)` rules require a live browser render

#### 3. iOS Safari Zoom Test

**Test:** On a real iOS device or Simulator, open the app and tap into the conversation search, message compose, or any modal input
**Expected:** Viewport does NOT zoom in on focus
**Why human:** iOS Safari zoom on `font-size < 16px` requires a live iOS environment

#### 4. Theme Persistence and Live System Mode

**Test:** Click Moon → hard-refresh → confirm dark mode; click Monitor → change OS dark/light preference → confirm UI updates without page reload
**Expected:** Preference survives reload; system mode reacts to OS changes live
**Why human:** localStorage behavior and matchMedia live listener require browser interaction

#### 5. Conversation Search UX

**Test:** Type partial name, partial participant username; clear with X button; press Ctrl+K/Cmd+K
**Expected:** List filters in real time; empty state shows quoted query; X clears; Ctrl+K focuses input
**Why human:** Requires live data in the app session

#### 6. Dark Mode Visual Audit

**Test:** Switch to dark mode; check unread badges, action buttons ("New chat"), group settings modal
**Expected:** Unread badge text is dark (not white); all modals readable; no invisible text on dark surfaces
**Why human:** Visual contrast verification requires browser render with real CSS variable resolution

### Gaps Summary

No automated gaps. All 11 observable truths pass code-level verification. The 6 human verification items are behavioral checks that require a live browser — they are standard UAT for a UI phase, not implementation gaps.

The `--color-on-dark-bg` token is intentional (fixed-context, always white, for always-dark overlays) and is not a color debt item. The `font-size: 12px` on `.avatarOverlay` is an overlay label, not an input, so it is not a D-18 violation.

---

_Verified: 2026-04-11T22:30:00Z_
_Verifier: Claude (gsd-verifier)_
