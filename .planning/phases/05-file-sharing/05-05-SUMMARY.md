---
phase: 05-file-sharing
plan: "05"
subsystem: client
tags: [react, typescript, file-upload, drag-drop, lightbox, css-modules, components]

requires:
  - phase: 05-04
    provides: [UploadState discriminated union, uploadFile() XHR helper, UploadStrip component, FileCard component]

provides:
  - MessageInput with paperclip button, drag-drop window listeners, UploadStrip slot, file_id in message:send WS payload
  - MessageItem inline image rendering (max 320x320) with click-to-lightbox trigger
  - MessageItem FileCard rendering for non-image file_id messages
  - Lightbox component: full-viewport image viewer with 150ms fade, Escape handler, CSS spinner

affects: [MessageInput (file attach UX), MessageItem (file/image display), Lightbox (new modal)]

tech-stack:
  added: []
  patterns:
    - uploadState discriminated union narrowed inline in JSX (no boolean intermediates)
    - useCallback for handleFileSelect/handleCancelUpload/handleRetry to stabilize drag-drop effect deps
    - requestAnimationFrame for Lightbox fade-in trigger (avoids immediate opacity:0 → 1 before paint)
    - CSS-only spinner via border + border-top-color + animation in Lightbox
    - window drag event listeners registered in useEffect with handleFileSelect in dep array

key-files:
  created:
    - client/src/components/chat/Lightbox.tsx
    - client/src/components/chat/Lightbox.module.css
  modified:
    - client/src/components/chat/MessageInput.tsx
    - client/src/components/chat/MessageInput.module.css
    - client/src/components/chat/MessageItem.tsx
    - client/src/components/chat/MessageItem.module.css

decisions:
  - handleFileSelect wrapped in useCallback so drag-drop useEffect dep array is stable and effect doesn't re-register on every render
  - Lightbox eslint-disable comment on Escape handler useEffect (handleClose cannot be in dep array without causing stale closure; onClose is stable from parent)
  - Pre-existing TS errors in GroupSettingsModal.tsx (avatar_url on Conversation) are out of scope — introduced by parallel plan 05-06; not caused by this plan

metrics:
  duration_minutes: 15
  completed: "2026-04-11"
  tasks_completed: 2
  files_changed: 6
---

# Phase 05 Plan 05: MessageInput + MessageItem File Attachment Integration Summary

**One-liner:** Wired file upload UX into MessageInput (paperclip, drag-drop, UploadStrip, file_id in WS payload) and file rendering into MessageItem (inline image preview + Lightbox, FileCard for non-images).

---

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Extend MessageInput with paperclip, drag-drop, upload state | 68c2217 | MessageInput.tsx, MessageInput.module.css |
| 2 | MessageItem file rendering + Lightbox component | 7071faa | MessageItem.tsx, MessageItem.module.css, Lightbox.tsx, Lightbox.module.css |

---

## What Was Built

### Task 1: MessageInput Paperclip + Drag-Drop + Upload State

**client/src/components/chat/MessageInput.tsx** — Extended with:

- `uploadState: UploadState` — discriminated union tracking idle/uploading/ready/error lifecycle
- `isDragging: boolean` — activates dashed blue border when files are dragged over the window
- `fileInputRef` — hidden `<input type="file">` triggered by paperclip button click
- `handleFileSelect(file)` — 25 MB client-side size check; calls `uploadFile()` XHR helper; updates state through uploading → ready (or error on failure, idle on abort)
- `handleCancelUpload` — aborts in-progress XHR via AbortController; resets to idle
- `handleRetry` — re-calls handleFileSelect with same file on error state
- Window drag event listeners in useEffect: `dragenter`/`dragleave`/`drop`/`dragover` — `dragleave` only deactivates when `relatedTarget === null` (cursor left window)
- Modified `handleSend`: includes `file_id` in WS `message:send` payload when `uploadState.status === 'ready'`; caption-only messages allowed (empty text + ready file → send enabled)
- Optimistic message includes all six file fields: `file_id`, `file_name`, `file_mime`, `file_size`, `is_image`, `thumbnail_url`
- `isDisabled` logic: disabled when `(no text AND no ready file) OR uploading OR error`; enabled when file ready even with empty textarea
- Paperclip button: 36×36px, `aria-label="Attach file"`, `aria-disabled` when uploading, SVG paperclip icon
- UploadStrip rendered above row when `uploadState.status !== 'idle'`

**client/src/components/chat/MessageInput.module.css** — Added:
- `.attachBtn`: flex 36×36, hover accent color + muted background, disabled opacity 0.4
- `.dragOver`: 2px dashed `var(--color-accent)` outline, `rgba(11,87,208,0.04)` background tint

### Task 2: MessageItem File Rendering + Lightbox

**client/src/components/chat/MessageItem.tsx** — Extended with:

- Imports `FileCard` and `Lightbox`
- `lightboxOpen: boolean` state — controls Lightbox mount/unmount
- Content block replaced: when `message.file_id && message.is_image` → renders `imageContainer` div with `<img>` thumbnail (uses `thumbnail_url` with fallback to `/api/files/:id/thumb`); click/Enter opens Lightbox
- When `message.file_id && !message.is_image && message.file_name` → renders `<FileCard>`
- `message.content` only rendered when truthy (supports file-only messages without empty text div)
- Lightbox mounted outside bubble but inside item div: `{lightboxOpen && message.file_id && <Lightbox ... />}`

**client/src/components/chat/MessageItem.module.css** — Added:
- `.imageContainer`: cursor pointer, border-radius 8px, overflow hidden, `--color-surface-secondary` bg, inline-block, max-width 320px
- `.inlineImage`: max 320×320, object-fit contain, border-radius 8px

**client/src/components/chat/Lightbox.tsx** — New file:
- `isVisible` state toggled via `requestAnimationFrame` for fade-in on mount
- `isLoaded` state toggled via `<img onLoad>` to show/hide spinner
- Escape key handler via `document.addEventListener('keydown', ...)`
- `handleClose` sets `isVisible = false`, then calls `onClose` after 150ms (fade-out before unmount)
- Backdrop click calls `handleClose`; imageWrapper has `stopPropagation` so image click doesn't close
- `autoFocus` on close button for accessibility
- Full-size image from `/api/files/:id` (not thumbnail)

**client/src/components/chat/Lightbox.module.css** — New file:
- `.backdrop`: fixed inset 0, z-index 1000, `var(--color-lightbox-backdrop)`, flex centered, opacity 0 → 1 via `.visible` class
- `.closeBtn`: absolute top/right `--space-md`, 40×40px circle, `rgba(255,255,255,0.15)` bg, white ×
- `.spinner`: CSS-only 48×48 rotating border animation (`var(--color-accent)` arc)
- `.image`: max 90vw/90vh, opacity 0 → 1 via `.imageLoaded` class

---

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] useCallback wrapping for handleFileSelect stability**
- **Found during:** Task 1 code review
- **Issue:** The drag-drop `useEffect` lists `handleFileSelect` as a dependency. Without `useCallback`, handleFileSelect would be a new function reference every render, causing the drag event listeners to be removed and re-added on every render cycle.
- **Fix:** Wrapped `handleFileSelect`, `handleCancelUpload`, and `handleRetry` in `useCallback` with appropriate dep arrays.
- **Files modified:** `client/src/components/chat/MessageInput.tsx`
- **Commit:** 68c2217

### Out-of-Scope Discoveries

**Pre-existing TS errors in GroupSettingsModal.tsx** (avatar_url on Conversation type) — introduced by parallel plan 05-06 executing simultaneously. Not caused by this plan. Deferred to 05-06 resolution.

---

## Known Stubs

None — all components are fully implemented. MessageInput file upload wired to `uploadFile()` API helper. MessageItem renders real file data from message object. Lightbox loads full-size image from live endpoint.

---

## Self-Check: PASSED

Files verified present:
- client/src/components/chat/MessageInput.tsx: FOUND (68c2217)
- client/src/components/chat/MessageInput.module.css: FOUND (68c2217)
- client/src/components/chat/MessageItem.tsx: FOUND (7071faa)
- client/src/components/chat/MessageItem.module.css: FOUND (7071faa)
- client/src/components/chat/Lightbox.tsx: FOUND (7071faa)
- client/src/components/chat/Lightbox.module.css: FOUND (7071faa)

Commits verified:
- 68c2217: feat(05-05): extend MessageInput with paperclip, drag-drop, and upload state — FOUND
- 7071faa: feat(05-05): add file/image rendering to MessageItem + Lightbox component — FOUND
