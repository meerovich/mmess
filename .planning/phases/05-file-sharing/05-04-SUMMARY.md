---
phase: 05-file-sharing
plan: "04"
subsystem: client
tags: [react, typescript, file-upload, xhr, css-modules, components]

requires:
  - phase: 05-02
    provides: [POST /api/files response shape, UploadedFile interface contract]
  - phase: 05-03
    provides: [GET /api/files/:id download endpoint, file fields on message objects]

provides:
  - Extended Message interface with optional file attachment fields
  - UploadedFile interface matching POST /api/files response shape
  - UploadState discriminated union for upload lifecycle management
  - uploadFile() XHR helper with progress tracking and AbortController integration
  - --color-file-card-bg and --color-lightbox-backdrop CSS tokens
  - FileIcon component: inline SVG per MIME type
  - FileCard component: non-image attachment card with download trigger
  - UploadStrip component: upload progress strip with three state variants

affects: [05-05, MessageInput (file attach button + upload strip), MessageItem (FileCard + image render)]

tech-stack:
  added: []
  patterns:
    - XHR instead of fetch for upload progress events (D-24)
    - AbortController integration via signal.addEventListener('abort') → xhr.abort()
    - CSS custom properties (var(--token)) for all colors and spacing
    - Discriminated union narrowing inline in JSX (uploadState.status === 'uploading') for TS type safety
    - URL.createObjectURL + useEffect cleanup for image preview in UploadStrip
    - window.location.href for native browser download (no blob streaming)

key-files:
  created:
    - client/src/components/common/FileIcon.tsx
    - client/src/components/common/FileIcon.module.css
    - client/src/components/chat/FileCard.tsx
    - client/src/components/chat/FileCard.module.css
    - client/src/components/chat/UploadStrip.tsx
    - client/src/components/chat/UploadStrip.module.css
  modified:
    - client/src/types/chat.ts
    - client/src/lib/api.ts
    - client/src/styles/tokens.css

decisions:
  - Discriminated union narrowed inline in JSX rather than via boolean vars — avoids TS type narrowing failures on local boolean intermediates
  - HTML entities (&#215;, &#10003;) for cancel/checkmark symbols — avoids encoding issues in JSX string literals
  - formatSizeForStrip kept as file-local function in UploadStrip — not exported, only used by this component

metrics:
  duration_minutes: 12
  completed: "2026-04-11"
  tasks_completed: 2
  files_changed: 9
---

# Phase 05 Plan 04: Client Types, uploadFile Helper, and File Components Summary

**One-liner:** Extended Message type with file fields, XHR uploadFile() helper with progress/abort, and three leaf components (FileIcon, FileCard, UploadStrip) using inline SVGs and CSS custom properties — all ready for Plan 05-05 composition.

---

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Extend types, add tokens, add uploadFile helper | 0db949d | client/src/types/chat.ts, client/src/lib/api.ts, client/src/styles/tokens.css |
| 2 | FileIcon, FileCard, and UploadStrip components | c05e6d3 | 6 new component files |

---

## What Was Built

### Task 1: Types + Tokens + uploadFile Helper

**client/src/types/chat.ts** — Extended `Message` interface with six optional file fields: `file_id`, `file_name`, `file_mime`, `file_size`, `is_image`, `thumbnail_url`. Added `UploadedFile` interface (matches POST /api/files response: id, name, mime_type, size, is_image, thumbnail_url, download_url) and `UploadState` discriminated union covering idle/uploading/ready/error states.

**client/src/lib/api.ts** — Added `uploadFile(file, onProgress, signal): Promise<UploadedFile>` using `XMLHttpRequest`. Uses `xhr.withCredentials = true` for cookie-based auth (same as `apiFetch`). Progress capped at 99% during upload; 100% implied by resolve. Specific 413/400 error messages. AbortController integration via `signal.addEventListener('abort', () => xhr.abort(), { once: true })`.

**client/src/styles/tokens.css** — Added two tokens under a Phase 5 comment block: `--color-file-card-bg: #f8f9fa` and `--color-lightbox-backdrop: rgba(0, 0, 0, 0.85)`.

### Task 2: Components

**FileIcon** (`client/src/components/common/FileIcon.tsx`) — Inline SVG selector by MIME type. PDF: folded-corner rectangle with red "PDF" text. Video: camera/play icon. Audio: waveform bars. Archive (zip/rar/7z): box with zipper lines. Generic: document with fold. All 32×32px, stroke-based, `aria-hidden="true"`.

**FileCard** (`client/src/components/chat/FileCard.tsx`) — Non-image attachment card. Renders FileIcon + filename (truncated) + formatted size (B/KB/MB). Clicking anywhere on the card or the download arrow button triggers `window.location.href = '/api/files/${fileId}'` for native browser download. Min-width 200px, max-width 280px per spec.

**UploadStrip** (`client/src/components/chat/UploadStrip.tsx`) — Upload progress strip above textarea. Accepts `Exclude<UploadState, { status: 'idle' }>` (only non-idle states). Renders: thumbnail preview (blob URL via `createObjectURL` for images, FileIcon for non-images), filename, size, and cancel button. Conditionally renders progress bar (uploading), green checkmark (ready), or error row with retry button (error). All state switching uses inline discriminated union narrowing to satisfy TypeScript.

---

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed TypeScript discriminated union narrowing**
- **Found during:** Task 2 code review
- **Issue:** Plan code used boolean intermediates (`isUploading`, `isReady`, `isError`) then referenced `uploadState.progress` and `uploadState.message` inside JSX. TypeScript cannot narrow `uploadState` based on a separate boolean variable — it requires inline `uploadState.status === 'X'` checks.
- **Fix:** Replaced boolean vars with inline `uploadState.status === 'uploading'` / `'ready'` / `'error'` checks in JSX conditional blocks. Removed now-unused boolean variables to prevent lint warnings.
- **Files modified:** `client/src/components/chat/UploadStrip.tsx`
- **Commit:** c05e6d3

---

## Known Stubs

None — all components are fully implemented with no hardcoded empty values or placeholder text that would flow to UI rendering. `UploadStrip` and `FileCard` are pure leaf components with no data sources to wire at this stage; they accept all data via props and will be wired in Plan 05-05.

---

## Self-Check: PASSED

Files verified present:
- client/src/components/common/FileIcon.tsx: FOUND
- client/src/components/common/FileIcon.module.css: FOUND
- client/src/components/chat/FileCard.tsx: FOUND
- client/src/components/chat/FileCard.module.css: FOUND
- client/src/components/chat/UploadStrip.tsx: FOUND
- client/src/components/chat/UploadStrip.module.css: FOUND
- client/src/types/chat.ts (UploadState, UploadedFile, file fields): FOUND
- client/src/lib/api.ts (uploadFile, withCredentials, progress): FOUND
- client/src/styles/tokens.css (--color-file-card-bg, --color-lightbox-backdrop): FOUND

Commits verified:
- 0db949d: feat(05-04): extend types, add uploadFile XHR helper, add CSS tokens — FOUND
- c05e6d3: feat(05-04): add FileIcon, FileCard, and UploadStrip components — FOUND
