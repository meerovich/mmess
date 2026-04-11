import { pipeline } from 'stream/promises';
import { createWriteStream } from 'fs';
import { unlink, stat } from 'fs/promises';
import type { FastifyInstance } from 'fastify';
import { db } from '../../db/index.js';
import { files } from '../../db/schema.js';
import {
  getUploadPath,
  ensureUploadDir,
  thumbnailRelativePath,
} from '../../lib/upload/storage.js';
import { validateMime } from '../../lib/upload/validate.js';
import { generateThumbnail } from '../../lib/upload/thumbnail.js';

export default async function filesRoutes(fastify: FastifyInstance) {
  // Register @fastify/multipart scoped to this plugin only (avoid global conflict)
  await fastify.register(import('@fastify/multipart'), {
    limits: {
      fileSize: 25 * 1024 * 1024, // 25 MB — D-01
      files: 1,                    // D-07: single file per request
      parts: 2,
    },
  });

  // POST /files — upload a file (D-15)
  fastify.post('/', {
    preHandler: [fastify.authenticate],
    config: { rateLimit: { max: 5, timeWindow: '1 minute' } }, // D-40
    schema: {
      response: {
        200: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            mime_type: { type: 'string' },
            size: { type: 'number' },
            is_image: { type: 'boolean' },
            thumbnail_url: { type: ['string', 'null'] },
            download_url: { type: 'string' },
          },
        },
        '4xx': {
          type: 'object',
          properties: {
            error: { type: 'string' },
          },
        },
        '5xx': {
          type: 'object',
          properties: {
            error: { type: 'string' },
          },
        },
      },
    },
  }, async (request, reply) => {
    const userId = request.user.sub;
    const data = await request.file();

    if (!data) {
      return reply.code(400).send({ error: 'No file uploaded' });
    }

    const originalName = data.filename || 'upload';
    const { year, month, fullPath, relativePath } = getUploadPath(originalName);

    await ensureUploadDir(year, month);

    // Stream to disk — never buffer full file in memory
    const writeStream = createWriteStream(fullPath);
    await pipeline(data.file, writeStream);

    // D-08: check truncation AFTER pipeline (file exceeded 25MB limit mid-stream)
    if (data.file.truncated) {
      await unlink(fullPath).catch(() => {});
      return reply.code(413).send({ error: 'File exceeds 25 MB limit' });
    }

    // Get file size from disk (accurate post-write)
    const stats = await stat(fullPath);
    const sizeBytes = stats.size;

    // Magic byte MIME validation (D-02, D-03)
    let detectedMime: string;
    let isImage: boolean;
    try {
      const result = await validateMime(fullPath, originalName);
      detectedMime = result.detectedMime;
      isImage = result.isImage;
    } catch (err: unknown) {
      await unlink(fullPath).catch(() => {});
      return reply.code(400).send({ error: 'File type not allowed' });
    }

    // Thumbnail generation for images (D-10 — best effort, non-fatal)
    let thumbRelPath: string | null = null;
    if (isImage) {
      const thumbAbsPath = await generateThumbnail(fullPath);
      if (thumbAbsPath) {
        thumbRelPath = thumbnailRelativePath(relativePath);
      }
    }

    // Insert into DB
    const [file] = await db.insert(files).values({
      uploader_id: userId,
      original_name: originalName,
      storage_name: relativePath,   // relative path stored (never absolute)
      mimetype: detectedMime,
      size_bytes: sizeBytes,
      thumbnail_path: thumbRelPath,
      // conversation_id: null (set later on message:send — D-19)
    }).returning();

    return reply.send({
      id: file.id,
      name: file.original_name,
      mime_type: file.mimetype,
      size: file.size_bytes,
      is_image: isImage,
      thumbnail_url: thumbRelPath ? `/api/files/${file.id}/thumb` : null,
      download_url: `/api/files/${file.id}`,
    });
  });
}
