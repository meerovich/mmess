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

function chatReducer(state: ChatReducerState, action: ChatAction): ChatReducerState {
  switch (action.type) {
    case 'SET_CONVERSATIONS':
      return { ...state, conversations: action.conversations };

    case 'UPSERT_CONVERSATION': {
      const idx = state.conversations.findIndex(c => c.id === action.conversation.id);
      if (idx === -1) {
        return { ...state, conversations: [action.conversation, ...state.conversations] };
      }
      const updated = [...state.conversations];
      updated[idx] = action.conversation;
      return { ...state, conversations: updated };
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
        conversations: state.conversations.map((c: Conversation) =>
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
        ),
      };
    }

    case 'OPTIMISTIC_MESSAGE_CONFIRM':
      return {
        ...state,
        messages: {
          ...state.messages,
          [action.conversationId]: (state.messages[action.conversationId] ?? []).map(m =>
            m.id === action.tempId ? { ...action.serverMessage, status: 'sent' } : m
          ),
        },
      };

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
      return {
        ...state,
        messages: {
          ...state.messages,
          [action.conversationId]: convMsgs.map(m =>
            m.id === action.messageId ? { ...m, status: 'delivered' as const } : m
          ),
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

    case 'UPDATE_PARTICIPANT_READ': {
      // Find the latest message in this conversation to set as last_read_message_id
      const readMsgs = state.messages[action.conversationId];
      const latestMsgId = readMsgs?.[readMsgs.length - 1]?.id ?? null;
      return {
        ...state,
        conversations: state.conversations.map((c: Conversation) => {
          if (c.id !== action.conversationId) return c;
          return {
            ...c,
            participants: c.participants.map(p =>
              p.user_id === action.userId
                ? {
                    ...p,
                    last_read_at: action.lastReadAt,
                    last_read_message_id: latestMsgId ?? p.last_read_message_id,
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

    case 'CONVERSATION_UPDATED': {
      const idx = state.conversations.findIndex(c => c.id === action.conversation.id);
      if (idx === -1) {
        return { ...state, conversations: [action.conversation, ...state.conversations] };
      }
      const updated = [...state.conversations];
      updated[idx] = action.conversation;
      return { ...state, conversations: updated };
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
