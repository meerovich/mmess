# Phase 5: File Sharing - Context

**Gathered:** 2026-04-11
**Status:** Ready for planning

<domain>
## Phase Boundary

File and image sharing in conversations: upload via HTTP POST (two-step flow: upload → file_id → send as WS message), server-side MIME validation via magic bytes, UUID filenames on disk with date sharding, sharp-generated WebP thumbnails for images, JWT-authenticated download endpoint with per-conversation access control, inline image previews with lightbox, drag-and-drop upload, progress bar with cancel, single-file upload at a time. Group avatar upload is included in this phase (closes deferred D-08 from Phase 4).

</domain>

<decisions>
## Implementation Decisions

### Upload Pipeline
- **D-01:** Max file size: **25 MB** (enforced at Fastify multipart config, Caddy proxy buffer, and client-side check before upload)
- **D-02:** MIME validation via **magic bytes**, not Content-Type header. Use `file-type` npm package (latest v20+) which reads the first bytes of the buffer
- **D-03:** Blocked MIME types / extensions: `.exe`, `.bat`, `.sh`, `.cmd`, `.ps1`, `.msi`, `.app`, `.jar`, `.scr`, `.com`, `.vbs`. Check BOTH extension (reject if in blocklist) AND magic bytes (reject if result is executable). Everything else allowed.
- **D-04:** Disk layout: `/data/uploads/YYYY/MM/<uuid>.<ext>` — date sharding prevents 10k+ files in a single directory (PITFALLS #12 prevention)
- **D-05:** Original filename stored in DB (`files.name` — column already exists in schema). UUID on disk prevents path traversal and collisions.
- **D-06:** Uploaded files have a `created_by` (user_id) and `conversation_id` (where it was sent) — the `files` table already has `uploader_id` column. Add `conversation_id` column if missing. Check schema and add if needed.
- **D-07:** `@fastify/multipart` is the multipart parser (not available yet — install). Configured with `limits.fileSize: 25 * 1024 * 1024`, `limits.files: 1`.

### Image Thumbnails
- **D-08:** `sharp` npm package generates a `_thumb.webp` version of every uploaded image. Thumbnail max dimensions: 640×640 (2x the display size for retina). Quality 85.
- **D-09:** Thumbnail path: same as original, suffix `_thumb.webp`. Example: `/data/uploads/2026/04/abc-123.jpg` → `/data/uploads/2026/04/abc-123_thumb.webp`
- **D-10:** Thumbnail generation is synchronous inside the upload request handler (acceptable for small user base, avoids background queue complexity). If thumbnail fails, file upload still succeeds — thumbnail is best-effort.
- **D-11:** `sharp` native module: Docker image needs `apk add --no-cache libc6-compat vips-dev` OR use the prebuilt binaries. Prefer prebuilt via `sharp --platform=linuxmusl --libc=musl` if building locally, or let npm install download the correct platform binary (standard Alpine support).
- **D-12:** New `files.thumbnail_path` column added to schema (nullable — null for non-images).
- **D-13:** New `files.mime_type` column added to schema (required) — stores validated MIME (e.g., `image/jpeg`).
- **D-14:** New `files.size` column added to schema (bigint, bytes).

### REST Endpoints
- **D-15:** `POST /api/files` — multipart upload. Auth required. Body: single file field named `file`. Returns: `{ id, name, mime_type, size, is_image, thumbnail_url, download_url }` where URLs are relative (`/api/files/<id>` and `/api/files/<id>/thumb`). Progress tracked via XHR on client side.
- **D-16:** `GET /api/files/:id` — authenticated download. Checks:
  1. User is authenticated (existing auth preHandler)
  2. User is a participant of the conversation referenced by the file's associated message (JOIN messages ON messages.file_id = files.id, then check conversation_participants) — OR the user is the original uploader (for in-progress uploads not yet attached to a message) — OR the file is a group avatar (conversations.avatar_url LIKE %file_id%)
  3. Streams the file with proper headers: `Content-Disposition: attachment; filename="<original_name>"` + `Content-Type: <mime>` + `Content-Length`
- **D-17:** `GET /api/files/:id/thumb` — same auth as above, returns the `_thumb.webp` file. Returns 404 if thumbnail doesn't exist (non-image files).
- **D-18:** **Revision of Phase 1 D-16:** Phase 1 decided "Caddy serves uploads directly from the volume, not through Node.js." **Revised 2026-04-11:** because personal messenger requires per-conversation access control, files must be streamed through Fastify with JWT + membership check. The performance cost is acceptable for tens of users; the privacy benefit is essential. Caddy still serves static frontend assets — only uploads are routed through the API.

### Upload Flow (Two-Step)
- **D-19:** Two-step upload flow:
  1. Client uploads file to `POST /api/files` — returns `{ id, ... }`
  2. Client sends WS `message:send` with `payload = { conversation_id, file_id, content: optional_caption }`
- **D-20:** Server validates on `message:send` that the uploader is the sender (`files.uploader_id === jwt.sub`) AND the file is not yet attached to another message (prevent re-use across conversations)
- **D-21:** After `message:send` succeeds, the file becomes visible to all participants of that conversation. Downloads from other users are gated by conversation membership (D-16 check 2).
- **D-22:** If the user cancels before sending (closes modal, unpicks file), the uploaded file is orphaned in storage but never visible. Deferred: background cleanup job for orphaned files (not v1).

### Upload UX
- **D-23:** Single file at a time in v1 (queued multiple deferred)
- **D-24:** Progress bar using XHR `progress` event — shows percentage + cancellation X button
- **D-25:** On upload success: thumbnail (for images) or file icon (for others) appears in the input area as a preview strip above the text input, with an × to remove before sending
- **D-26:** Drag-and-drop onto MessageList or MessageInput area triggers the upload flow. Visual feedback: dashed blue border overlay on the drop zone while a file is being dragged over the window
- **D-27:** Click paperclip icon in MessageInput opens native `<input type="file">` file picker (same code path as drag-and-drop)
- **D-28:** Upload errors shown inline in the input area as red text with retry button: "Upload failed: file too large" / "Upload failed: network error" etc.

### Image Preview & Download UX
- **D-29:** Image messages render the thumbnail at max 320×320 `object-fit: contain` inside the message bubble. Actual pixel dimensions preserved via `width`/`height` hints to prevent layout shift
- **D-30:** Click on an image message opens a **lightbox**: full-viewport modal with the full-size image, dark backdrop, close via Escape / overlay click / close button. No zoom/pan in v1.
- **D-31:** Lightbox uses the full-size `GET /api/files/:id` endpoint, not the thumbnail
- **D-32:** Non-image files render as a "file card" in the message bubble: file icon, original filename, size in KB/MB, download button. Click file card or download button triggers `window.location = /api/files/:id` with `Content-Disposition: attachment`
- **D-33:** File icon chosen by MIME prefix: `application/pdf` → PDF icon, `video/*` → video icon, etc. Use a small icon set (Claude's discretion: inline SVGs or a lightweight icon library if already in project)

### Group Avatar Upload (closes Phase 4 D-08 deferral)
- **D-34:** GroupSettingsModal (built in Phase 4) gains a "Change avatar" button in the About section, visible only to admin
- **D-35:** Click triggers same upload pipeline (`POST /api/files`) with an additional parameter or flag indicating this is an avatar (or just use a separate endpoint `POST /api/conversations/:id/avatar` that calls into the same upload code)
- **D-36:** On success: `PATCH /api/conversations/:id` with `{ avatar_url: "/api/files/<file_id>" }` — endpoint already exists from Phase 4 D-09
- **D-37:** Avatar file is stored as a regular file; the conversation references it via the URL field. Access is authorized via the existing file endpoint (D-16) which also checks if the file is referenced as a group avatar.
- **D-38:** Avatar component on client side renders either the initial-hash fallback (no avatar_url) OR an `<img src={avatar_url} />` — update `client/src/components/common/Avatar.tsx` to handle both cases

### Pitfall Mitigations
- **D-39:** PITFALLS #4 (files in container without volume): already handled in Phase 1 via named volume `mmess_uploads`
- **D-40:** PITFALLS #11 (file upload DoS): enforced by 25 MB size limit + Fastify rate-limit on `POST /api/files` (5 uploads per minute per user)
- **D-41:** PITFALLS #12 (many files in one directory): handled by date sharding `YYYY/MM/`
- **D-42:** Path traversal prevention: UUID filenames + `path.resolve` check that the final path stays within `/data/uploads`

### Claude's Discretion
- Exact sharp invocation parameters (resize strategy, fit)
- Whether to use `@fastify/static` for file streaming or manual `fs.createReadStream`
- Whether to include EXIF data stripping in image pipeline (recommended but optional)
- CSS for the lightbox (reuse modal pattern from Phase 4 GroupSettingsModal or plain div with backdrop)
- File icon library choice (inline SVG set preferred — no new dependencies)
- Whether to show a "file being uploaded" stub in the message list while upload is in progress (optimistic UI) or wait for completion before showing the message

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Research
- `.planning/research/PITFALLS.md` — #4, #11, #12, path traversal
- `.planning/research/ARCHITECTURE.md` — "Files via HTTP, not WS binary frames" — reinforce

### Project
- `.planning/PROJECT.md` — Validated requirements
- `.planning/REQUIREMENTS.md` — FILE-01..04 + CONV-05 avatar portion

### Prior Phases
- `.planning/phases/01-foundation/01-CONTEXT.md` — D-15 (named volume), D-16 (**revised by D-18 in this phase**)
- `.planning/phases/03-messaging-core/03-CONTEXT.md` — D-04 (DB-first delivery — file message follows same pattern)
- `.planning/phases/04-groups-presence/04-CONTEXT.md` — D-08 (avatar upload deferred to here)
- `.planning/phases/03-messaging-core/03-UI-SPEC.md` — Design tokens

### Existing Code
- `server/src/db/schema.ts` — `files` table (exists; may need column extensions)
- `server/src/routes/ws/handlers/message.ts` — where file_id is accepted in message:send
- `server/src/plugins/rate-limit.ts` — reuse for upload rate limiting
- `server/src/plugins/auth.ts` — JWT auth decorator for new endpoints
- `client/src/components/chat/MessageInput.tsx` — paperclip icon + drag/drop area
- `client/src/components/chat/MessageItem.tsx` — file/image rendering inside bubble
- `client/src/components/chat/GroupSettingsModal.tsx` — admin avatar upload UI
- `client/src/components/common/Avatar.tsx` — avatar_url support
- `client/src/lib/api.ts` — add `uploadFile(file, onProgress, signal)` helper using XHR

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `files` table exists with `id`, `uploader_id`, `name`, `path`, `mime_type?`, `size?`, timestamps — check if all columns exist, add missing ones via migration
- `messages.file_id` foreign key already exists
- `@fastify/rate-limit` already installed and wired (Phase 2) — new per-route config for uploads
- Modal pattern from GroupSettingsModal / NewGroupModal — reuse for lightbox
- `conversations.avatar_url` column exists (Phase 1 schema)

### Schema Extensions Needed
1. `files.mime_type TEXT NOT NULL` (if missing — may need default for existing rows; if none exist, just add NOT NULL)
2. `files.size BIGINT NOT NULL` (bytes)
3. `files.thumbnail_path TEXT NULL` (null for non-images)
4. `files.conversation_id UUID NULL REFERENCES conversations(id)` — denormalized for access check efficiency; null until attached to a message

### Established Patterns
- Fastify route plugins under `server/src/routes/*`
- Drizzle migrations auto-run on startup
- REST endpoint shape: `{ data }` or plain object response
- Error handling via thrown HTTP errors (400/403/404)
- CSS Modules + design tokens; any new colors go through `tokens.css`
- React components use typed useChat() hook

### Integration Points
- `POST /api/files` mounts under `/api/files/*` via new `server/src/routes/files/index.ts`
- `GET /api/files/:id` + `/api/files/:id/thumb` same plugin
- Upload rate limit config in `server/src/plugins/rate-limit.ts` or inline per-route
- Message:send handler in `ws/handlers/message.ts` must accept `file_id` and validate ownership
- Frontend: new `uploadFile` helper in `api.ts`, extend `MessageInput` for drag-drop + progress, extend `MessageItem` for file/image rendering, add `Lightbox` component, update `GroupSettingsModal` admin avatar flow, update `Avatar` component

</code_context>

<specifics>
## Specific Ideas

- Use `file-type` npm package for magic-byte MIME detection
- Use `sharp` for WebP thumbnail generation (requires native build — confirm Alpine Docker compatibility)
- Lightbox = full-screen modal with `backdrop-filter: blur(8px)` (if supported) or plain dark backdrop
- Drag-drop visual: dashed blue border (`2px dashed var(--color-accent)`) around MessageInput + MessageList zone
- File card uses existing Avatar-style layout with a file icon instead of initial
- Progress bar color: `--color-accent` at 100% opacity for fill, `--color-accent-muted` for track
- EXIF stripping via sharp's default behavior (`sharp(buf).toFormat('webp')` strips metadata)

</specifics>

<deferred>
## Deferred Ideas

- Multiple files at once (queue + batch upload) — v2
- Voice messages / audio recording — v2 (requires different UI + MediaRecorder API)
- Video thumbnails (ffmpeg) — v2 (significant dependency)
- Background orphaned file cleanup — v2 (cron or periodic sweep)
- Image zoom/pan in lightbox — v2 (use a library like `react-medium-image-zoom`)
- Signed URLs / temporary download links — not needed with JWT + membership check
- EXIF metadata viewer — out of scope
- Image compression quality user setting — not needed for v1

</deferred>

---

*Phase: 05-file-sharing*
*Context gathered: 2026-04-11*
