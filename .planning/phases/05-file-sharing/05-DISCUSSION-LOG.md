# Phase 5: File Sharing - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.

**Date:** 2026-04-11
**Phase:** 05-file-sharing
**Areas discussed:** Upload pipeline, Image preview & UI, Upload UX, Security & access

---

## Upload Pipeline

| Question | Selected |
|----------|----------|
| Max file size | 25 MB |
| Format policy | All except exe/bat/sh/cmd/ps1/... (magic bytes check) |
| Filename strategy | UUID on disk, original name in DB |
| Storage layout | Date-sharded `/YYYY/MM/<uuid>` |

---

## Image Preview & UI

| Question | Selected |
|----------|----------|
| In-bubble display | Max 320×320 + click to lightbox |
| Server thumbnails | Yes, sharp → `_thumb.webp` |

---

## Upload UX

| Question | Selected |
|----------|----------|
| Progress indicator | XHR progress bar + cancel |
| Multiple files | One at a time (v1) |

---

## Security & Access

| Question | Selected |
|----------|----------|
| File auth | Fastify endpoint with JWT + membership check |
| Upload flow | Two-step: upload → file_id → WS send |
| Group avatars | Include in Phase 5 (closes Phase 4 D-08) |

### Important architectural revision

Phase 1 D-16 stated "Caddy serves uploads directly from the volume, not through Node.js." This is **revised** in Phase 5 D-18: files must be streamed through Fastify with JWT + per-conversation access control for privacy. Personal messenger requires strict membership-based file access; the perf cost is acceptable for tens of users.

---

## Deferred

- Multiple file upload → v2
- Voice/video messages → v2
- Video thumbnails → v2 (ffmpeg)
- Background orphan cleanup → v2
- Image zoom/pan in lightbox → v2
