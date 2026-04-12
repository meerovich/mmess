import { and, eq } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type { WebSocket } from 'ws';
import { messages, conversations, conversation_participants, files, users } from '../../../db/schema.js';

type DB = PostgresJsDatabase<Record<string, never>>;

async function getParticipantIds(db: DB, conversationId: string): Promise<string[]> {
  const rows = await db
    .select({ user_id: conversation_participants.user_id })
    .from(conversation_participants)
    .where(eq(conversation_participants.conversation_id, conversationId));
  return rows.map(r => r.user_id);
}

/**
 * Build the wire-format message that the frontend expects.
 *
 * Frontend `Message` type (client/src/types/chat.ts) requires nested objects
 * that are NOT present in the raw messages row:
 *   - sender: { id, username, avatar_url }   ← from users join
 *   - reactions: []                           ← always empty for a brand-new message
 *   - reply_to: { id, sender_id, content, sender?: { id, username } } | null
 *
 * Without these, MessageItem crashes with "Cannot read properties of undefined
 * (reading 'username')" on the very next render — which manifests as a white
 * screen after send because React unmounts the whole tree on unhandled errors.
 */
async function enrichMessage(
  db: DB,
  row: typeof messages.$inferSelect,
  fileRecord: typeof files.$inferSelect | null
): Promise<Record<string, unknown>> {
  // Sender — REQUIRED for MessageItem render
  const [sender] = await db
    .select({ id: users.id, username: users.username, avatar_url: users.avatar_url })
    .from(users)
    .where(eq(users.id, row.sender_id));

  // Reply-to — populate full object if the message is a reply
  let reply_to: Record<string, unknown> | null = null;
  if (row.reply_to_id) {
    const [parent] = await db
      .select({
        id: messages.id,
        sender_id: messages.sender_id,
        content: messages.content,
      })
      .from(messages)
      .where(eq(messages.id, row.reply_to_id));
    if (parent) {
      const [parentSender] = await db
        .select({ id: users.id, username: users.username })
        .from(users)
        .where(eq(users.id, parent.sender_id));
      reply_to = {
        id: parent.id,
        sender_id: parent.sender_id,
        content: parent.content,
        sender: parentSender ?? null,
      };
    }
  }

  const fileFields = fileRecord
    ? {
        file_name: fileRecord.original_name,
        file_mime: fileRecord.mimetype,
        file_size: fileRecord.size_bytes,
        is_image: fileRecord.mimetype.startsWith('image/'),
        thumbnail_url: fileRecord.thumbnail_path
          ? `/api/files/${row.file_id}/thumb`
          : null,
      }
    : {
        file_name: null,
        file_mime: null,
        file_size: null,
        is_image: null,
        thumbnail_url: null,
      };

  return {
    ...row,
    sender: sender ?? null,
    reactions: [],
    reply_to,
    ...fileFields,
  };
}

export async function handleMessageSend(
  db: DB,
  socket: WebSocket,
  userId: string,
  payload: {
    conversation_id: string;
    content?: string;       // optional caption when file_id present (D-19)
    reply_to_id?: string;
    file_id?: string;       // two-step upload flow
  },
  clientId: string
): Promise<void> {
  const { broadcastExcludeSocket } = await import('../registry.js');

  // Verify user is a participant
  const [participant] = await db
    .select()
    .from(conversation_participants)
    .where(and(
      eq(conversation_participants.conversation_id, payload.conversation_id),
      eq(conversation_participants.user_id, userId)
    ));
  if (!participant) {
    socket.send(JSON.stringify({ type: 'error', payload: { message: 'Not a participant' }, id: clientId }));
    return;
  }

  // File validation (D-20)
  let fileRecord: typeof files.$inferSelect | null = null;
  if (payload.file_id) {
    const [f] = await db.select().from(files).where(eq(files.id, payload.file_id));
    if (!f) {
      socket.send(JSON.stringify({ type: 'error', payload: { message: 'File not found' }, id: clientId }));
      return;
    }
    if (f.uploader_id !== userId) {
      socket.send(JSON.stringify({ type: 'error', payload: { message: 'Not your file' }, id: clientId }));
      return;
    }
    if (f.conversation_id !== null) {
      socket.send(JSON.stringify({ type: 'error', payload: { message: 'File already used in another message' }, id: clientId }));
      return;
    }
    fileRecord = f;
  }

  // Content OR file required
  if (!payload.content?.trim() && !payload.file_id) {
    socket.send(JSON.stringify({ type: 'error', payload: { message: 'Message must have content or a file' }, id: clientId }));
    return;
  }

  // DB-first: insert message + update conversation.last_message_id in one transaction (D-04)
  const [newMessage] = await db.transaction(async (tx) => {
    const [msg] = await tx
      .insert(messages)
      .values({
        conversation_id: payload.conversation_id,
        sender_id: userId,                            // always from JWT (D-07)
        content: payload.content?.trim() || null,     // null if no caption
        reply_to_id: payload.reply_to_id ?? null,
        file_id: payload.file_id ?? null,             // attach file to message
      })
      .returning();

    await tx
      .update(conversations)
      .set({ last_message_id: msg.id, updated_at: new Date() })
      .where(eq(conversations.id, payload.conversation_id));

    // Set files.conversation_id to lock file to this conversation (D-20 anti-reuse)
    if (payload.file_id) {
      await tx
        .update(files)
        .set({ conversation_id: payload.conversation_id })
        .where(eq(files.id, payload.file_id));
    }

    return [msg];
  });

  // Build enriched payload with sender/reactions/reply_to + file metadata
  // (white-screen fix — client MessageItem requires these nested objects)
  const enrichedMessage = await enrichMessage(db, newMessage, fileRecord);

  // Ack sender (D-03) — wrapped in { message: ... } to match client handleIncoming
  socket.send(JSON.stringify({ type: 'ack', payload: { message: enrichedMessage }, id: clientId }));

  // Fan out to other participants (D-04). Exclude only the source socket so
  // that OTHER sessions of the sender (second device, other browser) also
  // receive message:new and stay in sync — see multi-session bug report.
  const participantIds = await getParticipantIds(db, payload.conversation_id);
  broadcastExcludeSocket(
    participantIds,
    { type: 'message:new', payload: { message: enrichedMessage } },
    socket
  );

  // D-10: Delivery detection — if at least one recipient socket is OPEN,
  // notify sender that the message was delivered (server-side only, no client ack needed).
  const { isOnline } = await import('../registry.js');
  const recipientIds = participantIds.filter(id => id !== userId);
  const anyDelivered = recipientIds.some(id => isOnline(id));
  if (anyDelivered) {
    socket.send(JSON.stringify({
      type: 'message:delivered',
      payload: {
        conversation_id: payload.conversation_id,
        message_id: newMessage.id,
      },
    }));
  }

  // Web Push fallback: for any recipient who is NOT online (WS disconnected —
  // screen locked, tab closed, etc.), send a push notification so they see it
  // on their lock screen. This is the guaranteed-delivery mechanism.
  const { sendPushToUser, isPushConfigured } = await import('../../../lib/push.js');
  if (isPushConfigured()) {
    const sender = enrichedMessage.sender as { username?: string } | null;
    const senderName = sender?.username ?? 'Someone';
    const content = enrichedMessage.content as string | null;
    // Strip markdown syntax so push notifications show clean plain text
    const body = content
      ? content.replace(/[*_~`#>\[\]()!]/g, '').replace(/\n+/g, ' ').trim().slice(0, 120)
      : 'Sent a file';

    for (const recipientId of recipientIds) {
      if (!isOnline(recipientId)) {
        sendPushToUser(db, recipientId, {
          title: senderName,
          body,
          tag: payload.conversation_id,
          url: `/chat/${payload.conversation_id}`,
        }).catch(() => { /* push failures are non-fatal */ });
      }
    }
  }
}

export async function handleMessageEdit(
  db: DB,
  socket: WebSocket,
  userId: string,
  payload: { message_id: string; content: string },
  clientId: string
): Promise<void> {
  const { broadcastExcludeSocket } = await import('../registry.js');

  const [msg] = await db
    .select()
    .from(messages)
    .where(eq(messages.id, payload.message_id));

  if (!msg || msg.is_deleted) {
    socket.send(JSON.stringify({ type: 'error', payload: { message: 'Message not found' }, id: clientId }));
    return;
  }

  if (msg.sender_id !== userId) {
    socket.send(JSON.stringify({ type: 'error', payload: { message: 'Cannot edit others messages' }, id: clientId }));
    return;
  }

  // Permission check per D-21: direct chats — nobody can edit
  const [convo] = await db
    .select({ type: conversations.type })
    .from(conversations)
    .where(eq(conversations.id, msg.conversation_id));

  if (convo.type === 'direct') {
    socket.send(JSON.stringify({ type: 'error', payload: { message: 'Edit not allowed in direct chats' }, id: clientId }));
    return;
  }

  // Group: check can_edit_messages or is_admin
  const [cp] = await db
    .select({ is_admin: conversation_participants.is_admin, can_edit_messages: conversation_participants.can_edit_messages })
    .from(conversation_participants)
    .where(and(
      eq(conversation_participants.conversation_id, msg.conversation_id),
      eq(conversation_participants.user_id, userId)
    ));

  if (!cp || (!cp.is_admin && !cp.can_edit_messages)) {
    socket.send(JSON.stringify({ type: 'error', payload: { message: 'Edit permission denied' }, id: clientId }));
    return;
  }

  const [updated] = await db
    .update(messages)
    .set({ content: payload.content, edited_at: new Date() })
    .where(eq(messages.id, payload.message_id))
    .returning();

  // Load file record if present, then enrich with sender/reactions/reply_to
  let fileRecordForEdit: typeof files.$inferSelect | null = null;
  if (updated.file_id) {
    const [f] = await db.select().from(files).where(eq(files.id, updated.file_id));
    fileRecordForEdit = f ?? null;
  }
  const enrichedUpdated = await enrichMessage(db, updated, fileRecordForEdit);

  socket.send(JSON.stringify({ type: 'ack', payload: { message: enrichedUpdated }, id: clientId }));
  const participantIds = await getParticipantIds(db, msg.conversation_id);
  broadcastExcludeSocket(
    participantIds,
    { type: 'message:edited', payload: { message: enrichedUpdated } },
    socket
  );
}

export async function handleMessageDelete(
  db: DB,
  socket: WebSocket,
  userId: string,
  payload: { message_id: string },
  clientId: string
): Promise<void> {
  const { broadcastExcludeSocket } = await import('../registry.js');

  const [msg] = await db
    .select()
    .from(messages)
    .where(eq(messages.id, payload.message_id));

  if (!msg || msg.is_deleted) {
    socket.send(JSON.stringify({ type: 'error', payload: { message: 'Message not found' }, id: clientId }));
    return;
  }

  if (msg.sender_id !== userId) {
    socket.send(JSON.stringify({ type: 'error', payload: { message: 'Cannot delete others messages' }, id: clientId }));
    return;
  }

  const [convo] = await db
    .select({ type: conversations.type })
    .from(conversations)
    .where(eq(conversations.id, msg.conversation_id));

  if (convo.type === 'direct') {
    socket.send(JSON.stringify({ type: 'error', payload: { message: 'Delete not allowed in direct chats' }, id: clientId }));
    return;
  }

  const [cp] = await db
    .select({ is_admin: conversation_participants.is_admin, can_edit_messages: conversation_participants.can_edit_messages })
    .from(conversation_participants)
    .where(and(
      eq(conversation_participants.conversation_id, msg.conversation_id),
      eq(conversation_participants.user_id, userId)
    ));

  if (!cp || (!cp.is_admin && !cp.can_edit_messages)) {
    socket.send(JSON.stringify({ type: 'error', payload: { message: 'Delete permission denied' }, id: clientId }));
    return;
  }

  // Soft delete — keep row, set is_deleted = true (D-25)
  const [deleted] = await db
    .update(messages)
    .set({ is_deleted: true })
    .where(eq(messages.id, payload.message_id))
    .returning();

  socket.send(JSON.stringify({ type: 'ack', payload: { message_id: deleted.id }, id: clientId }));
  const participantIds = await getParticipantIds(db, msg.conversation_id);
  broadcastExcludeSocket(
    participantIds,
    { type: 'message:deleted', payload: { message_id: deleted.id, conversation_id: msg.conversation_id } },
    socket
  );
}
