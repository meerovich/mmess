import React, { createContext, useCallback, useContext, useEffect, useRef } from 'react';
import type { ChatAction, Message } from '../types/chat';
import { useChat } from '../contexts/ChatContext';

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
        // Server sends a full list of current typers or an is_typing flag.
        // Adapt: if is_typing is present, this is a single user update.
        // We rebuild typers list from the server payload.
        const conversationId = msg.payload.conversation_id as string;
        const userId = msg.payload.user_id as string;
        const username = msg.payload.username as string;
        const isTyping = msg.payload.is_typing as boolean;
        // We use SET_TYPING_USERS but need to know the current typers list.
        // For now we store a partial list per the server's signal.
        // The server sends individual typing:user events — client must maintain the list.
        // We dispatch with a sentinel that the reducer can handle for add/remove.
        dispatch({
          type: 'SET_TYPING_USERS',
          conversationId,
          typers: isTyping ? [{ userId, username }] : [],
        });
      }
      break;
    case 'read:by':
      if (msg.payload?.conversation_id) {
        dispatch({
          type: 'MARK_READ',
          conversationId: msg.payload.conversation_id as string,
          messageId: (msg.payload.message_ids as string[])?.[0] ?? '',
        });
      }
      break;
    case 'conversation:new':
      if (msg.payload?.conversation) {
        dispatch({
          type: 'UPSERT_CONVERSATION',
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
  const { dispatch } = useChat();

  const connect = useCallback(() => {
    // Prevent duplicate connections
    if (wsRef.current && wsRef.current.readyState < 2) {
      return;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);

    ws.onopen = () => {
      dispatch({ type: 'WS_STATUS', status: 'connected' });
      // On reconnect: REST-based replay per D-06 is handled by components
      // that subscribe to wsStatus changes and re-fetch missed messages via
      // GET /api/conversations/:id/messages?after=last_seen_message_id
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
      reconnectTimerRef.current = setTimeout(connect, 5000); // D-05: fixed 5s
    };

    ws.onerror = () => ws.close(); // triggers onclose → reconnect

    wsRef.current = ws;
  }, [dispatch]);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimerRef.current !== null) {
        clearTimeout(reconnectTimerRef.current);
      }
      wsRef.current?.close();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
