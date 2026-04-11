# Phase 5: File Sharing — Validation Architecture (Nyquist Compliance)

**Phase:** 05-file-sharing
**Created:** 2026-04-11
**Purpose:** Defines how each plan's verify commands prove correctness. Satisfies the Nyquist rule: every `<verify>` block must have an `<automated>` command.

---

## Validation Strategy

Phase 5 is infrastructure-heavy (schema migrations, Docker config) and UI-heavy (drag-drop, lightbox, upload progress). Automated checks prove code existence and structural correctness. Human checkpoint in 05-06 proves end-to-end functional correctness.

---

## Plan-by-Plan Automated Checks

### 05-01: Schema + Infrastructure

| Check | Command | Passes When |
|-------|---------|-------------|
| Schema has new columns | `grep -n "thumbnail_path\|conversation_id" server/src/db/schema.ts` | Both column names appear |
| Packages installed | `grep '"sharp"\|"file-type"' server/package.json` | Both packages in dependencies |
| Caddyfile restructured | `grep -n "api/files\|max_size" Caddyfile` | Both strings present |
| /uploads/* removed | `grep "uploads/\*" Caddyfile` | Returns EMPTY (no match) |
| Caddy has no uploads volume | `grep -A20 "caddy:" docker-compose.yml \| grep "mmess_uploads"` | Returns EMPTY |
| Dev node_modules volume | `grep "node_modules" docker-compose.dev.yml` | Named volume appears |
| Migration generated | `ls server/drizzle/*.sql \| tail -1` | New .sql file with recent timestamp |

### 05-02: Upload Endpoint

| Check | Command | Passes When |
|-------|---------|-------------|
| Helper modules exist | `ls server/src/lib/upload/` | storage.ts, validate.ts, thumbnail.ts |
| Storage exports | `grep -n "getUploadPath\|ensureUploadDir\|absolutePath\|thumbnailRelativePath" server/src/lib/upload/storage.ts` | All 4 exported functions present |
| Validate exports | `grep -n "validateMime\|BLOCKED_EXTENSIONS\|BLOCKED_MIMES" server/src/lib/upload/validate.ts` | All 3 exports present |
| Thumbnail export | `grep "generateThumbnail" server/src/lib/upload/thumbnail.ts` | Function exported |
| Route file exists | `ls server/src/routes/files/index.ts` | File exists |
| Route registered in server | `grep -n "filesRoutes\|/files" server/src/index.ts` | Both present |
| TypeScript compiles | `cd server && npx tsc --noEmit 2>&1 \| head -20` | No errors (empty output or 0 exit) |

Key patterns checked in route file:
- `grep "truncated" server/src/routes/files/index.ts` — mandatory post-pipeline check
- `grep "rateLimit.*max.*5" server/src/routes/files/index.ts` — 5/min rate limit
- `grep "unlinkAsync\|unlink" server/src/routes/files/index.ts` — cleanup on error/truncation

### 05-03: Download Endpoints + WS Extension

| Check | Command | Passes When |
|-------|---------|-------------|
| GET routes added | `grep -n "GET.*/:id\|checkFileAccess\|Content-Disposition" server/src/routes/files/index.ts` | All 3 present |
| Exact match (not LIKE) | `grep "avatar_url.*avatarUrl\|eq.*avatar_url" server/src/routes/files/index.ts` | Drizzle eq() used, not like() |
| message.ts extended | `grep -n "file_id\|fileRecord\|conversation_id.*file" server/src/routes/ws/handlers/message.ts` | All present |
| Content optional | `grep "content.*optional\|content.*?\|content.*trim" server/src/routes/ws/handlers/message.ts` | content is optional |
| TypeScript compiles | `cd server && npx tsc --noEmit` | Exit 0 |

### 05-04: Client Types + Components

| Check | Command | Passes When |
|-------|---------|-------------|
| Message type extended | `grep -n "file_id\|UploadState\|UploadedFile" client/src/types/chat.ts` | All 3 present |
| uploadFile uses XHR | `grep -n "XMLHttpRequest\|withCredentials" client/src/lib/api.ts` | XHR pattern present |
| New CSS tokens | `grep "file-card-bg\|lightbox-backdrop" client/src/styles/tokens.css` | Both tokens present |
| FileIcon exists | `ls client/src/components/common/FileIcon.tsx` | File exists |
| FileCard exists | `ls client/src/components/chat/FileCard.tsx` | File exists |
| UploadStrip exists | `ls client/src/components/chat/UploadStrip.tsx` | File exists |
| FileCard downloads | `grep "window.location.href.*api/files" client/src/components/chat/FileCard.tsx` | Present |
| UploadStrip states | `grep "uploading\|ready\|error" client/src/components/chat/UploadStrip.tsx` | All 3 status values handled |

### 05-05: MessageInput + MessageItem + Lightbox

| Check | Command | Passes When |
|-------|---------|-------------|
| MessageInput upload state | `grep -n "uploadState\|handleFileSelect\|fileInputRef\|attachBtn\|isDragging" client/src/components/chat/MessageInput.tsx` | All 5 present |
| file_id in WS payload | `grep "file_id.*fileId\|fileId.*file_id" client/src/components/chat/MessageInput.tsx` | file_id included in sendWs payload |
| Drag-drop listeners | `grep "dragenter\|dragleave\|relatedTarget" client/src/components/chat/MessageInput.tsx` | Window event listeners present |
| MessageItem file rendering | `grep -n "lightboxOpen\|FileCard\|imageContainer\|file_id" client/src/components/chat/MessageItem.tsx` | All 4 present |
| Lightbox exists | `ls client/src/components/chat/Lightbox.tsx` | File exists |
| Lightbox uses full endpoint | `grep "api/files.*id" client/src/components/chat/Lightbox.tsx` | Full-size endpoint, not /thumb |
| Escape handler | `grep "Escape" client/src/components/chat/Lightbox.tsx` | Key handler present |

### 05-06: Avatar + GroupSettingsModal

| Check | Command | Passes When |
|-------|---------|-------------|
| Avatar avatarUrl prop | `grep -n "avatarUrl\|imgError\|onError" client/src/components/common/Avatar.tsx` | All 3 present |
| GroupSettingsModal upload | `grep -n "avatarUploadState\|handleAvatarFileSelect\|localAvatarUrl" client/src/components/chat/GroupSettingsModal.tsx` | All 3 present |
| Exact avatar_url format | `grep "'/api/files/'" client/src/components/chat/GroupSettingsModal.tsx` | String interpolation uses /api/files/ prefix |

---

## End-to-End Verification

The human checkpoint in Plan 05-06 covers full functional verification:

1. File upload via paperclip (FILE-01, FILE-03)
2. Image thumbnail inline + lightbox (FILE-02)
3. Drag-and-drop upload (FILE-03)
4. File download with original filename (FILE-04)
5. Group avatar upload (CONV-05 partial)

---

## Security Checks

| Property | How Verified |
|----------|-------------|
| No direct Caddy file serving | `grep "uploads/\*" Caddyfile` returns empty |
| Access control on downloads | `grep "checkFileAccess\|forbidden" server/src/routes/files/index.ts` present |
| No LIKE in avatar check | `grep "like\|LIKE" server/src/routes/files/index.ts` returns empty (or only in comments) |
| Truncation cleanup | `grep "truncated" server/src/routes/files/index.ts` present |
| Path traversal guard | `grep "startsWith.*UPLOAD_ROOT\|resolve.*UPLOAD" server/src/lib/upload/storage.ts` present |
| No executable upload | `grep "BLOCKED_EXTENSIONS\|BLOCKED_MIMES" server/src/lib/upload/validate.ts` both present |
| Rate limit on upload | `grep "rateLimit.*5" server/src/routes/files/index.ts` present |

---

*Validation architecture created: 2026-04-11*
*Phase: 05-file-sharing*
