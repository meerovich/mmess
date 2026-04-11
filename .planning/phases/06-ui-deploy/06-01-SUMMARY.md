---
phase: 06-ui-deploy
plan: 01
subsystem: ui
tags: [css, dark-mode, pwa, tokens, mobile]

# Dependency graph
requires:
  - phase: 05-file-sharing
    provides: file-card-bg and lightbox-backdrop tokens added to tokens.css
  - phase: 04-groups-presence
    provides: presence color tokens in tokens.css; CSS module patterns
  - phase: 03-messaging-core
    provides: ChatLayout, ConversationItem, MessageItem, ConversationList CSS modules

provides:
  - :root[data-theme="dark"] token block with 24 locked override values (D-07)
  - --color-on-dark-bg fixed-context token for always-dark-background UI elements
  - Pre-hydration theme script in index.html (prevents flash of wrong theme)
  - PWA manifest + 192px and 512px icon PNGs
  - viewport-fit=cover + theme-color meta in index.html
  - safe-area env() insets on ChatLayout .layout
  - Zero hardcoded color literals in client/src/ (grep audit passes)

affects: [06-02-theme-toggle, 06-03-search, 06-04-deploy]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "CSS dark theme via :root[data-theme='dark'] selector with token overrides"
    - "Pre-hydration theme script as first child of <head> prevents FOWT"
    - "env(safe-area-inset-*) on root layout element for iOS notch support"
    - "--color-on-dark-bg for UI elements always on dark backgrounds (lightbox, overlays)"

key-files:
  created:
    - client/public/manifest.json
    - client/public/icon-192.png
    - client/public/icon-512.png
  modified:
    - client/src/styles/tokens.css
    - client/index.html
    - client/src/components/chat/ChatLayout.module.css
    - client/src/components/chat/ConversationItem.module.css
    - client/src/components/chat/MessageItem.module.css
    - client/src/components/chat/ConversationList.module.css
    - client/src/components/chat/GroupSettingsModal.module.css
    - client/src/components/chat/Lightbox.module.css
    - client/src/components/chat/MessageInput.module.css
    - client/src/components/chat/NewGroupModal.module.css
    - client/src/components/common/Avatar.module.css

key-decisions:
  - "Added --color-on-dark-bg token for Lightbox closeBtn and GroupSettingsModal avatarOverlay — these are always on near-black backgrounds and need fixed-white text regardless of theme"
  - "Dark mode --color-on-accent = #0a0a0a (near-black text on light-blue #8ab4f8 buttons in dark mode)"
  - "Icon PNGs generated via sharp SVG rasterization: blue #0b57d0 square + white mm wordmark"

patterns-established:
  - "All color literals in CSS modules MUST use CSS custom property tokens — no hardcoded color values"
  - "Fixed-dark-context elements use --color-on-dark-bg, not --color-on-accent"

requirements-completed: [UI-01, UI-02]

# Metrics
duration: 12min
completed: 2026-04-11
---

# Phase 6 Plan 01: Design System Foundation Summary

**Dark-theme token block + CSS debt elimination + PWA manifest + safe-area insets — zero hardcoded color literals remain in client/src/**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-04-11T22:07:00Z
- **Completed:** 2026-04-11T22:19:00Z
- **Tasks:** 2
- **Files modified:** 11

## Accomplishments
- Added 24-token `:root[data-theme="dark"]` block to tokens.css (D-07 locked values verbatim)
- Eliminated all hardcoded `color: white/black/#fff/#000` literals across 9 CSS module files
- Updated index.html with pre-hydration theme script, viewport-fit=cover, theme-color meta, manifest link
- Created manifest.json + generated icon-192.png and icon-512.png via sharp (blue wordmark "mm")
- Added env(safe-area-inset-*) padding on ChatLayout .layout for iOS notch support

## Task Commits

1. **Task 1: Dark theme token block + CSS color debt cleanup** - `07d625a` (feat)
2. **Task 2: Update index.html + PWA manifest + icon PNGs** - `76c0926` (feat)

**Plan metadata:** _(committed below)_

## Files Created/Modified
- `client/src/styles/tokens.css` - Added :root[data-theme="dark"] with 24 overrides + --color-on-dark-bg token
- `client/index.html` - Pre-hydration script, viewport-fit=cover, theme-color meta, manifest link
- `client/public/manifest.json` - PWA web app manifest with name, icons, display:standalone
- `client/public/icon-192.png` - 192x192 PWA icon (blue square + mm wordmark)
- `client/public/icon-512.png` - 512x512 PWA icon (blue square + mm wordmark)
- `client/src/components/chat/ChatLayout.module.css` - safe-area env() insets on .layout
- `client/src/components/chat/ConversationItem.module.css` - .unreadBadge: color: white → var(--color-on-accent)
- `client/src/components/chat/MessageItem.module.css` - .deleteBtn: color: white → var(--color-on-accent)
- `client/src/components/chat/ConversationList.module.css` - .actionButton: color: white → var(--color-on-accent)
- `client/src/components/chat/GroupSettingsModal.module.css` - .avatarOverlay: color: #fff → var(--color-on-dark-bg)
- `client/src/components/chat/Lightbox.module.css` - .closeBtn: color: #ffffff → var(--color-on-dark-bg)
- `client/src/components/chat/MessageInput.module.css` - .sendBtn: color: white → var(--color-on-accent)
- `client/src/components/chat/NewGroupModal.module.css` - .createButton: color: white → var(--color-on-accent)
- `client/src/components/common/Avatar.module.css` - .avatar: color: white → var(--color-on-accent)

## Decisions Made
- Added `--color-on-dark-bg: #ffffff` fixed-context token for elements that are always displayed on near-black backgrounds (Lightbox close button on dark backdrop, GroupSettingsModal avatar overlay). These must remain white on both light and dark themes because their background is always dark — `--color-on-accent` in dark mode resolves to `#0a0a0a` which would be invisible.
- All other accent-background elements use `--color-on-accent` which correctly resolves to `#ffffff` in light mode and `#0a0a0a` in dark mode (dark mode accent is `#8ab4f8` — light blue, needs dark text for contrast).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Extended CSS debt fix to 6 additional files beyond the 3 planned**
- **Found during:** Task 1 (CSS color debt cleanup)
- **Issue:** Initial grep audit revealed hardcoded color literals in GroupSettingsModal.module.css (.avatarOverlay: #fff), Lightbox.module.css (.closeBtn: #ffffff), MessageInput.module.css (.sendBtn: white), NewGroupModal.module.css (.createButton: white), Avatar.module.css (.avatar: white). Plan only named ConversationItem, MessageItem, ConversationList.
- **Fix:** Replaced all with appropriate tokens. Added `--color-on-dark-bg` token for always-dark-background elements (Lightbox, GroupSettingsModal overlay). Others use `var(--color-on-accent)`.
- **Files modified:** GroupSettingsModal.module.css, Lightbox.module.css, MessageInput.module.css, NewGroupModal.module.css, Avatar.module.css, tokens.css
- **Verification:** grep audit returns ZERO_MATCHES_OK
- **Committed in:** `07d625a` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (Rule 2 - missing critical)
**Impact on plan:** The extended fix was required for the D-32 audit to pass — the plan's acceptance criteria require zero hardcoded color literals in all of client/src/, not just the three named files.

## Issues Encountered
None — sharp SVG rasterization succeeded on Windows without librsvg issues.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Dark theme CSS infrastructure is complete and ready for Plan 02 (ThemeToggle component)
- Pre-hydration script in index.html ensures no flash of wrong theme when ThemeToggle is wired
- PWA manifest is live — "Add to Home Screen" will work once deployed
- Safe-area insets are transparent on desktop (env() resolves to 0px on non-notch devices)

## Known Stubs
None — all changes are infrastructure (tokens, HTML meta, manifest). No data-dependent UI components modified.

## Self-Check: PASSED

- FOUND: client/src/styles/tokens.css
- FOUND: client/index.html
- FOUND: client/public/manifest.json
- FOUND: client/public/icon-192.png
- FOUND: client/public/icon-512.png
- FOUND: .planning/phases/06-ui-deploy/06-01-SUMMARY.md
- COMMIT 07d625a: verified in git log
- COMMIT 76c0926: verified in git log

---
*Phase: 06-ui-deploy*
*Completed: 2026-04-11*
