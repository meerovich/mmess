import React, { createContext, useContext, useEffect, useReducer, useRef } from 'react';
import { apiFetch } from '../lib/api';
import type {
  ChatState,
  ChatAction,
  Conversation,
  Message,
  MessagePaginationState,
  PresenceState,
} from '../types/chat';

const initialState: ChatState = {
  conversations: [],
  activeConversationId: null,
  messages: {},
  typingUsers: {},
  wsStatus: 'disconnected',
  presenceByUser: {},
};

interface ChatReducerState extends ChatState {
  messagePagination: Record<string, MessagePaginationState>;
}

const initialReducerState: ChatReducerState = {
  ...initialState,
  messagePagination: {},
};

function getConversationSortTimestamp(conversation: Conversation): number {
  const stamp = conversation.last_message?.created_at ?? conversation.updated_at;
  return new Date(stamp).getTime();
}

function sortConversations(conversations: Conversation[]): Conversation[] {
  return [...conversations].sort((a, b) => {
    const diff = getConversationSortTimestamp(b) - getConversationSortTimestamp(a);
    if (diff !== 0) return diff;
    return a.id.localeCompare(b.id);
  });
}

function participantName(conversation: Conversation | undefined, userId: string): string | undefined {
  return conversation?.participants.find(p => p.user_id === userId)?.username;
}

function chatReducer(state: ChatReducerState, action: ChatAction): ChatReducerState {
  switch (action.type) {
    case 'SET_CONVERSATIONS':
      return { ...state, conversations: sortConversations(action.conversations) };

    case 'UPSERT_CONVERSATION': {
      const idx = state.conversations.findIndex(c => c.id === action.conversation.id);
      if (idx === -1) {
        return { ...state, conversations: sortConversations([action.conversation, ...state.conversations]) };
      }
      const updated = [...state.conversations];
      updated[idx] = {
        ...action.conversation,
        unread_count: updated[idx].unread_count,
        last_message: action.conversation.last_message ?? updated[idx].last_message,
      };
      return { ...state, conversations: sortConversations(updated) };
    }

    case 'SET_ACTIVE_CONVERSATION':
      return { ...state, activeConversationId: action.conversationId };

    case 'SET_MESSAGES':
      return {
        ...state,
        messages: { ...state.messages, [action.conversationId]: action.messages },
        messagePagination: {
          ...state.messagePagination,
          [action.conversationId]: { hasMore: action.hasMore, nextCursor: action.nextCursor },
        },
      };

    case 'PREPEND_MESSAGES': {
      const existing = state.messages[action.conversationId] ?? [];
      return {
        ...state,
        messages: { ...state.messages, [action.conversationId]: [...action.messages, ...existing] },
        messagePagination: {
          ...state.messagePagination,
          [action.conversationId]: { hasMore: action.hasMore, nextCursor: action.nextCursor },
        },
      };
    }

    case 'OPTIMISTIC_MESSAGE_ADD': {
      const addedMsg = { ...action.message, status: action.message.status ?? 'sending' as const };
      return {
        ...state,
        messages: {
          ...state.messages,
          [action.conversationId]: [
            ...(state.messages[action.conversationId] ?? []),
            addedMsg,
          ],
        },
        // Update conversation's last_message so the sidebar shows the new message
        conversations: sortConversations(
          state.conversations.map((c: Conversation) =>
            c.id === action.conversationId
              ? {
                  ...c,
                  last_message: {
                    id: addedMsg.id,
                    content: addedMsg.content,
                    sender_id: addedMsg.sender_id,
                    created_at: addedMsg.created_at,
                  },
                  updated_at: addedMsg.created_at,
                }
              : c
          )
        ),
      };
    }

    case 'OPTIMISTIC_MESSAGE_CONFIRM': {
      const updatedMessages = (state.messages[action.conversationId] ?? []).map(m =>
        m.id === action.tempId ? { ...action.serverMessage, status: 'sent' as const } : m
      );
      const confirmed = updatedMessages.find(m => m.id === action.serverMessage.id) ?? action.serverMessage;
      return {
        ...state,
        messages: {
          ...state.messages,
          [action.conversationId]: updatedMessages,
        },
        conversations: sortConversations(
          state.conversations.map(c =>
            c.id === action.conversationId
              ? {
                  ...c,
                  last_message: {
                    id: confirmed.id,
                    content: confirmed.content,
                    sender_id: confirmed.sender_id,
                    created_at: confirmed.created_at,
                  },
                  updated_at: confirmed.created_at,
                }
              : c
          )
        ),
      };
    }

    case 'OPTIMISTIC_MESSAGE_FAIL':
      return {
        ...state,
        messages: {
          ...state.messages,
          [action.conversationId]: (state.messages[action.conversationId] ?? []).map(m =>
            m.id === action.tempId ? { ...m, status: 'failed' } : m
          ),
        },
      };

    case 'MESSAGE_DELIVERED': {
      const convMsgs = state.messages[action.conversationId] ?? [];
      const conversation = state.conversations.find(c => c.id === action.conversationId);
      return {
        ...state,
        messages: {
          ...state.messages,
          [action.conversationId]: convMsgs.map(m =>
            m.id === action.messageId
              ? {
                  ...m,
                  status: 'delivered' as const,
                  delivered_at: action.deliveredAt ?? m.delivered_at ?? null,
                  deliveries: [
                    ...(m.deliveries ?? []),
                    ...(action.deliveries ?? [])
                      .filter(delivery => !(m.deliveries ?? []).some(existing => existing.user_id === delivery.user_id))
                      .map(delivery => ({
                        ...delivery,
                        username: delivery.username ?? participantName(conversation, delivery.user_id),
                      })),
                  ],
                }
              : m
          ),
        },
      };
    }

    case 'MESSAGES_DELIVERED': {
      const convMsgs = state.messages[action.conversationId] ?? [];
      const conversation = state.conversations.find(c => c.id === action.conversationId);
      const deliveredBy = participantName(conversation, action.userId);
      const deliveredByMessage = new Map(action.deliveries.map(delivery => [delivery.message_id, delivery.delivered_at]));
      return {
        ...state,
        messages: {
          ...state.messages,
          [action.conversationId]: convMsgs.map(message => {
            const deliveredAt = deliveredByMessage.get(message.id);
            if (!deliveredAt || (message.deliveries ?? []).some(delivery => delivery.user_id === action.userId)) {
              return message;
            }
            return {
              ...message,
              deliveries: [
                ...(message.deliveries ?? []),
                {
                  user_id: action.userId,
                  username: deliveredBy,
                  delivered_at: deliveredAt,
                },
              ],
            };
          }),
        },
      };
    }

    case 'MESSAGE_EDITED': {
      const convId = action.message.conversation_id;
      return {
        ...state,
        messages: {
          ...state.messages,
          [convId]: (state.messages[convId] ?? []).map(m =>
            m.id === action.message.id ? { ...m, ...action.message } : m
          ),
        },
        conversations: state.conversations.map(c =>
          c.id === convId && c.last_message?.id === action.message.id
            ? {
                ...c,
                last_message: {
                  ...c.last_message,
                  content: action.message.content,
                },
              }
            : c
        ),
      };
    }

    case 'MESSAGE_DELETED':
      return {
        ...state,
        messages: {
          ...state.messages,
          [action.conversationId]: (state.messages[action.conversationId] ?? []).map(m =>
            m.id === action.messageId ? { ...m, is_deleted: true, content: null } : m
          ),
        },
      };

    case 'REACTION_ADDED': {
      const msgs = state.messages[action.conversationId] ?? [];
      const updatedMsgs = msgs.map((m: Message) => {
        if (m.id !== action.messageId) return m;
        const filtered = m.reactions.filter(r => r.user_id !== action.reaction.user_id);
        return { ...m, reactions: [...filtered, action.reaction] };
      });
      return {
        ...state,
        messages: { ...state.messages, [action.conversationId]: updatedMsgs },
      };
    }

    case 'REACTION_REMOVED': {
      const msgs = state.messages[action.conversationId] ?? [];
      const updatedMsgs = msgs.map((m: Message) => {
        if (m.id !== action.messageId) return m;
        return {
          ...m,
          reactions: m.reactions.filter(
            r => !(r.user_id === action.userId && r.emoji === action.emoji)
          ),
        };
      });
      return {
        ...state,
        messages: { ...state.messages, [action.conversationId]: updatedMsgs },
      };
    }

    case 'SET_TYPING_USERS':
      return {
        ...state,
        typingUsers: { ...state.typingUsers, [action.conversationId]: action.typers },
      };

    case 'MARK_READ':
      return {
        ...state,
        conversations: state.conversations.map((c: Conversation) =>
          c.id === action.conversationId ? { ...c, unread_count: 0 } : c
        ),
      };

    case 'INCREMENT_UNREAD':
      return {
        ...state,
        conversations: state.conversations.map((c: Conversation) =>
          c.id === action.conversationId
            ? { ...c, unread_count: c.unread_count + 1 }
            : c
        ),
      };

    case 'UPDATE_PARTICIPANT_READ': {
      const conversation = state.conversations.find(c => c.id === action.conversationId);
      const readBy = participantName(conversation, action.userId);
      return {
        ...state,
        messages: {
          ...state.messages,
          [action.conversationId]: (state.messages[action.conversationId] ?? []).map(message => {
            if (message.sender_id === action.userId || message.created_at > action.lastReadAt) return message;
            const hasRead = (message.reads ?? []).some(read => read.user_id === action.userId);
            const hasDelivery = (message.deliveries ?? []).some(delivery => delivery.user_id === action.userId);
            return {
              ...message,
              deliveries: hasDelivery
                ? message.deliveries
                : [
                    ...(message.deliveries ?? []),
                    {
                      user_id: action.userId,
                      username: readBy,
                      delivered_at: action.readAt ?? action.lastReadAt,
                    },
                  ],
              reads: hasRead
                ? message.reads
                : [
                    ...(message.reads ?? []),
                    {
                      user_id: action.userId,
                      username: readBy,
                      read_at: action.readAt ?? new Date().toISOString(),
                    },
                  ],
            };
          }),
        },
        conversations: state.conversations.map((c: Conversation) => {
          if (c.id !== action.conversationId) return c;
          return {
            ...c,
            participants: c.participants.map(p =>
              p.user_id === action.userId
                ? {
                    ...p,
                    last_read_at: action.lastReadAt,
                    last_read_message_id: action.messageId ?? p.last_read_message_id,
                  }
                : p
            ),
          };
        }),
      };
    }

    case 'WS_STATUS':
      return { ...state, wsStatus: action.status };

    case 'SET_MESSAGE_HAS_MORE':
      return {
        ...state,
        messagePagination: {
          ...state.messagePagination,
          [action.conversationId]: { hasMore: action.hasMore, nextCursor: action.nextCursor },
        },
      };

    case 'SET_PRESENCE':
      return {
        ...state,
        presenceByUser: {
          ...state.presenceByUser,
          [action.userId]: action.presence,
        },
      };

    case 'SET_PRESENCE_BULK': {
      const updates: Record<string, PresenceState> = {};
      for (const { userId, presence } of action.entries) {
        updates[userId] = presence;
      }
      return {
        ...state,
        presenceByUser: { ...state.presenceByUser, ...updates },
      };
    }

    case 'PROFILE_UPDATED': {
      const profile = action.user;
      const patchSender = (sender: Message['sender']) =>
        sender.id === profile.id
          ? { ...sender, username: profile.username, avatar_url: profile.avatar_url }
          : sender;

      const messages = Object.fromEntries(
        Object.entries(state.messages).map(([conversationId, conversationMessages]) => [
          conversationId,
          conversationMessages.map(message => ({
            ...message,
            sender: patchSender(message.sender),
            reply_to: message.reply_to?.sender?.id === profile.id
              ? {
                  ...message.reply_to,
                  sender: { ...message.reply_to.sender, username: profile.username },
                }
              : message.reply_to,
            forwarded_from: message.forwarded_from?.sender?.id === profile.id
              ? {
                  ...message.forwarded_from,
                  sender: { ...message.forwarded_from.sender, username: profile.username },
                }
              : message.forwarded_from,
          })),
        ])
      );

      return {
        ...state,
        conversations: state.conversations.map(conversation => ({
          ...conversation,
          participants: conversation.participants.map(participant =>
            participant.user_id === profile.id
              ? { ...participant, username: profile.username, avatar_url: profile.avatar_url }
              : participant
          ),
        })),
        messages,
      };
    }

    case 'CONVERSATION_UPDATED': {
      const idx = state.conversations.findIndex(c => c.id === action.conversation.id);
      if (idx === -1) {
        return { ...state, conversations: sortConversations([action.conversation, ...state.conversations]) };
      }
      const updated = [...state.conversations];
      updated[idx] = action.conversation;
      return { ...state, conversations: sortConversations(updated) };
    }

    case 'CONVERSATION_REMOVED': {
      const { [action.conversationId]: _removedMessages, ...messages } = state.messages;
      const { [action.conversationId]: _removedPagination, ...messagePagination } = state.messagePagination;
      return {
        ...state,
        activeConversationId: state.activeConversationId === action.conversationId ? null : state.activeConversationId,
        conversations: state.conversations.filter(c => c.id !== action.conversationId),
        messages,
        messagePagination,
      };
    }

    case 'INVITATION_ACCEPTED': {
      return {
        ...state,
        conversations: state.conversations.map(c => {
          if (c.id !== action.conversationId) return c;
          return {
            ...c,
            participants: c.participants.map(p =>
              p.user_id === action.userId ? { ...p, status: 'accepted' as const } : p
            ),
          };
        }),
      };
    }

    case 'INVITATION_DECLINED': {
      // Remove declined conversation from list
      return {
        ...state,
        conversations: state.conversations.filter(c => c.id !== action.conversationId),
      };
    }

    default:
      return state;
  }
}

interface ChatContextValue {
  state: ChatState;
  dispatch: React.Dispatch<ChatAction>;
  messagePagination: Record<string, MessagePaginationState>;
}

const ChatContext = createContext<ChatContextValue | null>(null);

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(chatReducer, initialReducerState);
  const prevWsStatus = useRef<string>('disconnected');

  // Initial fetch on mount
  useEffect(() => {
    apiFetch('/api/conversations')
      .then(res => res.ok ? res.json() : [])
      .then((conversations: Conversation[]) => {
        dispatch({ type: 'SET_CONVERSATIONS', conversations });
      })
      .catch(() => {
        // Silently fail — WS reconnect will sync state when available
      });
  }, []);

  // Re-fetch on WS reconnect to pick up missed conversations (D-26, PRES-03)
  useEffect(() => {
    if (prevWsStatus.current === 'reconnecting' && state.wsStatus === 'connected') {
      apiFetch('/api/conversations')
        .then(res => res.ok ? res.json() : [])
        .then((conversations: Conversation[]) => {
          dispatch({ type: 'SET_CONVERSATIONS', conversations });
        })
        .catch(() => {});
    }
    prevWsStatus.current = state.wsStatus;
  }, [state.wsStatus]);

  return (
    <ChatContext.Provider
      value={{
        state,
        dispatch,
        messagePagination: state.messagePagination,
      }}
    >
      {children}
    </ChatContext.Provider>
  );
}

export function useChat(): ChatContextValue {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error('useChat must be used within ChatProvider');
  return ctx;
}
