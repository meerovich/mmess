---
phase: 06-ui-deploy
plan: 02
subsystem: ui
tags: [theme-toggle, dark-mode, search, mobile, accessibility]

# Dependency graph
requires:
  - phase: 06-ui-deploy
    plan: 01
    provides: ":root[data-theme='dark'] token block in tokens.css; --color-accent, --color-on-accent, --color-border tokens"

provides:
  - ThemeToggle component: 3-state (light/dark/system) toggle with 44px buttons
  - ConversationList: search row + footer zone with user avatar + ThemeToggle
  - D-18 font-size floor: all text inputs/textareas in chat components >= 16px
  - D-19 touch targets: ThemeToggle buttons 44x44px; clearBtn 44px touch target

affects: [06-03-deploy]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "3-state theme toggle: localStorage.getItem('mmess.theme') ?? 'system' as initial state"
    - "matchMedia change listener added/removed only in 'system' mode via useEffect dependency"
    - "applyTheme writes document.documentElement.dataset.theme — matches pre-hydration script pattern"
    - "Client-side conversation filter as derived value (no context, no API call)"
    - "Ctrl+K global keydown listener for search focus — cleaned up on unmount"

key-files:
  created:
    - client/src/components/common/ThemeToggle.tsx
    - client/src/components/common/ThemeToggle.module.css
  modified:
    - client/src/components/chat/ConversationList.tsx
    - client/src/components/chat/ConversationList.module.css
    - client/src/components/chat/MessageInput.module.css
    - client/src/components/chat/NewChatModal.module.css
    - client/src/components/chat/NewGroupModal.module.css
    - client/src/components/chat/GroupSettingsModal.module.css

key-decisions:
  - "Avatar component called with name+size='sm' (not user object) — actual Avatar API uses name/size/avatarUrl props, not a user object"
  - "AuthUser has no avatar_url field — footer uses username-based initials avatar only"
  - "font-size: 12px on .avatarOverlay in GroupSettingsModal retained — it is a visual label overlay, not an input/textarea; iOS Safari zoom does not apply"

requirements-completed: [UI-02, UI-03]

# Metrics
duration: 8min
completed: 2026-04-11
---

# Phase 6 Plan 02: ThemeToggle + ConversationList Search + D-18/D-19 Mobile Audit Summary

**ThemeToggle component (44px buttons, localStorage persistence, live OS tracking) + ConversationList search row + footer zone + 16px font-size floor on all chat inputs**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-04-11T19:14:47Z
- **Completed:** 2026-04-11T19:22:00Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments

- Created ThemeToggle component: 3-state segmented control (sun/moon/monitor icons), 44x44px buttons per D-19, writes localStorage + document.documentElement.dataset.theme on click, live OS change tracking via matchMedia listener in system mode
- Updated ConversationList with search row (D-09): magnifier icon, 16px input, clear button (44px touch target, D-19), Ctrl+K/Cmd+K shortcut (D-14)
- Client-side filter by conversation name OR participant username, case-insensitive (D-10/D-11)
- Empty state shows query-specific message when no results (D-12)
- Footer zone: user Avatar (sm=32px initials) + username + ThemeToggle (D-06)
- D-18 font-size floor: patched textarea in MessageInput, searchInput in NewChatModal, input in NewGroupModal, renameInput+searchInput in GroupSettingsModal — all now explicit 16px

## Task Commits

1. **Task 1: Create ThemeToggle component** - `d53a2a6` (feat)
2. **Task 2: ConversationList search + footer + D-18 audit** - `780ca56` (feat)

## Files Created/Modified

- `client/src/components/common/ThemeToggle.tsx` - New: 3-state theme toggle, localStorage + data-theme DOM writes
- `client/src/components/common/ThemeToggle.module.css` - New: 44x44px segmented control buttons; .active uses var(--color-accent)
- `client/src/components/chat/ConversationList.tsx` - Search state + filter logic + searchRow + footer with Avatar+ThemeToggle
- `client/src/components/chat/ConversationList.module.css` - searchRow, searchInputWrap, searchInput (16px), clearBtn (44px), footer, footerName
- `client/src/components/chat/MessageInput.module.css` - .textarea: font-size: var(--text-body) → 16px (D-18)
- `client/src/components/chat/NewChatModal.module.css` - .searchInput: font-size: var(--text-body) → 16px (D-18)
- `client/src/components/chat/NewGroupModal.module.css` - .input: font-size: var(--text-body) → 16px (D-18)
- `client/src/components/chat/GroupSettingsModal.module.css` - .renameInput + .searchInput: font-size: var(--text-body) → 16px (D-18)

## Decisions Made

- Avatar component called with `name={user.username} size="sm"` — the actual Avatar API uses `name`/`size`/`avatarUrl` props (size is a string enum 'sm'|'md'|'lg', not a numeric px value). The plan's interface description assumed a different API; adapted to match real implementation.
- AuthUser shape has no `avatar_url` field — footer avatar falls back to initials-only rendering. This is correct behavior and does not require a plan deviation.
- `.avatarOverlay` `font-size: 12px` in GroupSettingsModal retained — this is a visual overlay label on an avatar image, not an input/textarea element. iOS Safari zoom only triggers on focused inputs; 12px non-interactive text is out of scope for D-18.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Adapted Avatar call to match real component API**
- **Found during:** Task 2 (reading Avatar.tsx before writing ConversationList)
- **Issue:** Plan interface contract specified `<Avatar user={userObject} size={32} />` but the actual Avatar component signature is `Avatar({ name, size, avatarUrl })` where size is 'sm'|'md'|'lg'. Using the plan's API would cause a TypeScript compile error.
- **Fix:** Called `<Avatar name={user.username} size="sm" />` — 'sm' maps to 32px per Avatar.module.css
- **Files modified:** `client/src/components/chat/ConversationList.tsx`
- **Committed in:** `780ca56` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - Bug)
**Impact on plan:** No functional impact — avatar renders identically with the correct API call.

## Issues Encountered
None beyond the Avatar API mismatch which was caught and fixed inline.

## User Setup Required
None.

## Next Phase Readiness
- ThemeToggle is fully functional: light/dark/system modes work; theme persists across reloads; pre-hydration script from Plan 01 prevents flash of wrong theme
- Conversation search is fully functional: client-side filter, keyboard shortcut, clear button, empty states
- All text inputs in chat components have font-size >= 16px — iOS Safari zoom is prevented

## Known Stubs
None — ThemeToggle writes directly to localStorage and DOM; search filters real conversation state from ChatContext. No placeholder data.

## Self-Check: PASSED

- FOUND: client/src/components/common/ThemeToggle.tsx
- FOUND: client/src/components/common/ThemeToggle.module.css
- FOUND: client/src/components/chat/ConversationList.tsx (contains ThemeToggle import + searchQuery)
- FOUND: client/src/components/chat/ConversationList.module.css (contains footer, searchRow, 16px, 44px)
- FOUND: client/src/components/chat/MessageInput.module.css (contains font-size: 16px)
- FOUND: client/src/components/chat/NewChatModal.module.css (contains font-size: 16px)
- FOUND: client/src/components/chat/NewGroupModal.module.css (contains font-size: 16px)
- FOUND: client/src/components/chat/GroupSettingsModal.module.css (contains 2x font-size: 16px)
- COMMIT d53a2a6: verified (Task 1)
- COMMIT 780ca56: verified (Task 2)

---
*Phase: 06-ui-deploy*
*Completed: 2026-04-11*
