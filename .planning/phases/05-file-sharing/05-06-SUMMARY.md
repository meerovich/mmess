---
phase: 05-file-sharing
plan: "06"
subsystem: client
tags: [react, typescript, avatar, file-upload, group-settings, css-modules]

requires:
  - phase: 05-04
    provides: [uploadFile() XHR helper, UploadState discriminated union, UploadStrip component]

provides:
  - Avatar component with optional avatarUrl prop — renders img with initials fallback
  - GroupSettingsModal admin avatar upload — click-to-upload with XHR progress strip
  - PATCH /api/conversations/:id integration for avatar_url update

affects: [ConversationItem (uses Avatar), GroupSettingsModal (avatar upload)]

tech-stack:
  added: []
  patterns:
    - useState for imgError in Avatar — avoids broken img rendering on load failure
    - Inline UploadState discriminated union narrowing carried from Plan 04
    - localAvatarUrl optimistic state + WS conversation:updated confirmation
    - useEffect sync localAvatarUrl from conversation.avatar_url prop

key-files:
  created: []
  modified:
    - client/src/components/common/Avatar.tsx
    - client/src/components/common/Avatar.module.css
    - client/src/components/chat/GroupSettingsModal.tsx
    - client/src/components/chat/GroupSettingsModal.module.css

decisions:
  - avatarUrl optional prop preserves all existing Avatar usages without change
  - object-fit cover on .avatar CSS rule applies to both img and div variants cleanly
  - avatarOverlayVisible CSS class used for always-visible overlay when no existing avatar
  - localAvatarUrl synced via useEffect on conversation.avatar_url to stay in sync with WS broadcasts
  - avatar_url stored as '/api/files/<id>' matching server checkFileAccess exact-string check

metrics:
  duration_minutes: 8
  completed: "2026-04-11"
  tasks_completed: 2
  files_changed: 4
---

# Phase 05 Plan 06: Avatar URL Prop and Group Avatar Upload Summary

**One-liner:** Extended Avatar component to render actual images from server with initials fallback on error, and wired GroupSettingsModal with admin-only click-to-upload avatar flow using the existing uploadFile() XHR helper and PATCH endpoint.

---

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Extend Avatar component with avatarUrl prop | d4c920e | client/src/components/common/Avatar.tsx, Avatar.module.css |
| 2 | GroupSettingsModal avatar upload UI | 0d2ff01 | client/src/components/chat/GroupSettingsModal.tsx, GroupSettingsModal.module.css |
| 3 | Human verify checkpoint | auto-approved | N/A |

---

## What Was Built

### Task 1: Avatar avatarUrl Prop

**client/src/components/common/Avatar.tsx** — Added optional `avatarUrl?: string | null` prop. When `avatarUrl` is a non-empty string and no `imgError`, renders `<img src={avatarUrl} alt={name}>` using the same `.avatar` and size CSS classes as the initials div. On `onError`: sets `imgError` state → falls back to initials circle. All existing usages (ConversationItem, GroupSettingsModal Members list, search results) remain backward-compatible — `avatarUrl` is optional with no default.

**client/src/components/common/Avatar.module.css** — Added `object-fit: cover` to the `.avatar` rule. Applied to both img and div variants; has no visual effect on the `div` initials circle but correctly crops uploaded avatar images to fill the circular frame.

### Task 2: GroupSettingsModal Avatar Upload

**client/src/components/chat/GroupSettingsModal.tsx** — Added:
- `avatarUploadState: UploadState` local state (starts at `{ status: 'idle' }`)
- `localAvatarUrl: string | null` state initialized from `conversation.avatar_url`
- `avatarFileInputRef` ref for hidden file input
- `handleAvatarFileSelect(file)` handler: size check (25 MB), XHR upload via `uploadFile()` with progress callbacks, on success PATCH `/api/conversations/:id` with `{ avatar_url: '/api/files/<id>' }`, optimistic `setLocalAvatarUrl`, WS `conversation:updated` confirms
- `useEffect` to sync `localAvatarUrl` when `conversation.avatar_url` changes via WS
- Avatar wrapper div with `avatarWrapper` CSS class: clickable for admin (triggers file input), static for non-admin
- Hidden `<input type="file" accept="image/*">` inside admin-only conditional
- Hover overlay `<div>` with "Change" text — always visible when `localAvatarUrl` is null (uses `avatarOverlayVisible` class), otherwise shows on hover
- `UploadStrip` rendered when `avatarUploadState.status !== 'idle'` with cancel/retry handlers

**client/src/components/chat/GroupSettingsModal.module.css** — Added:
- `.avatarWrapper`: `position: relative; display: inline-block; cursor: pointer`
- `.avatarOverlay`: absolute overlay covering parent, 50% border-radius, dark background, centered "Change" text, `opacity: 0` with 150ms transition
- `.avatarWrapper:hover .avatarOverlay`: `opacity: 1` hover reveal
- `.avatarOverlayVisible`: `opacity: 1` for always-shown overlay when no avatar exists

---

## Deviations from Plan

None — plan executed exactly as written. The plan's JSX had a noted duplicate `style` prop which was avoided by writing a single `style` prop on the wrapper div (the plan itself flagged this and instructed to write it correctly).

---

## Known Stubs

None — Avatar renders actual images from server; GroupSettingsModal wires the full upload flow end-to-end.

---

## Self-Check: PASSED

Files verified present:
- client/src/components/common/Avatar.tsx: FOUND
- client/src/components/common/Avatar.module.css: FOUND
- client/src/components/chat/GroupSettingsModal.tsx: FOUND
- client/src/components/chat/GroupSettingsModal.module.css: FOUND

Commits verified:
- d4c920e: feat(05-06): extend Avatar with avatarUrl prop and img fallback to initials — FOUND
- 0d2ff01: feat(05-06): add avatar upload UI to GroupSettingsModal for admins — FOUND
