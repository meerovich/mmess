---
status: partial
phase: 05-file-sharing
source: [05-VERIFICATION.md]
started: 2026-04-11
updated: 2026-04-11
---

## Current Test

[awaiting runtime verification + 2 known server-side gaps pending fix]

## Tests

### 1. Upload file (sender view)
expected: User A picks a file via paperclip or drag-drop. UploadStrip shows progress bar. On success, strip shows file name + cancel. Click send — message appears in User A's chat with FileCard (non-image) or inline thumbnail (image).
result: [pending — sender path should work per executor tests]

### 2. Recipient sees file attachment
expected: User B, in the same conversation, sees User A's file message render with FileCard or inline image thumbnail — same as sender's view.
result: **KNOWN GAP** — server WS broadcast omits file metadata (only file_id sent). MessageItem gates on file_name/is_image which are missing. Recipients currently see empty message.

### 3. File persists across page reload
expected: User A reloads the page. File message still shows FileCard/inline image via GET /api/conversations/:id/messages.
result: **KNOWN GAP** — history endpoint does not LEFT JOIN files table. File metadata absent in response.

### 4. Download preserves original filename
expected: Recipient clicks FileCard. Browser downloads with original filename via Content-Disposition header.
result: [pending — endpoint sets Content-Disposition correctly per executor tests]

### 5. Image lightbox
expected: Click inline image in bubble → Lightbox opens full-viewport. Escape/overlay/close button dismisses. 150ms fade.
result: [pending]

### 6. Drag-and-drop visual feedback
expected: Drag a file over the chat area. Dashed accent border appears on MessageInput/MessageList zone. Drop initiates upload.
result: [pending]

### 7. 25 MB size limit
expected: Uploading a >25 MB file fails. Error shown in UploadStrip ("Upload failed: file too large"). Caddy enforces at proxy layer; Fastify enforces at multipart layer; client rejects pre-upload.
result: [pending]

### 8. Executable blocklist
expected: Uploading `.exe`/`.bat`/`.sh`/etc. fails with MIME validation error (magic bytes check).
result: [pending]

### 9. Group avatar upload (closes Phase 4 D-08)
expected: Admin opens GroupSettingsModal, clicks avatar, picks image. UploadStrip shows progress. On success, avatar updates locally and via WS conversation:updated for all participants.
result: [pending — executor confirmed end-to-end flow implemented]

### 10. Upload rate limit (5/min/user)
expected: 6th upload in one minute returns 429 Too Many Requests.
result: [pending]

## Summary

total: 10
passed: 0
issues: 2
pending: 8
skipped: 0
blocked: 0

## Gaps

### Known server-side gaps (user approved phase with these tracked)

**GAP-1: WS broadcast/ack missing file metadata**
- File: `server/src/routes/ws/handlers/message.ts` (handleMessageSend)
- Symptom: Recipients see empty messages when sender sends a file
- Root cause: Server sends raw `messages.insert().returning()` row which contains only `file_id` (UUID). Fields `file_name`, `file_mime`, `file_size`, `is_image`, `thumbnail_url` live in the `files` table and are never joined.
- Fix: After transaction, if `file_id` is set, query `files` table and attach metadata to both ack payload and broadcast payload
- User accepted this as a known issue; intended to be fixed in a future gap-closure pass

**GAP-2: History endpoint missing file metadata**
- File: `server/src/routes/conversations/messages.ts` (GET /conversations/:id/messages)
- Symptom: File attachments disappear on page reload for everyone (including sender)
- Root cause: Query joins only `messages + users`. `file_id` not selected. No LEFT JOIN on files.
- Fix: Add LEFT JOIN on `files` on `messages.file_id = files.id`; select and map file metadata columns in the response shape
- User accepted this as a known issue; intended to be fixed in a future gap-closure pass

### Sender-only workaround

The sender's own experience works because `MessageInput` builds the optimistic message locally with full file metadata from the `/api/files` upload response. This metadata lives only in the client's local state and evaporates on reload. The UI appears functional to the sender in the moment of sending.
