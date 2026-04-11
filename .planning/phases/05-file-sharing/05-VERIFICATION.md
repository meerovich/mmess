---
phase: 05-file-sharing
verified: 2026-04-11T00:00:00Z
status: gaps_found
score: 2/4 must-haves verified
gaps:
  - truth: "Other participants see file attachments inline with correct metadata (name, type, size, thumbnail)"
    status: failed
    reason: "WS message:new broadcast and GET /conversations/:id/messages both send raw messages-table rows. The messages table only stores file_id (UUID). file_name, file_mime, file_size, is_image, and thumbnail_url all live in the files table and are never joined. Recipients of message:new receive only file_id — not enough to render FileCard (gated on message.file_name) or the inline image preview (gated on message.is_image). On page reload, history also returns no file metadata."
    artifacts:
      - path: "server/src/routes/ws/handlers/message.ts"
        issue: "handleMessageSend sends newMessage (raw messages insert row) in both ack and broadcast. No join to files table to attach file_name, file_mime, file_size, is_image, thumbnail_url."
      - path: "server/src/routes/conversations/messages.ts"
        issue: "History query selects from messages + users only. No join to files. file_id is not even selected; file_name/mime/size/is_image/thumbnail_url are absent from response."
    missing:
      - "In handleMessageSend: after insert, if file_id is present, query files table and attach file metadata to the broadcast/ack payload (original_name→file_name, mimetype→file_mime, size_bytes→file_size, is_image derived from mimetype, thumbnail_path→thumbnail_url as /api/files/:id/thumb URL)."
      - "In GET /conversations/:id/messages: add left join to files table on messages.file_id = files.id; include file_id, original_name, mimetype, size_bytes, thumbnail_path in the select; map them to file_name/file_mime/file_size/is_image/thumbnail_url fields in the response."

  - truth: "Images sent in a conversation display as inline previews on reload (not just optimistically in the sender's UI)"
    status: failed
    reason: "Same root cause as above. The inline thumbnail renders in MessageItem only when message.is_image is truthy. For the sender this works because MessageInput populates the optimistic message locally. But after a page reload, history returns no is_image/thumbnail_url for the message, so the inline preview is invisible."
    artifacts:
      - path: "server/src/routes/conversations/messages.ts"
        issue: "History response has no file metadata columns — is_image and thumbnail_url are undefined for all messages."
    missing:
      - "Same fix as gap 1: join files in history query."
human_verification:
  - test: "Download file with original filename"
    expected: "Browser prompts save dialog with original filename (not a UUID path). Content-Disposition header on GET /api/files/:id uses original_name."
    why_human: "The server sets Content-Disposition with encodeURIComponent(original_name) but FileCard triggers download via window.location.href assignment (no download attribute). Browser behaviour depends on response headers and browser implementation."
  - test: "Drag and drop onto chat input area"
    expected: "DragOver overlay appears, drop triggers file upload and UploadStrip shows progress."
    why_human: "Drag-drop listeners are wired at window level with visual isDragging flag — requires interactive browser test."
  - test: "Group admin avatar upload"
    expected: "Clicking the avatar circle opens file picker, upload shows progress strip, avatar updates in the modal and conversation list."
    why_human: "Full upload → PATCH /api/conversations/:id → WS conversation:updated → localAvatarUrl update flow requires running app."
---

# Phase 5: File Sharing Verification Report

**Phase Goal:** Users can share files and images in conversations with inline previews and reliable download
**Verified:** 2026-04-11
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|---------|
| 1 | User can select or drag-drop a file, see upload progress, and send it attached to a message | VERIFIED | MessageInput has paperclip button (file input), window drag-drop listeners (dragenter/drop), UploadStrip with progress bar, handleFileSelect → uploadFile XHR → setUploadState(ready) → handleSend sends file_id via WS |
| 2 | Images sent in a conversation display as inline previews without opening a new page | PARTIAL — sender only | MessageItem renders thumbnail inline when message.is_image is truthy; Lightbox opens full image on click. But recipients of message:new get no is_image/thumbnail_url (WS broadcast sends raw DB row). On reload, history endpoint omits these fields entirely. |
| 3 | Other participants see file attachments (FileCard for non-images, thumbnail for images) | FAILED | WS message:new payload is the raw messages INSERT row — only file_id present. FileCard is gated on message.file_name (line 175 MessageItem.tsx); thumbnail on message.is_image (line 153). Both will be absent for recipients. History also missing. |
| 4 | Downloaded files arrive with original filenames | VERIFIED (server-side) | GET /api/files/:id sets Content-Disposition: attachment; filename="<encoded original_name>". FileCard triggers via window.location.href. Human check needed for browser save-dialog behaviour. |

**Score:** 2/4 truths verified (1 partial, 1 failed — same root cause)

---

## Required Artifacts

| Artifact | Status | Details |
|----------|--------|---------|
| `server/src/db/schema.ts` | VERIFIED | files table: thumbnail_path, conversation_id FK present. messages.file_id FK to files.id present. |
| `server/src/routes/files/index.ts` | VERIFIED | POST /files (upload, MIME validation, thumbnail generation, DB insert), GET /:id (auth + download with Content-Disposition), GET /:id/thumb (auth + WebP thumbnail) |
| `server/src/lib/upload/storage.ts` | VERIFIED | UUID-based date-sharded path, path traversal prevention, thumbnailRelativePath helper |
| `server/src/lib/upload/validate.ts` | VERIFIED | Magic-byte MIME detection via file-type, extension blocklist, MIME blocklist |
| `server/src/lib/upload/thumbnail.ts` | VERIFIED | sharp 640×640 WebP, inside fit, non-fatal error handling |
| `server/src/routes/ws/handlers/message.ts` | STUB (partial) | file_id stored and file.conversation_id locked in transaction — correct. But ack/broadcast payload is raw DB row with no file metadata join. |
| `client/src/types/chat.ts` | VERIFIED | Message has file_id, file_name, file_mime, file_size, is_image, thumbnail_url. UploadedFile and UploadState types present. |
| `client/src/lib/api.ts` | VERIFIED | uploadFile XHR helper with progress, abort, error handling |
| `client/src/components/common/Avatar.tsx` | VERIFIED | avatarUrl prop renders img with initials fallback on error |
| `client/src/components/common/FileIcon.tsx` | VERIFIED | PDF, video, audio, archive, generic document SVG icons |
| `client/src/components/chat/FileCard.tsx` | VERIFIED | Click/keyboard download via window.location.href, FileIcon, filename + size display |
| `client/src/components/chat/UploadStrip.tsx` | VERIFIED | Progress bar, ready checkmark, error + retry, local image preview |
| `client/src/components/chat/Lightbox.tsx` | VERIFIED | Fade-in, Escape handler, full-size /api/files/:id, loading spinner |
| `client/src/components/chat/MessageInput.tsx` | VERIFIED | Paperclip button, drag-drop window listeners, UploadStrip integration, optimistic message with file fields, send with file_id |
| `client/src/components/chat/MessageItem.tsx` | VERIFIED (conditional) | Inline thumbnail with click-to-Lightbox, FileCard for non-images — but rendering depends on file metadata being in message (not present for received messages) |
| `client/src/components/chat/GroupSettingsModal.tsx` | VERIFIED | Avatar upload: file input, uploadFile → PATCH /api/conversations/:id, UploadStrip, localAvatarUrl optimistic update |
| `client/src/styles/tokens.css` | VERIFIED | --color-file-card-bg, --color-lightbox-backdrop tokens added |
| `Caddyfile` | VERIFIED | /api/files* block with request_body max_size 25MB, placed before /api/* |
| `docker-compose.yml` | VERIFIED | mmess_uploads named volume mounted at /data/uploads, UPLOAD_DIR env var |
| `docker-compose.dev.yml` | VERIFIED | mmess_uploads_dev volume, mmess_node_modules shadow (sharp musl/glibc fix) |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| MessageInput → /api/files | POST upload | uploadFile XHR | WIRED | /api/files in xhr.open, formData, withCredentials |
| /api/files → files table | DB insert | drizzle db.insert(files) | WIRED | returning() used, relative path stored |
| files route → filesRoutes plugin | server registration | index.ts app.register(filesRoutes, {prefix: '/files'}) | WIRED | confirmed in server/src/index.ts:37 |
| MessageInput → WS message:send | send file_id | sendWs with file_id in payload | WIRED | line 230-239 MessageInput.tsx |
| WS handler → files table | file validation + lock | db.select from files, tx.update files.conversation_id | WIRED | lines 45-92 message.ts |
| WS ack/broadcast → file metadata | join files in response | NOT WIRED | BROKEN | ack/broadcast sends raw insert row; no files join |
| History endpoint → file metadata | join files in query | NOT WIRED | BROKEN | messages.ts selects from messages+users only; no files join |
| MessageItem → FileCard | render on message.file_name | FileCard rendered | WIRED (conditionally dead) | Condition truthy only for sender's optimistic message |
| MessageItem → Lightbox | render on message.is_image | Lightbox rendered | WIRED (conditionally dead) | Same issue |
| GroupSettingsModal → /api/files | avatar upload | uploadFile + PATCH | WIRED | handleAvatarFileSelect lines 137-172 |
| GET /api/files/:id → file stream | download | createReadStream + Content-Disposition | WIRED | lines 200-210 files/index.ts |
| GET /api/files/:id/thumb → thumbnail | WebP stream | createReadStream thumbnail_path | WIRED | lines 234-244 files/index.ts |

---

## Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|--------------|--------|-------------------|--------|
| MessageItem (file thumbnail) | message.is_image, message.thumbnail_url | WS message:new payload / history API | No — fields absent from both sources for non-sender | HOLLOW — wired but data disconnected for recipients |
| MessageItem (FileCard) | message.file_name, message.file_mime | WS message:new payload / history API | No — fields absent from both sources | HOLLOW — wired but data disconnected for recipients |
| UploadStrip | uploadState (progress, ready) | uploadFile XHR onProgress, onLoad | Yes — real XHR progress events | FLOWING |
| Lightbox | /api/files/:id URL | files.storage_name → absolutePath | Yes — file served from disk | FLOWING |

---

## Behavioral Spot-Checks

Step 7b: SKIPPED — server requires running Docker stack with PostgreSQL.

---

## Requirements Coverage

| Requirement | Description | Status | Evidence |
|-------------|-------------|--------|---------|
| FILE-01 | User can upload and send files in a conversation | PARTIAL | Upload, send, and own-side rendering work. Recipients cannot see FileCard because file metadata is not included in WS broadcast or history. |
| FILE-02 | User can upload and send images with inline preview | PARTIAL | Sender sees inline thumbnail (optimistic). Recipients and sender on reload do not — is_image/thumbnail_url absent from server responses. |
| FILE-03 | User can drag-and-drop files into the chat to upload | VERIFIED (automated) | window drag-drop listeners present, handleDrop → handleFileSelect wired. Human confirmation recommended. |
| FILE-04 | User can download received files | PARTIAL | GET /api/files/:id with Content-Disposition uses original_name. FileCard triggers via window.location.href. Server side is correct; browser save-dialog behaviour needs human check. |

**Phase 4 D-08 deferral (group avatar upload):** CLOSED. GroupSettingsModal.tsx implements the full avatar upload flow: hidden file input, uploadFile XHR, UploadStrip, PATCH /api/conversations/:id with {avatar_url: /api/files/:id}, localAvatarUrl optimistic update. Avatar.tsx has avatarUrl prop wired. The deferral is resolved.

---

## Anti-Patterns Found

| File | Pattern | Severity | Impact |
|------|---------|----------|--------|
| server/src/routes/ws/handlers/message.ts:98,102 | ack/broadcast sends raw INSERT return value — file metadata fields not included | Blocker | FILE-01, FILE-02 broken for all recipients and on reload |
| server/src/routes/conversations/messages.ts:73-96 | History query has no join to files table | Blocker | All loaded messages with file attachments silently render without FileCard or thumbnail |

---

## Human Verification Required

### 1. Download saves with original filename

**Test:** In a running instance, send a file named `report_q1.pdf`. Other user receives message and clicks the FileCard download icon.
**Expected:** Browser save dialog shows `report_q1.pdf` as the suggested filename, not a UUID.
**Why human:** Content-Disposition header is set correctly on the server but FileCard uses `window.location.href` assignment which relies on browser honouring the header without a `download` attribute on an anchor element.

### 2. Drag-and-drop file onto chat

**Test:** In a running instance, drag a file from the OS file manager and drop it onto the chat area.
**Expected:** A drag-over visual overlay appears, dropping triggers upload with UploadStrip showing progress.
**Why human:** Window-level drag event listeners require browser interaction to confirm.

### 3. Group admin avatar upload full flow

**Test:** As a group admin, open group settings, click the avatar circle, select an image file.
**Expected:** UploadStrip shows upload progress, then checkmark; avatar updates in the modal; conversation list shows new avatar.
**Why human:** Requires running app with two participants to confirm WS conversation:updated triggers list refresh.

---

## Gaps Summary

Two gaps block full goal achievement, both from the same root cause: the server never joins the `files` table when sending file-bearing message payloads.

**Gap 1 — WS handler (message:new broadcast and ack):** `handleMessageSend` in `server/src/routes/ws/handlers/message.ts` stores `file_id` correctly but sends the raw INSERT return from `messages.insert().returning()`. Recipients receive only a UUID in `file_id`; `file_name`, `file_mime`, `file_size`, `is_image`, and `thumbnail_url` are all absent. `MessageItem` gates `FileCard` on `message.file_name` (line 175) and the inline image preview on `message.is_image` (line 153) — both conditions fail silently, no attachment rendered.

**Gap 2 — History endpoint:** `GET /conversations/:id/messages` in `server/src/routes/conversations/messages.ts` selects only from `messages` and `users`. `file_id` is not even in the select; none of the display metadata is returned. On page reload, all file attachments are invisible.

The sender's own experience works correctly because `MessageInput` builds the optimistic message locally with the full file metadata from the `UploadedFile` response — but this is never confirmed back from the server in a way that survives a reload.

**Fix scope:** Small and localised to two server files. No client changes required.

---

_Verified: 2026-04-11_
_Verifier: Claude (gsd-verifier)_
