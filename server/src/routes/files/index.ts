import { pipeline } from 'stream/promises';
import { createWriteStream, createReadStream, existsSync } from 'fs';
import { unlink, stat } from 'fs/promises';
import type { FastifyInstance } from 'fastify';
import { and, eq } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { files, messages, conversations, conversation_participants, users } from '../../db/schema.js';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import {
  getUploadPath,
  ensureUploadDir,
  thumbnailRelativePath,
  absolutePath,
} from '../../lib/upload/storage.js';
import { validateMime } from '../../lib/upload/validate.js';
import { generateThumbnail } from '../../lib/upload/thumbnail.js';

type DB = PostgresJsDatabase<Record<string, never>>;

/**
 * Access check (D-16) — three allowed paths:
 * 1. User is the original uploader
 * 2. File is referenced as a group avatar (exact string match)
 * 3. File is referenced as a user profile avatar
 * 4. User is a conversation participant of any message with this file_id
 */
async function checkFileAccess(
  dbConn: DB,
  userId: string,
  file: typeof files.$inferSelect
): Promise<boolean> {
  // Check 1: user is the original uploader
  if (file.uploader_id === userId) return true;

  // Check 2: file is referenced as a group avatar (exact string match — NOT LIKE %)
  const avatarUrl = `/api/files/${file.id}`;
  const [avatarConv] = await dbConn
    .select({ id: conversations.id })
    .from(conversations)
    .innerJoin(
      conversation_participants,
      and(
        eq(conversation_participants.conversation_id, conversations.id),
        eq(conversation_participants.user_id, userId)
      )
    )
    .where(eq(conversations.avatar_url, avatarUrl))
    .limit(1);
  if (avatarConv) return true;

  // Check 3: user profile avatars are visible to authenticated users wherever
  // that profile is shown (chat headers, message avatars, user search).
  const [avatarUser] = await dbConn
    .select({ id: users.id })
    .from(users)
    .where(eq(users.avatar_url, avatarUrl))
    .limit(1);
  if (avatarUser) return true;

  // Check 4: user is a participant in any conversation with a message referencing this file
  const [participantRow] = await dbConn
    .select({ user_id: conversation_participants.user_id })
    .from(messages)
    .innerJoin(
      conversation_participants,
      and(
        eq(conversation_participants.conversation_id, messages.conversation_id),
        eq(conversation_participants.user_id, userId)
      )
    )
    .where(eq(messages.file_id, file.id))
    .limit(1);
  if (participantRow) return true;

  return false;
}

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

  // GET /files/:id — authenticated file download (D-16)
  fastify.get('/:id', {
    preHandler: [fastify.authenticate],
    schema: {
      params: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
      response: {
        '4xx': { type: 'object', properties: { error: { type: 'string' } } },
        '5xx': { type: 'object', properties: { error: { type: 'string' } } },
      },
    },
  }, async (request, reply) => {
    const userId = request.user.sub;
    const { id: fileId } = request.params as { id: string };

    const [file] = await db.select().from(files).where(eq(files.id, fileId));
    if (!file) return reply.code(404).send({ error: 'File not found' });

    const hasAccess = await checkFileAccess(db as unknown as DB, userId, file);
    if (!hasAccess) return reply.code(403).send({ error: 'Access denied' });

    const filePath = absolutePath(file.storage_name);
    if (!existsSync(filePath)) return reply.code(404).send({ error: 'File not found on disk' });

    const stats = await stat(filePath);

    return reply
      .header('Content-Type', file.mimetype)
      .header('Content-Length', stats.size)
      .header('Content-Disposition', `attachment; filename="${encodeURIComponent(file.original_name)}"`)
      .header('Cache-Control', 'private, max-age=3600')
      .send(createReadStream(filePath));
  });

  // GET /files/:id/thumb — authenticated thumbnail (D-17)
  fastify.get('/:id/thumb', {
    preHandler: [fastify.authenticate],
    schema: {
      params: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
      response: {
        '4xx': { type: 'object', properties: { error: { type: 'string' } } },
        '5xx': { type: 'object', properties: { error: { type: 'string' } } },
      },
    },
  }, async (request, reply) => {
    const userId = request.user.sub;
    const { id: fileId } = request.params as { id: string };

    const [file] = await db.select().from(files).where(eq(files.id, fileId));
    if (!file) return reply.code(404).send({ error: 'File not found' });
    if (!file.thumbnail_path) return reply.code(404).send({ error: 'No thumbnail for this file' });

    const hasAccess = await checkFileAccess(db as unknown as DB, userId, file);
    if (!hasAccess) return reply.code(403).send({ error: 'Access denied' });

    const thumbPath = absolutePath(file.thumbnail_path);
    if (!existsSync(thumbPath)) return reply.code(404).send({ error: 'Thumbnail not found on disk' });

    const stats = await stat(thumbPath);

    return reply
      .header('Content-Type', 'image/webp')
      .header('Content-Length', stats.size)
      .header('Cache-Control', 'private, max-age=3600')
      .send(createReadStream(thumbPath));
  });
}
