export interface MessageReaction {
  emoji: string;
  user_id: string;
  username: string;
}

export interface MessageSender {
  id: string;
  username: string;
  avatar_url: string | null;
}

export interface ReplyTo {
  id: string;
  sender_id: string;
  content: string | null;
  sender?: { id: string; username: string };
}

export type MessageStatus = 'sending' | 'sent' | 'failed';

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string | null;
  reply_to_id: string | null;
  reply_to: ReplyTo | null;
  is_deleted: boolean;
  edited_at: string | null;
  created_at: string;
  sender: MessageSender;
  reactions: MessageReaction[];
  status?: MessageStatus; // optimistic UI — undefined means confirmed
}

export interface Participant {
  user_id: string;
  username: string;
  avatar_url: string | null;
  is_admin: boolean;
  can_edit_messages: boolean;
  last_read_message_id?: string | null;
  last_read_at?: string | null; // ISO timestamp — message.created_at of the last-read message
}

export interface Conversation {
  id: string;
  type: 'direct' | 'group';
  name: string | null;
  last_message: { id: string; content: string | null; sender_id: string; created_at: string } | null;
  unread_count: number;
  participants: Participant[];
  updated_at: string;
}

export interface MessagePaginationState {
  hasMore: boolean;
  nextCursor: string | null;
}

export interface ChatState {
  conversations: Conversation[];
  activeConversationId: string | null;
  messages: Record<string, Message[]>; // keyed by conversationId
  typingUsers: Record<string, { userId: string; username: string }[]>;
  wsStatus: 'connected' | 'disconnected' | 'reconnecting';
}

export type ChatAction =
  | { type: 'SET_CONVERSATIONS'; conversations: Conversation[] }
  | { type: 'UPSERT_CONVERSATION'; conversation: Conversation }
  | { type: 'SET_ACTIVE_CONVERSATION'; conversationId: string | null }
  | { type: 'SET_MESSAGES'; conversationId: string; messages: Message[]; hasMore: boolean; nextCursor: string | null }
  | { type: 'PREPEND_MESSAGES'; conversationId: string; messages: Message[]; hasMore: boolean; nextCursor: string | null }
  | { type: 'OPTIMISTIC_MESSAGE_ADD'; conversationId: string; message: Message }
  | { type: 'OPTIMISTIC_MESSAGE_CONFIRM'; conversationId: string; tempId: string; serverMessage: Message }
  | { type: 'OPTIMISTIC_MESSAGE_FAIL'; conversationId: string; tempId: string }
  | { type: 'MESSAGE_EDITED'; message: Message }
  | { type: 'MESSAGE_DELETED'; messageId: string; conversationId: string }
  | { type: 'REACTION_ADDED'; messageId: string; conversationId: string; reaction: { user_id: string; username: string; emoji: string } }
  | { type: 'REACTION_REMOVED'; messageId: string; conversationId: string; userId: string; emoji: string }
  | { type: 'SET_TYPING_USERS'; conversationId: string; typers: { userId: string; username: string }[] }
  | { type: 'MARK_READ'; conversationId: string; messageId: string }
  | { type: 'WS_STATUS'; status: 'connected' | 'disconnected' | 'reconnecting' }
  | { type: 'SET_MESSAGE_HAS_MORE'; conversationId: string; hasMore: boolean; nextCursor: string | null };
