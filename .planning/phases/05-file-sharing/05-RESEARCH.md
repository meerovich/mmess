# Phase 5: File Sharing - Research

**Researched:** 2026-04-11
**Domain:** File upload pipeline, image processing, authenticated file serving, upload UX
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Upload Pipeline**
- D-01: Max file size 25 MB — enforced at Fastify multipart config, Caddy proxy buffer, and client-side check before upload
- D-02: MIME validation via magic bytes, not Content-Type header. Use `file-type` npm package (latest v20+)
- D-03: Blocked MIME types: `.exe .bat .sh .cmd .ps1 .msi .app .jar .scr .com .vbs`. Check BOTH extension AND magic bytes
- D-04: Disk layout: `/data/uploads/YYYY/MM/<uuid>.<ext>` — date sharding
- D-05: Original filename stored in `files.original_name` (or `files.name`). UUID on disk
- D-06: `files.uploader_id` exists. Add `files.conversation_id UUID NULL REFERENCES conversations(id)` if missing
- D-07: `@fastify/multipart` (already installed at ^9.0.0). `limits.fileSize: 25 * 1024 * 1024`, `limits.files: 1`

**Image Thumbnails**
- D-08: `sharp` generates `_thumb.webp`. Dimensions 640×640 max, quality 85
- D-09: Thumbnail path: same dir as original, suffix `_thumb.webp`
- D-10: Thumbnail generation synchronous inside upload handler; failure is non-fatal
- D-11: `sharp` native module in Alpine — use prebuilt musl binaries (see findings below)
- D-12: New `files.thumbnail_path TEXT NULL`
- D-13: New `files.mime_type TEXT NOT NULL` — NOTE: schema already has `mimetype varchar(127)`, see Schema Gap Analysis below
- D-14: New `files.size BIGINT NOT NULL` — NOTE: schema already has `size_bytes integer`, see Schema Gap Analysis below

**REST Endpoints**
- D-15: `POST /api/files` — multipart, auth required, returns `{ id, name, mime_type, size, is_image, thumbnail_url, download_url }`
- D-16: `GET /api/files/:id` — auth + membership check (participant via message OR uploader OR group avatar reference)
- D-17: `GET /api/files/:id/thumb` — same auth, 404 if no thumbnail
- D-18: REVISION of Phase 1 D-16: files now stream through Fastify (not Caddy directly). Remove `/uploads/*` block from Caddyfile. Add `/api/files/*` routing to Caddyfile with `request_body { max_size 25MB }` on upload route

**Upload Flow**
- D-19: Two-step: POST /api/files → file_id → WS message:send
- D-20: On message:send, validate uploader_id === jwt.sub AND file not yet attached to another message
- D-21: After message:send, all conversation participants can download
- D-22: Orphaned files (uploaded, never sent) deferred to v2 cleanup

**Upload UX**
- D-23: Single file at a time
- D-24: XHR progress event for progress bar + cancel
- D-25: Upload strip above textarea with thumbnail/icon, progress bar, × remove
- D-26: Drag-and-drop with dashed blue border `2px dashed var(--color-accent)`
- D-27: Paperclip icon → native file picker
- D-28: Upload errors inline with retry button

**Image Preview and Download**
- D-29: Inline image max 320×320, object-fit contain
- D-30: Lightbox: full-viewport, dark backdrop, close via Escape/overlay/button
- D-31: Lightbox loads `/api/files/:id` (full size)
- D-32: Non-image: file card with icon, name, size, download button
- D-33: File icon by MIME prefix — inline SVGs, no external library

**Group Avatar**
- D-34–D-38: GroupSettingsModal gets avatar upload (admin only), same pipeline, PATCH /api/conversations/:id on success

**Pitfall Mitigations**
- D-39–D-42: Named volume already set (mmess_uploads), 25 MB + rate limit 5/min/user, date sharding, UUID + path.resolve check

### Claude's Discretion
- Exact sharp invocation parameters (resize strategy, fit)
- Whether to use `@fastify/static` for file streaming or manual `fs.createReadStream`
- Whether to include EXIF data stripping in image pipeline (recommended but optional)
- CSS for the lightbox
- File icon library choice (inline SVG set preferred)
- Whether to show optimistic upload stub or wait for completion

### Deferred Ideas (OUT OF SCOPE)
- Multiple files at once (queue + batch upload)
- Voice messages / audio recording
- Video thumbnails (ffmpeg)
- Background orphaned file cleanup
- Image zoom/pan in lightbox
- Signed URLs / temporary download links
- EXIF metadata viewer
- Image compression quality user setting
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| FILE-01 | User can upload and send files in a conversation | Two-step POST /api/files → WS message:send; @fastify/multipart streaming pipeline; file-type magic byte MIME check; date-sharded UUID filenames |
| FILE-02 | User can upload and send images with inline preview | sharp thumbnail generation (640×640 WebP quality 85); inline image rendering in MessageItem with click-to-lightbox; Lightbox component |
| FILE-03 | User can drag-and-drop files into the chat to upload | dragenter/dragleave/drop on window with dashed-border visual feedback; same handleFileSelect code path |
| FILE-04 | User can download received files | GET /api/files/:id with JWT + conversation membership check; Content-Disposition: attachment header; window.location.href download |
| CONV-05 (partial) | Group admin can change group avatar | GroupSettingsModal avatar click-to-upload; POST /api/files + PATCH /api/conversations/:id; Avatar component updated with avatarUrl prop |
</phase_requirements>

---

## Summary

Phase 5 adds file and image sharing to mmess. The architecture is a two-step HTTP upload flow: the client uploads a file to `POST /api/files` which returns a `file_id`, then the client includes `file_id` in the existing WS `message:send` payload. Downloads are gated behind JWT authentication and per-conversation membership checks, requiring files to stream through Fastify rather than be served directly by Caddy.

The key technical changes vs. the existing codebase are: (1) `@fastify/multipart` is already installed but not yet used — it needs to be registered and a `POST /api/files` route added; (2) `sharp` and `file-type` are new dependencies not yet in `package.json`; (3) the Caddyfile's existing `/uploads/*` direct-serve block must be removed and replaced with `/api/files/*` proxied through the API; (4) the `files` table needs two new columns (`thumbnail_path`, `conversation_id`) — two existing columns (`mimetype`, `size_bytes`) already cover D-13/D-14 requirements but with different names than the CONTEXT.md assumed.

On the frontend, upload state is local to `MessageInput` (not in ChatContext), progress tracking uses XHR (not `fetch`) for the `progress` event, and the lightbox is a plain React component with CSS transitions — no external library.

**Primary recommendation:** Install `sharp` and `file-type`, register `@fastify/multipart` globally or in the files route plugin, update the Caddyfile to route `/api/files/*` through the API backend and set `request_body { max_size 25MB }`, run a DB migration to add `thumbnail_path` and `conversation_id` columns, and implement XHR-based upload in a new `uploadFile` helper in `api.ts`.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@fastify/multipart` | ^9.0.0 (already installed) | Multipart form parsing | Official Fastify plugin; streaming mode avoids buffering full files in memory |
| `sharp` | 0.34.5 (current) | Image resize + WebP thumbnail generation | Industry standard Node.js image processing; prebuilt musl binaries for Alpine Docker |
| `file-type` | 22.0.1 (current) | Magic-byte MIME detection | ESM-only; pure JS; reads first bytes only; returns `{ ext, mime }` |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@fastify/static` | ^8.0.0 (already installed) | Static file serving | For potential local dev convenience; NOT used for production file downloads (manual stream preferred for access-control flexibility) |
| Node.js `fs/promises` + `path` | built-in | File I/O and path safety | `fs.mkdir({ recursive: true })` for date-sharded dirs; `path.resolve` for traversal prevention |
| Node.js `stream/promises` (pipeline) | built-in | Streaming file writes | `pipeline(readableStream, writeStream)` — cleaner error handling than manual piping |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Manual `fs.createReadStream` for downloads | `@fastify/static` with `root` set | Static plugin doesn't run per-request auth checks; manual stream is required for access control |
| XHR for upload progress | `fetch` with ReadableStream + `fetch` progress | `fetch` progress via body.getReader() is complex and not widely supported; XHR `progress` event is simpler and universal |
| Inline SVG file icons | External icon library (e.g., react-icons) | No new dep needed; MIME-to-icon mapping is small and stable |

### Installation
```bash
# In /server:
npm install sharp file-type

# @fastify/multipart already at ^9.0.0 — no install needed
# file-type is ESM-only; server is already "type": "module" — compatible
```

### Version verification
Verified 2026-04-11 via npm registry:
- `sharp`: 0.34.5 (published recently, stable)
- `file-type`: 22.0.1 (ESM-only, v20+ API used)
- `@fastify/multipart`: 10.0.0 is current on registry; project pins `^9.0.0` — both 9.x and 10.x work; no action required unless upgrading

---

## Schema Gap Analysis

**CRITICAL for planning — existing `files` table vs. CONTEXT.md requirements:**

| CONTEXT.md Column | Actual Column in schema.ts | Status | Action |
|-------------------|---------------------------|--------|--------|
| `files.name` (D-05) | `files.original_name` | EXISTS with different name | Use `original_name` in code; update CONTEXT.md references |
| `files.mime_type TEXT NOT NULL` (D-13) | `files.mimetype varchar(127)` | EXISTS with different name | Use `mimetype` in code; no migration needed for this column |
| `files.size BIGINT NOT NULL` (D-14) | `files.size_bytes integer` | EXISTS as integer not bigint | For 25 MB max, `integer` (2GB max) is sufficient; no migration needed |
| `files.thumbnail_path TEXT NULL` (D-12) | MISSING | ADD via migration | New column |
| `files.conversation_id UUID NULL` (D-06) | MISSING | ADD via migration | New column + FK |
| `messages.file_id` | EXISTS (`uuid file_id` but no FK constraint) | FK reference incomplete | The FK is commented "set after files table" — needs formal FK in migration |

**Migration needed:** Add `thumbnail_path`, `conversation_id`, and formalize `messages.file_id` FK.

---

## Architecture Patterns

### Recommended Project Structure
```
server/src/
├── routes/
│   └── files/
│       └── index.ts        # POST /files, GET /files/:id, GET /files/:id/thumb
├── lib/
│   └── upload/
│       ├── storage.ts      # date-sharded path generation, directory creation
│       ├── thumbnail.ts    # sharp invocation, error handling
│       └── validate.ts     # magic-byte check, blocklist check
└── db/
    └── schema.ts           # add thumbnail_path + conversation_id columns

client/src/
├── components/
│   ├── chat/
│   │   ├── Lightbox.tsx + .module.css
│   │   ├── FileCard.tsx + .module.css
│   │   └── UploadStrip.tsx + .module.css
│   └── common/
│       └── FileIcon.tsx + .module.css
└── lib/
    └── api.ts              # add uploadFile(file, onProgress, signal): Promise<UploadedFile>
```

### Pattern 1: @fastify/multipart Streaming Upload

Register the plugin globally (or in the files route plugin scope):

```typescript
// Source: https://github.com/fastify/fastify-multipart README
await fastify.register(import('@fastify/multipart'), {
  limits: {
    fileSize: 25 * 1024 * 1024, // 25 MB — D-01
    files: 1,                    // D-07: single file
    parts: 2,                    // 1 file + potential metadata field
  },
});

// In the upload route handler:
const data = await request.file();
if (!data) {
  throw fastify.httpErrors.badRequest('No file uploaded');
}

// Check truncation (file exceeded limit mid-stream)
await pipeline(data.file, writeStream);

if (data.file.truncated) {
  // File was too large — clean up partial write, return 413
  await fs.unlink(tempPath);
  throw fastify.httpErrors.payloadTooLarge('File exceeds 25 MB limit');
}
```

**Key insight:** `data.file.truncated` is the correct post-stream check for oversized files. The `RequestFileTooLargeError` is thrown only when `req.file()` is called with per-call limits; with plugin-level limits, check `truncated` after streaming.

### Pattern 2: Magic Byte MIME Validation with file-type

```typescript
// Source: https://github.com/sindresorhus/file-type README (v22.0.1, ESM)
import { fileTypeFromBuffer } from 'file-type';

// Read first 4100 bytes for detection (file-type reads minimal bytes)
const head = Buffer.alloc(4100);
const fd = await fs.open(filePath, 'r');
await fd.read(head, 0, 4100, 0);
await fd.close();

const detected = await fileTypeFromBuffer(head);
// detected = { ext: 'jpg', mime: 'image/jpeg' } | undefined
```

**Preferred approach for upload pipeline:** buffer the first bytes only (not the whole file). Stream the full file to disk first, then read the head. This avoids holding the full file in memory.

**Blocked MIME detection logic:**
```typescript
const BLOCKED_EXTENSIONS = new Set([
  'exe', 'bat', 'sh', 'cmd', 'ps1', 'msi', 'app', 'jar', 'scr', 'com', 'vbs'
]);

const BLOCKED_MIMES = new Set([
  'application/x-msdownload',      // exe
  'application/x-sh',              // sh
  'application/x-msdos-program',   // com, bat
  'application/java-archive',      // jar
  'application/vnd.microsoft.portable-executable', // exe/scr
]);

function isBlocked(detectedMime: string | undefined, originalExt: string): boolean {
  if (BLOCKED_EXTENSIONS.has(originalExt.toLowerCase())) return true;
  if (detectedMime && BLOCKED_MIMES.has(detectedMime)) return true;
  return false;
}
```

### Pattern 3: sharp Thumbnail Generation

```typescript
// Source: https://sharp.pixelplumbing.com/api-resize + api-output#webp
import sharp from 'sharp';

async function generateThumbnail(sourcePath: string, thumbPath: string): Promise<void> {
  await sharp(sourcePath)
    .resize(640, 640, {
      fit: 'inside',            // preserve aspect ratio, no enlarge
      withoutEnlargement: true, // don't upscale small images
    })
    .webp({ quality: 85 })     // D-08: quality 85
    // EXIF stripped by default — sharp removes all metadata unless withMetadata() called
    .toFile(thumbPath);
}
```

**EXIF stripping:** sharp strips all metadata by default when converting to WebP. No extra call needed. This is the desired behavior (D-10 discretion — strip EXIF).

**is_image detection:** Use the detected MIME type prefix: `detectedMime?.startsWith('image/')`.

### Pattern 4: Path Traversal Prevention

```typescript
// D-42: UUID filenames + path.resolve check
import { resolve } from 'path';

const UPLOAD_ROOT = process.env.UPLOAD_DIR ?? '/data/uploads';

function safeUploadPath(year: string, month: string, filename: string): string {
  const candidate = resolve(UPLOAD_ROOT, year, month, filename);
  if (!candidate.startsWith(resolve(UPLOAD_ROOT) + '/')) {
    throw new Error('Path traversal attempt');
  }
  return candidate;
}

// Generate safe UUID filename:
import { randomUUID } from 'crypto';
const uuid = randomUUID();
const ext = originalName.split('.').pop()?.toLowerCase() ?? 'bin';
const storage = `${uuid}.${ext}`;  // e.g. "f47ac10b-58cc-4372-a567-0e02b2c3d479.jpg"
```

### Pattern 5: Authenticated File Streaming

```typescript
// Manual fs.createReadStream — gives full control over headers and auth checks
import { createReadStream } from 'fs';
import { stat } from 'fs/promises';

// In GET /api/files/:id handler (after auth + membership check):
const stats = await stat(file.storage_path);
reply
  .header('Content-Type', file.mimetype)
  .header('Content-Length', stats.size)
  .header('Content-Disposition', `attachment; filename="${encodeURIComponent(file.original_name)}"`)
  .header('Cache-Control', 'private, max-age=3600')
  .send(createReadStream(file.storage_path));
```

### Pattern 6: XHR Upload with Progress + AbortController

```typescript
// Source: MDN XMLHttpRequest, standard pattern — no library needed
// In client/src/lib/api.ts:

export interface UploadedFile {
  id: string;
  name: string;
  mime_type: string;
  size: number;
  is_image: boolean;
  thumbnail_url: string | null;
  download_url: string;
}

export function uploadFile(
  file: File,
  onProgress: (pct: number) => void,
  signal: AbortSignal,
): Promise<UploadedFile> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const formData = new FormData();
    formData.append('file', file);

    xhr.open('POST', '/api/files');
    xhr.withCredentials = true; // send httpOnly cookies (same as apiFetch)

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    });

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(JSON.parse(xhr.responseText));
      } else {
        reject(new Error(xhr.responseText || 'Upload failed'));
      }
    });

    xhr.addEventListener('error', () => reject(new Error('Network error')));
    xhr.addEventListener('abort', () => reject(new DOMException('Upload cancelled', 'AbortError')));

    signal.addEventListener('abort', () => xhr.abort());

    xhr.send(formData);
  });
}
```

**Why XHR, not fetch:** `fetch` does not expose upload progress via a standard event. `fetch` progress tracking requires `ReadableStream` body streaming which is complex and not universally implemented. XHR's `xhr.upload.progress` event is the standard, simple solution.

### Pattern 7: WS message:send with file_id

Extension to `handleMessageSend` in `server/src/routes/ws/handlers/message.ts`:

```typescript
// payload type extension:
payload: {
  conversation_id: string;
  content?: string;       // optional caption (D-19)
  reply_to_id?: string;
  file_id?: string;       // new
}

// Validation when file_id present (D-20):
if (payload.file_id) {
  const [file] = await db.select().from(files).where(eq(files.id, payload.file_id));
  if (!file) throw new Error('File not found');
  if (file.uploader_id !== userId) throw new Error('Not your file');
  if (file.conversation_id !== null) throw new Error('File already used');
  // file.conversation_id will be set in the transaction below
}

// In the transaction: also update files.conversation_id = conversation_id when file_id present
```

### Anti-Patterns to Avoid

- **Buffering entire file in memory:** `await data.toBuffer()` on 25 MB files = 25 MB heap spike per request. Use `pipeline(data.file, writeStream)` instead.
- **Using Content-Type header for MIME validation:** User-controlled. Always use magic bytes post-write.
- **Using user-supplied filename for disk path:** Never. Always use UUID. Store original as metadata only.
- **Skipping `data.file.truncated` check:** If the file stream is piped to disk without checking truncated, a partial file gets saved with no error.
- **Serving files with Caddy static block without auth:** The Phase 1 D-16 Caddyfile `/uploads/*` block must be REMOVED. Leaving it active would bypass the JWT + membership check.
- **Storing absolute paths in DB:** Store relative path components (`YYYY/MM/<uuid>.ext`) and reconstruct with `UPLOAD_DIR` env var. Makes migration easier.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Multipart parsing | Custom body parser for `multipart/form-data` | `@fastify/multipart` | Boundary handling, quoted-printable encoding, CRLF variations — all handled |
| Image resizing | Manual pixel manipulation | `sharp` | libvips-backed; handles all source formats, color spaces, ICC profiles |
| Magic byte MIME detection | Custom byte-pattern matching | `file-type` | 500+ file types; maintained magic number database |
| Path safety | Custom sanitization regex | `path.resolve` + prefix check | Regex-based sanitization has well-documented bypass patterns |
| UUID generation | `nanoid` or custom | `crypto.randomUUID()` | Built-in Node.js, no dependency, cryptographically random |

**Key insight:** The multipart parsing, image processing, and MIME detection spaces each have well-maintained single-responsibility packages. Hand-rolling any of these introduces security vulnerabilities that are not obvious (e.g., missing magic number variants, path normalization edge cases on different OS).

---

## Caddyfile Changes Required

**CRITICAL:** The current Caddyfile has a `/uploads/*` block that serves files directly from the Docker volume. This implements the Phase 1 D-16 decision which is REVISED by Phase 5 D-18. This block must be removed and replaced.

**Current (to remove):**
```
handle /uploads/* {
    root * /data
    file_server
}
```

**Replacement (to add):**
```
# Upload route — explicit body size limit before proxying to API
handle /api/files* {
    request_body {
        max_size 25MB
    }
    uri strip_prefix /api
    reverse_proxy api:3000
}
```

**Note:** The existing `/api/*` block proxies all API routes but does NOT include a `request_body` size limit. The `/api/files*` block must be placed BEFORE the generic `/api/*` block in the Caddyfile (Caddy evaluates `handle` blocks in definition order). The generic `/api/*` block covers all other API routes without the body size restriction.

**Also required:** Remove `mmess_uploads:/data/uploads:ro` volume mount from the Caddy service in `docker-compose.yml` — Caddy no longer needs access to the uploads volume.

**Caddy default request body limit:** Caddy has no hardcoded default limit on request body size. Without explicit `request_body { max_size }`, it will buffer/proxy arbitrarily large uploads. The explicit `request_body { max_size 25MB }` adds defense-in-depth at the proxy layer (D-01 enforcement).

---

## Common Pitfalls

### Pitfall 1: sharp prebuilt binary mismatch on Alpine
**What goes wrong:** `npm install sharp` runs on the developer's glibc-based host machine (or Windows). The installed binary is for glibc, not musl. When the Docker image runs `npm ci` on `node:22-alpine` (musl), it downloads the correct prebuilt musl binary. However, if `node_modules` is bind-mounted from the host (as in `docker-compose.dev.yml`), the host's glibc binary is used inside Alpine, causing `linux-x64 binaries cannot be used on the linuxmusl-x64 platform`.
**Why it happens:** The dev compose mounts `. :/app` (the entire monorepo including `node_modules`), overriding whatever npm installed inside the container.
**How to avoid:** In `docker-compose.dev.yml`, the api service uses `node:22-alpine` with `npm ci` inside the container command. The bind-mount of `. :/app` means the host `node_modules` is used. Two solutions: (a) add a named volume for `node_modules` to shadow the bind-mount (cleanest), or (b) add `npm rebuild sharp --platform=linux --libc=musl` to the startup command. **The production Dockerfile is correct** — it runs `npm ci` inside Alpine at build time, so production is unaffected.
**Warning signs:** `Error: The package @img/sharp-linux-x64 is not compatible with this platform` or similar at container startup.

**Recommended dev compose fix:**
```yaml
# In docker-compose.dev.yml api service:
volumes:
  - .:/app
  - mmess_node_modules:/app/node_modules   # shadow host node_modules with named volume
```
Then run `docker-compose -f docker-compose.dev.yml run api npm ci --workspace=server` once to populate the named volume.

### Pitfall 2: file-type ESM-only in a `"type": "module"` package
**What goes wrong:** Incorrect import syntax for `file-type`.
**Why it happens:** `file-type` v20+ is ESM-only. The server is already `"type": "module"`, so this is compatible. But if any test or script file uses `require('file-type')`, it will throw.
**How to avoid:** Use named ESM imports: `import { fileTypeFromBuffer } from 'file-type'`. Never `require()`. The server's ESM configuration is correct — no action needed.

### Pitfall 3: Caddy serves uploads directly after Phase 5 is deployed
**What goes wrong:** The old `/uploads/*` Caddyfile block is left in place alongside the new `/api/files/*` API routing. Files are accessible at both `/uploads/<uuid>.jpg` (bypassing auth) AND `/api/files/<id>` (with auth).
**Why it happens:** The Caddyfile change is overlooked or treated as optional.
**How to avoid:** The `/uploads/*` block removal is a required part of this phase, not optional. Plan it as its own task with a verification step.

### Pitfall 4: @fastify/multipart registered globally conflicts with other routes
**What goes wrong:** Registering `@fastify/multipart` globally (on the root fastify instance) makes `request.file()` available on all routes. If any other route accidentally has a multipart content-type, it may error.
**Why it happens:** Fastify plugin scoping.
**How to avoid:** Register `@fastify/multipart` inside the files route plugin scope only:
```typescript
// server/src/routes/files/index.ts
export default async function filesRoutes(fastify: FastifyInstance) {
  await fastify.register(import('@fastify/multipart'), {
    limits: { fileSize: 25 * 1024 * 1024, files: 1 },
  });
  // ... register routes
}
```
This scopes the plugin to the files route subtree.

### Pitfall 5: Partial file write on oversized upload
**What goes wrong:** `pipeline()` completes (no throw), but `data.file.truncated` is `true`. A partial file is written to disk without error.
**Why it happens:** `@fastify/multipart` with plugin-level `limits.fileSize` truncates the stream rather than throwing. The `pipeline()` call succeeds because it just piped all bytes (up to the limit).
**How to avoid:** Always check `data.file.truncated` after the pipeline resolves, and delete the partial file + return 413 if true.

### Pitfall 6: conversation_id not set when file is attached to a message
**What goes wrong:** `files.conversation_id` remains `NULL` after `message:send`. The access control check in `GET /api/files/:id` finds no conversation link and denies access to all participants (except the uploader).
**Why it happens:** The `message:send` handler is updated to accept `file_id` in the payload but the transaction doesn't update `files.conversation_id`.
**How to avoid:** The `message:send` transaction must update `files.conversation_id = conversation_id` in the same transaction that inserts the message.

### Pitfall 7: message:send allows content to be empty when file_id is absent
**What goes wrong:** Current `handleMessageSend` doesn't validate content is non-empty. After Phase 5, `content` becomes optional (caption). If no validation exists, empty-content + no-file messages can be sent.
**How to avoid:** Add validation: if `!payload.file_id && (!payload.content || payload.content.trim() === '')` → reject with 400.

---

## Code Examples

### Date-sharded upload path generation
```typescript
// server/src/lib/upload/storage.ts
import { randomUUID } from 'crypto';
import { mkdir } from 'fs/promises';
import { resolve, join } from 'path';

const UPLOAD_ROOT = process.env.UPLOAD_DIR ?? '/data/uploads';

export function generateUploadPaths(originalName: string): {
  storageName: string;
  relativePath: string;
  absolutePath: string;
  thumbAbsolutePath: string;
} {
  const now = new Date();
  const year = now.getFullYear().toString();
  const month = (now.getMonth() + 1).toString().padStart(2, '0');
  const ext = (originalName.split('.').pop() ?? 'bin').toLowerCase();
  const uuid = randomUUID();
  const storageName = `${uuid}.${ext}`;
  const relativePath = join(year, month, storageName);
  const absolutePath = resolve(UPLOAD_ROOT, year, month, storageName);
  const thumbAbsolutePath = resolve(UPLOAD_ROOT, year, month, `${uuid}_thumb.webp`);

  // Safety check (D-42)
  const root = resolve(UPLOAD_ROOT);
  if (!absolutePath.startsWith(root + '/') && absolutePath !== root) {
    throw new Error('Path traversal detected');
  }

  return { storageName, relativePath, absolutePath, thumbAbsolutePath };
}

export async function ensureDir(absolutePath: string): Promise<void> {
  await mkdir(absolutePath, { recursive: true });
}
```

### Full upload handler skeleton
```typescript
// server/src/routes/files/index.ts (skeleton — not complete)
import { pipeline } from 'stream/promises';
import { createWriteStream } from 'fs';
import { unlink } from 'fs/promises';
import { fileTypeFromBuffer } from 'file-type';
import { generateUploadPaths, ensureDir } from '../../lib/upload/storage.js';
import { generateThumbnail } from '../../lib/upload/thumbnail.js';

fastify.post('/', {
  preHandler: [fastify.authenticate],
  config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
}, async (request, reply) => {
  const data = await request.file();
  if (!data) return reply.code(400).send({ error: 'No file' });

  const { storageName, relativePath, absolutePath, thumbAbsolutePath } =
    generateUploadPaths(data.filename);

  const dir = absolutePath.substring(0, absolutePath.lastIndexOf('/'));
  await ensureDir(dir);

  // Stream to disk
  const ws = createWriteStream(absolutePath);
  await pipeline(data.file, ws);

  // Check truncation (file too large)
  if (data.file.truncated) {
    await unlink(absolutePath).catch(() => {});
    return reply.code(413).send({ error: 'File exceeds 25 MB limit' });
  }

  // Magic byte validation
  const head = Buffer.alloc(4100);
  const fd = await fs.open(absolutePath, 'r');
  await fd.read(head, 0, 4100, 0);
  await fd.close();
  const detected = await fileTypeFromBuffer(head);

  if (isBlocked(detected?.mime, data.filename.split('.').pop() ?? '')) {
    await unlink(absolutePath).catch(() => {});
    return reply.code(400).send({ error: 'File type not allowed' });
  }

  // Thumbnail (best-effort)
  const isImage = detected?.mime?.startsWith('image/') ?? false;
  let thumbnailRelativePath: string | null = null;
  if (isImage) {
    try {
      await generateThumbnail(absolutePath, thumbAbsolutePath);
      thumbnailRelativePath = thumbAbsolutePath
        .replace(resolve(process.env.UPLOAD_DIR ?? '/data/uploads') + '/', '');
    } catch { /* D-10: thumbnail failure is non-fatal */ }
  }

  // Insert into DB
  const [file] = await db.insert(files).values({
    uploader_id: request.user.sub,
    original_name: data.filename,
    storage_name: relativePath,   // store relative path
    mimetype: detected?.mime ?? data.mimetype,
    size_bytes: ... // need actual size — stat the file post-write
    thumbnail_path: thumbnailRelativePath,
  }).returning();

  return reply.code(201).send({
    id: file.id,
    name: file.original_name,
    mime_type: file.mimetype,
    size: file.size_bytes,
    is_image: isImage,
    thumbnail_url: thumbnailRelativePath ? `/api/files/${file.id}/thumb` : null,
    download_url: `/api/files/${file.id}`,
  });
});
```

**Note on `size_bytes` after streaming:** After `pipeline()` completes, use `(await stat(absolutePath)).size` to get the actual byte count. Do not rely on `data.file` for size (the stream may be truncated).

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `multer` for multipart parsing | `@fastify/multipart` | Fastify v5 era | Type-safe, Fastify lifecycle integration |
| `gm` (GraphicsMagick) for image processing | `sharp` | ~2016-2020 | 10x faster via libvips; better memory usage |
| Content-Type header for MIME detection | `file-type` magic bytes | OWASP guidance 2020+ | Prevents MIME spoofing attacks |
| Express static for file serving | Per-request stream with auth | Required for access control | Files behind auth cannot use static serve |

**Deprecated/outdated:**
- `multer`: Designed for Express; does not integrate with Fastify's plugin lifecycle
- `mmmagic`/`magic-bytes.js`: Older magic byte alternatives; `file-type` is more actively maintained and ESM-native

---

## Open Questions

1. **`size_bytes` actual value after streaming**
   - What we know: `data.file` is a stream; size is not directly available pre-stream
   - What's unclear: Whether to stat post-write or track bytes during pipeline
   - Recommendation: Use `(await stat(absolutePath)).size` after pipeline completes — one extra syscall but reliable

2. **`messages.file_id` FK constraint**
   - What we know: Schema has `file_id uuid` as a plain column with a comment "set after files table" but no `references()` call
   - What's unclear: Whether the FK was intentionally omitted to avoid circular dependency
   - Recommendation: Add `.references(() => files.id, { onDelete: 'set null' })` in the migration. There is no circular dependency since `files` is defined before `messages` in schema.ts.

3. **Group avatar access control edge case**
   - What we know: D-37 says avatar access is via "conversations.avatar_url LIKE %file_id%"
   - What's unclear: The actual query — `LIKE` pattern matching a URL substring is fragile
   - Recommendation: More robust: check `conversations.avatar_url = '/api/files/' || file_id` (exact string match), or store only the file_id in `conversations.avatar_url` (not a full URL path)

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Server runtime | ✓ | 22.x (Docker) | — |
| `sharp` (npm) | Thumbnail generation | ✗ (not yet in package.json) | 0.34.5 (registry) | Skip thumbnails (but this is a locked decision) |
| `file-type` (npm) | MIME detection | ✗ (not yet in package.json) | 22.0.1 (registry) | No fallback — required |
| `@fastify/multipart` | Upload parsing | ✓ (^9.0.0 in package.json) | 9.x installed | — |
| `mmess_uploads` Docker volume | File persistence | ✓ (in docker-compose.yml) | — | — |
| musl prebuilt binaries for sharp | Alpine Docker compatibility | ✓ (automatic on `node:22-alpine`) | — | — |

**Missing dependencies with no fallback:**
- `sharp` — must be installed (`npm install sharp` in `/server`)
- `file-type` — must be installed (`npm install file-type` in `/server`)

**Missing dependencies with fallback:**
- None

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | None detected (no test config files found) |
| Config file | None — Wave 0 must create |
| Quick run command | `cd server && npx vitest run --reporter=verbose` (after Wave 0 setup) |
| Full suite command | `cd server && npx vitest run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| FILE-01 | POST /api/files creates file record and returns file_id | unit/integration | `npx vitest run tests/routes/files.test.ts` | ❌ Wave 0 |
| FILE-01 | Magic byte MIME check blocks .exe disguised as .jpg | unit | `npx vitest run tests/lib/validate.test.ts` | ❌ Wave 0 |
| FILE-01 | Path traversal rejected (../../../etc/passwd in filename) | unit | `npx vitest run tests/lib/storage.test.ts` | ❌ Wave 0 |
| FILE-01 | message:send with file_id sets conversation_id on files row | unit | `npx vitest run tests/ws/message.test.ts` | ❌ Wave 0 |
| FILE-02 | Thumbnail generated at correct dimensions (≤640×640) | unit | `npx vitest run tests/lib/thumbnail.test.ts` | ❌ Wave 0 |
| FILE-02 | Non-image upload: thumbnail_path is null | unit | `npx vitest run tests/routes/files.test.ts` | ❌ Wave 0 |
| FILE-04 | GET /api/files/:id returns 403 for non-participant | unit/integration | `npx vitest run tests/routes/files.test.ts` | ❌ Wave 0 |
| FILE-04 | GET /api/files/:id returns 200 + stream for participant | unit/integration | `npx vitest run tests/routes/files.test.ts` | ❌ Wave 0 |
| FILE-01 | 413 returned for files > 25 MB | unit | `npx vitest run tests/routes/files.test.ts` | ❌ Wave 0 |
| FILE-03 | Drag-over state management (dragenter/dragleave/drop) | manual-only | Manual browser test | ❌ Wave 0 |
| CONV-05 | Avatar upload + PATCH /api/conversations/:id updates avatar_url | integration | `npx vitest run tests/routes/files.test.ts` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `cd server && npx vitest run tests/lib/ --reporter=verbose` (unit tests only, ~5s)
- **Per wave merge:** `cd server && npx vitest run` (full suite)
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `server/tests/routes/files.test.ts` — covers FILE-01, FILE-02, FILE-04, FILE-01 size limit, CONV-05
- [ ] `server/tests/lib/validate.test.ts` — covers MIME blocklist, magic byte detection
- [ ] `server/tests/lib/storage.test.ts` — covers path generation, path traversal prevention
- [ ] `server/tests/lib/thumbnail.test.ts` — covers sharp resize output dimensions
- [ ] `server/tests/ws/message.test.ts` — extend existing message handler tests for file_id
- [ ] `server/vitest.config.ts` — vitest configuration
- [ ] Framework install: `cd server && npm install -D vitest` (no test framework detected)

---

## Project Constraints (from CLAUDE.md)

- **Stack is locked:** Node.js 22, Fastify 5, PostgreSQL 16, Drizzle ORM, React 19 + Vite — no alternatives
- **Docker deployment:** All file storage must use named Docker volumes (`mmess_uploads`)
- **TLS:** All connections via HTTPS/WSS through Caddy — no plaintext
- **GSD workflow:** All edits via GSD commands (no direct repo edits)
- **@fastify/multipart already installed at ^9.0.0** — do not add a duplicate install step
- **ESM module system:** `"type": "module"` in server `package.json` — all imports must be ESM syntax; `file-type` v22 ESM-only is compatible

---

## Sources

### Primary (HIGH confidence)
- sharp official docs (pixelplumbing.com/install, /api-resize, /api-output#webp) — Alpine prebuilt binaries, resize options, WebP quality, EXIF stripping behavior
- @fastify/multipart GitHub README — limits config, streaming vs buffering, truncation check
- file-type GitHub README — ESM API, `fileTypeFromBuffer`, v22 usage patterns
- Caddyfile docs (caddyserver.com/docs/caddyfile/directives/request_body) — `request_body { max_size }` directive

### Secondary (MEDIUM confidence)
- npm registry version check (2026-04-11): sharp 0.34.5, file-type 22.0.1, @fastify/multipart 10.0.0 current
- WebSearch: sharp Alpine musl binary issues — multiple GitHub issues confirm host/container binary mismatch; node:22-alpine confirmed to get correct musl prebuilt automatically when `npm ci` runs inside container

### Tertiary (LOW confidence)
- None

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — @fastify/multipart in package.json; sharp/file-type versions verified on registry
- Architecture: HIGH — patterns verified against official docs; schema gaps verified against actual schema.ts
- Pitfalls: HIGH — based on known behavior of @fastify/multipart truncation, Caddy static block, Alpine binary mismatch
- Caddyfile changes: HIGH — verified against current Caddyfile content; `request_body` directive confirmed in official Caddy docs

**Research date:** 2026-04-11
**Valid until:** 2026-07-11 (90 days — sharp/file-type are stable; @fastify/multipart API stable in v9)
