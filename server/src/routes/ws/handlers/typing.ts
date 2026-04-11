import { eq } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { conversation_participants } from '../../../db/schema.js';

type DB = PostgresJsDatabase<Record<string, never>>;

// Map structure: conversationId → Map<userId, { username, timer }>
const typingMap = new Map<string, Map<string, { username: string; timer: ReturnType<typeof setTimeout> }>>();

async function getParticipantIds(db: DB, conversationId: string): Promise<string[]> {
  const rows = await db
    .select({ user_id: conversation_participants.user_id })
    .from(conversation_participants)
    .where(eq(conversation_participants.conversation_id, conversationId));
  return rows.map(r => r.user_id);
}

function broadcastTypingUpdate(conversationId: string, participantIds: string[], excludeUserId: string): void {
  // Lazy import to avoid circular dependency issues at module load time
  import('../registry.js').then(({ broadcast }) => {
    const convoMap = typingMap.get(conversationId);
    const typers: { userId: string; username: string }[] = [];
    if (convoMap) {
      for (const [uid, entry] of convoMap.entries()) {
        typers.push({ userId: uid, username: entry.username });
      }
    }
    broadcast(
      participantIds,
      { type: 'typing:user', payload: { conversation_id: conversationId, typers } },
      excludeUserId
    );
  }).catch(() => {
    // Registry import failure is non-fatal for typing indicator
  });
}

export async function handleTypingStart(
  userId: string,
  username: string,
  conversationId: string,
  db: DB,
  _clientId: string
): Promise<void> {
  const participantIds = await getParticipantIds(db, conversationId);

  if (!typingMap.has(conversationId)) typingMap.set(conversationId, new Map());
  const convoMap = typingMap.get(conversationId)!;

  // Clear existing auto-expiry timer
  const existing = convoMap.get(userId);
  if (existing) clearTimeout(existing.timer);

  // Auto-expiry: 5s without typing:stop clears the entry
  const timer = setTimeout(() => {
    convoMap.delete(userId);
    broadcastTypingUpdate(conversationId, participantIds, userId);
  }, 5000);

  convoMap.set(userId, { username, timer });
  broadcastTypingUpdate(conversationId, participantIds, userId);
}

export async function handleTypingStop(
  userId: string,
  conversationId: string,
  db: DB
): Promise<void> {
  const participantIds = await getParticipantIds(db, conversationId);

  const convoMap = typingMap.get(conversationId);
  if (!convoMap) return;
  const existing = convoMap.get(userId);
  if (existing) clearTimeout(existing.timer);
  convoMap.delete(userId);
  broadcastTypingUpdate(conversationId, participantIds, userId);
}

// On socket close: cleanup all typing entries for this user across all conversations
export function cleanupTypingForUser(userId: string): void {
  for (const [convId, convoMap] of typingMap.entries()) {
    const entry = convoMap.get(userId);
    if (entry) {
      clearTimeout(entry.timer);
      convoMap.delete(userId);
    }
    if (convoMap.size === 0) typingMap.delete(convId);
  }
}
