---
status: partial
phase: 06-ui-deploy
source: [06-VERIFICATION.md]
started: 2026-04-11
updated: 2026-04-11
---

## Current Test

[awaiting runtime verification on running stack + physical mobile device]

## Tests

### 1. No flash of wrong theme on hard refresh
expected: Set theme to dark in the toggle. Hard-refresh the page (Ctrl+Shift+R). No visible white flash before the dark theme applies — the pre-hydration inline script in index.html runs before React mounts.
result: [pending]

### 2. Mobile layout (390px viewport, iOS notch)
expected: Open DevTools → iPhone 12 Pro viewport (390px). Sidebar and chat pane switch to single-pane navigation. Back button returns from chat to conversation list. No horizontal scrolling. Safe-area insets push content away from the iPhone notch.
result: [pending]

### 3. iOS Safari input zoom prevention (D-18)
expected: On a real iPhone or iOS Simulator Safari, tap each input field (MessageInput textarea, NewChatModal search, NewGroupModal name + search, GroupSettingsModal rename + search, ConversationList search). Viewport does NOT zoom in — all inputs are 16px minimum.
result: [pending]

### 4. Theme toggle 3-state behavior
expected: Click "Light" → UI turns light, localStorage['mmess.theme']='light'. Click "Dark" → UI turns dark, localStorage='dark'. Click "System" → follows OS preference. Change OS dark/light mode while on "System" → UI updates live without reload (matchMedia listener).
result: [pending]

### 5. Theme persists across browser restart
expected: Set theme to "Dark". Close browser completely. Reopen the app. UI loads in dark mode with no flash.
result: [pending]

### 6. Conversation search
expected: Type in search input → conversation list filters in real-time. Matches both chat names AND participant usernames. Ctrl+K (Cmd+K on Mac) focuses the search input from anywhere. × clear button resets the query. Empty state "No conversations match '[query]'" shows when no results.
result: [pending]

### 7. 44px touch targets on theme toggle
expected: Each of the 3 toggle buttons (sun/moon/monitor) has a minimum 44×44px hit area on mobile. Tap accuracy is reliable.
result: [pending]

### 8. Dark mode visual audit
expected: In dark mode, verify no contrast issues on: unread badges, delete confirmation buttons, NewChatModal/NewGroupModal/GroupSettingsModal, Lightbox close button, GroupSettingsModal avatar overlay, FileCard backgrounds, reaction badges, typing indicator, ConversationItem active state.
result: [pending]

### 9. PWA "Add to Home Screen" (iOS)
expected: On iOS Safari, Share → "Add to Home Screen" offers the app with the "mm" wordmark icon. Tap the icon → app opens in standalone mode (no Safari chrome).
result: [pending]

### 10. PWA "Install" (Android/Chrome)
expected: On Android Chrome, "Install" option appears in the browser menu. After install, app launches standalone.
result: [pending]

### 11. Production deploy: first-time setup
expected: On a fresh VPS, clone repo → copy `.env.production.example` to `.env.production` and fill values → `docker compose up -d` → all 3 services become healthy within 60 seconds → `docker compose exec api npm run invite` generates invite → register admin via web → login → send first message.
result: [pending]

### 12. Production deploy: Caddy auto-TLS
expected: With `DOMAIN=messenger.example.com` and DNS pointed at the VPS, Caddy automatically obtains a Let's Encrypt certificate. `https://messenger.example.com` loads with a valid cert. `http://...` redirects to `https://...`.
result: [pending]

### 13. Healthchecks reflect real status
expected: `docker compose ps` shows all 3 services as "healthy". Stopping postgres shows "unhealthy" within the retry window. Restarting returns to "healthy".
result: [pending]

### 14. Backup script works
expected: Run `./scripts/backup.sh`. Creates timestamped `backups/db-YYYY-MM-DD.sql.gz` and `backups/uploads-YYYY-MM-DD.tar.gz`. After 8 runs, oldest backup is auto-deleted (7-day retention).
result: [pending]

### 15. Restore script works
expected: With a fresh DB + uploads volume, run `./scripts/restore.sh YYYY-MM-DD`. Prompt confirms "yes". DB + uploads restored. App functional as before.
result: [pending]

## Summary

total: 15
passed: 0
issues: 0
pending: 15
skipped: 0
blocked: 0

## Gaps

### None

All 11 automated must-haves verified in 06-VERIFICATION.md. No code gaps — only runtime UAT items pending.
