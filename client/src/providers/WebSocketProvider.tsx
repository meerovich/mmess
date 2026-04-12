import React, { createContext, useCallback, useContext, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ChatAction, Message } from '../types/chat';
import { useChat } from '../contexts/ChatContext';
import { useAuth } from '../contexts/AuthContext';
import { apiFetch } from '../lib/api';

// Module-level references set by WebSocketProvider for use in handleIncoming
let _currentUserId: string | null = null;
let _navigate: ((to: string) => void) | null = null;

// Server→Client message envelope
interface ServerMessage {
  type: string;
  id?: string;
  payload?: Record<string, unknown>;
}

function handleIncoming(msg: ServerMessage, dispatch: React.Dispatch<ChatAction>) {
  switch (msg.type) {
    case 'ack':
      // ack confirms an optimistic message sent by THIS client.
      // msg.id is the tempId that was echoed back; msg.payload.message is the server-assigned record.
      if (msg.id && msg.payload?.message) {
        dispatch({
          type: 'OPTIMISTIC_MESSAGE_CONFIRM',
          conversationId: (msg.payload.message as Message).conversation_id,
          tempId: msg.id,
          serverMessage: msg.payload.message as Message,
        });
      }
      break;
    case 'message:new':
      // message:new delivers a message from ANOTHER user (or from this user's other session).
      // Add it with status='sent' — no tempId to replace.
      if (msg.payload?.message) {
        const newMsg = msg.payload.message as Message;
        dispatch({
          type: 'OPTIMISTIC_MESSAGE_ADD',
          conversationId: newMsg.conversation_id,
          message: { ...newMsg, status: 'sent' },
        });

        // Browser notification: fire on every incoming message from another
        // user, regardless of tab visibility. Previously we gated on
        // `document.visibilityState !== 'visible'` (D-30), but users reported
        // missing notifications when the chat tab was in the background of a
        // multi-window session — the visibility API reports 'visible' there
        // even though the user is not actually looking. Simpler rule: if it
        // is from someone else, surface it.
        if (
          'Notification' in window &&
          Notification.permission === 'granted' &&
          newMsg.sender_id !== _currentUserId
        ) {
          const title = newMsg.sender?.username ?? 'New message';
          const body = newMsg.content
            ? newMsg.content.slice(0, 120)
            : 'Sent a file';

          const notif = new Notification(title, {
            body,
            icon: '/favicon.ico',
            tag: newMsg.conversation_id, // dedup per conversation (D-31)
          });

          notif.onclick = () => {
            window.focus();
            _navigate?.(`/chat/${newMsg.conversation_id}`);
          };
        }
      }
      break;
    case 'message:edited':
      if (msg.payload?.message) {
        dispatch({ type: 'MESSAGE_EDITED', message: msg.payload.message as Message });
      }
      break;
    case 'message:deleted':
      if (msg.payload?.message_id && msg.payload?.conversation_id) {
        dispatch({
          type: 'MESSAGE_DELETED',
          messageId: msg.payload.message_id as string,
          conversationId: msg.payload.conversation_id as string,
        });
      }
      break;
    case 'reaction:added':
      if (msg.payload?.message_id && msg.payload?.conversation_id) {
        dispatch({
          type: 'REACTION_ADDED',
          messageId: msg.payload.message_id as string,
          conversationId: msg.payload.conversation_id as string,
          reaction: {
            user_id: msg.payload.user_id as string,
            username: msg.payload.username as string,
            emoji: msg.payload.emoji as string,
          },
        });
      }
      break;
    case 'reaction:removed':
      if (msg.payload?.message_id && msg.payload?.conversation_id) {
        dispatch({
          type: 'REACTION_REMOVED',
          messageId: msg.payload.message_id as string,
          conversationId: msg.payload.conversation_id as string,
          userId: msg.payload.user_id as string,
          emoji: msg.payload.emoji as string,
        });
      }
      break;
    case 'typing:user':
      if (msg.payload?.conversation_id) {
        dispatch({
          type: 'SET_TYPING_USERS',
          conversationId: msg.payload.conversation_id as string,
          typers: (msg.payload.typers as { userId: string; username: string }[]) ?? [],
        });
      }
      break;
    case 'message:delivered':
      if (msg.payload?.conversation_id && msg.payload?.message_id) {
        dispatch({
          type: 'MESSAGE_DELIVERED',
          conversationId: msg.payload.conversation_id as string,
          messageId: msg.payload.message_id as string,
        });
      }
      break;
    case 'read:by':
      if (msg.payload?.conversation_id && msg.payload?.user_id) {
        // D-07: server sends message_id (singular), not message_ids (plural)
        dispatch({
          type: 'UPDATE_PARTICIPANT_READ',
          conversationId: msg.payload.conversation_id as string,
          userId: msg.payload.user_id as string,
          lastReadAt: msg.payload.read_at as string,
        });
        // Also zero unread count for this conversation (existing behavior)
        dispatch({
          type: 'MARK_READ',
          conversationId: msg.payload.conversation_id as string,
          messageId: (msg.payload.message_id as string) ?? '',
        });
      }
      break;
    case 'conversation:new':
      if (msg.payload) {
        dispatch({
          type: 'UPSERT_CONVERSATION',
          conversation: msg.payload as unknown as import('../types/chat').Conversation,
        });
      }
      break;
    case 'presence:update':
      if (msg.payload?.user_id) {
        dispatch({
          type: 'SET_PRESENCE',
          userId: msg.payload.user_id as string,
          presence: {
            online: msg.payload.online as boolean,
            last_seen_at: (msg.payload.last_seen_at as string | null) ?? null,
          },
        });
      }
      break;
    case 'conversation:updated':
      if (msg.payload?.conversation) {
        dispatch({
          type: 'CONVERSATION_UPDATED',
          conversation: msg.payload.conversation as import('../types/chat').Conversation,
        });
      }
      break;
    case 'error':
      console.error('[WS]', msg.payload);
      break;
  }
}

interface WebSocketContextValue {
  wsRef: React.MutableRefObject<WebSocket | null>;
}

const WebSocketContext = createContext<WebSocketContextValue | null>(null);

export function WebSocketProvider({ children }: { children: React.ReactNode }) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasConnectedOnceRef = useRef(false);
  const { dispatch, state } = useChat();
  const { user } = useAuth();
  const navigate = useNavigate();

  // Stable ref to current state so the reconnect handler can read fresh
  // conversations/messages without re-creating the connect callback.
  const stateRef = useRef(state);
  stateRef.current = state;

  // Keep module-level refs in sync for use in handleIncoming (defined outside component)
  useEffect(() => {
    _currentUserId = user?.id ?? null;
    _navigate = navigate;
  }, [user, navigate]);

  // Re-fetch conversations + active conversation messages. Called on reconnect
  // and on visibility-change wake to guarantee delivery of missed messages.
  const replayMissedMessages = useCallback(() => {
    apiFetch('/api/conversations')
      .then(res => res.ok ? res.json() : null)
      .then((data: { conversations: import('../types/chat').Conversation[] } | null) => {
        if (data?.conversations) {
          dispatch({ type: 'SET_CONVERSATIONS', conversations: data.conversations });
        }
      })
      .catch(() => {});

    const activeId = stateRef.current.activeConversationId;
    if (activeId) {
      apiFetch(`/api/conversations/${activeId}/messages?limit=50`)
        .then(res => res.ok ? res.json() : null)
        .then((data: { messages: Message[]; hasMore: boolean; nextCursor: string | null } | null) => {
          if (data?.messages) {
            dispatch({
              type: 'SET_MESSAGES',
              conversationId: activeId,
              messages: data.messages,
              hasMore: data.hasMore ?? false,
              nextCursor: data.nextCursor ?? null,
            });
          }
        })
        .catch(() => {});
    }
  }, [dispatch]);

  const connect = useCallback(() => {
    // Prevent duplicate connections
    if (wsRef.current && wsRef.current.readyState < 2) {
      return;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);

    ws.onopen = () => {
      const isReconnect = hasConnectedOnceRef.current;
      hasConnectedOnceRef.current = true;
      dispatch({ type: 'WS_STATUS', status: 'connected' });

      // On reconnect: guaranteed-delivery via REST replay. Any messages that
      // arrived while the WS was disconnected (screen lock, network loss) are
      // fetched and merged into state.
      if (isReconnect) {
        replayMissedMessages();
      }
    };

    ws.onmessage = (event) => {
      try {
        const envelope = JSON.parse(event.data as string) as ServerMessage;
        handleIncoming(envelope, dispatch);
      } catch (e) {
        console.error('[WS] Failed to parse message', e);
      }
    };

    ws.onclose = () => {
      dispatch({ type: 'WS_STATUS', status: 'reconnecting' });
      // Fast reconnect — 2s instead of 5s for quicker recovery after screen
      // lock/unlock or brief network drops.
      reconnectTimerRef.current = setTimeout(connect, 2000);
    };

    ws.onerror = () => ws.close(); // triggers onclose → reconnect

    wsRef.current = ws;
  }, [dispatch, replayMissedMessages]);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimerRef.current !== null) {
        clearTimeout(reconnectTimerRef.current);
      }
      wsRef.current?.close();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // GUARANTEED DELIVERY: when the tab/app becomes visible again (user unlocks
  // phone, switches back to tab), immediately check WS health and replay
  // missed messages. Mobile browsers aggressively suspend WS connections when
  // the tab is hidden/screen locked — the onclose event may fire late or not
  // at all, so we can't rely solely on the reconnect timer.
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return;

      const ws = wsRef.current;
      // If WS is already dead or closing → force immediate reconnect
      if (!ws || ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING) {
        if (reconnectTimerRef.current !== null) {
          clearTimeout(reconnectTimerRef.current);
        }
        connect();
        return;
      }

      // WS reports OPEN — but it may be a zombie (OS killed the TCP stream
      // without sending a close frame). Always replay via REST to catch any
      // messages missed during the hidden period. If the WS is truly alive,
      // this is a cheap idempotent refetch; if it's a zombie, the fetch will
      // work (HTTP is independent of WS) and the next server ping timeout
      // will close the zombie socket triggering a real reconnect.
      replayMissedMessages();
    };

    // Also reconnect when the device comes back online after a network drop.
    const handleOnline = () => {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        if (reconnectTimerRef.current !== null) {
          clearTimeout(reconnectTimerRef.current);
        }
        connect();
      }
      // Always replay in case messages were missed during offline period
      replayMissedMessages();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('online', handleOnline);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('online', handleOnline);
    };
  }, [connect, replayMissedMessages]);

  return (
    <WebSocketContext.Provider value={{ wsRef }}>
      {children}
    </WebSocketContext.Provider>
  );
}

export function useSendMessage() {
  const ctx = useContext(WebSocketContext);
  if (!ctx) throw new Error('useSendMessage must be used within WebSocketProvider');
  const { wsRef } = ctx;
  return (envelope: { type: string; payload: unknown; id?: string }) => {
    if (wsRef.current?.readyState === 1) {
      wsRef.current.send(JSON.stringify(envelope));
    }
  };
}
