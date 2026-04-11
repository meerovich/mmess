import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useChat } from '../../contexts/ChatContext';
import { useSendMessage } from '../../providers/WebSocketProvider';
import styles from './MessageInput.module.css';
import type { Message } from '../../types/chat';

// nanoid is hoisted from server workspace to root node_modules
import { nanoid } from 'nanoid';

interface MessageInputProps {
  conversationId: string;
  replyTo?: Message | null;
  onClearReply?: () => void;
  editMessage?: Message | null;
  onClearEdit?: () => void;
}

export function MessageInput({
  conversationId,
  replyTo = null,
  onClearReply,
  editMessage = null,
  onClearEdit,
}: MessageInputProps) {
  const { user } = useAuth();
  const { dispatch } = useChat();
  const sendWs = useSendMessage();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isTypingRef = useRef(false);

  const [value, setValue] = useState('');

  // Populate textarea when entering edit mode
  useEffect(() => {
    if (editMessage) {
      setValue(editMessage.content ?? '');
      textareaRef.current?.focus();
    }
  }, [editMessage]);

  // On unmount: stop typing
  useEffect(() => {
    return () => {
      if (isTypingRef.current) {
        sendWs({ type: 'typing:stop', payload: { conversation_id: conversationId } });
        isTypingRef.current = false;
      }
      if (typingTimerRef.current !== null) {
        clearTimeout(typingTimerRef.current);
      }
    };
  }, [conversationId, sendWs]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    setValue(newValue);

    if (newValue.length > 0) {
      // Send typing:start on first keystroke
      if (!isTypingRef.current) {
        sendWs({ type: 'typing:start', payload: { conversation_id: conversationId } });
        isTypingRef.current = true;
      }
      // Reset debounce timer
      if (typingTimerRef.current !== null) clearTimeout(typingTimerRef.current);
      typingTimerRef.current = setTimeout(() => {
        sendWs({ type: 'typing:stop', payload: { conversation_id: conversationId } });
        isTypingRef.current = false;
      }, 3000);
    } else {
      // Input cleared: immediate stop
      if (isTypingRef.current) {
        sendWs({ type: 'typing:stop', payload: { conversation_id: conversationId } });
        isTypingRef.current = false;
      }
      if (typingTimerRef.current !== null) {
        clearTimeout(typingTimerRef.current);
        typingTimerRef.current = null;
      }
    }
  };

  const handleSend = () => {
    const trimmed = value.trim();
    if (!trimmed) return;
    if (!user) return;

    if (editMessage) {
      // Edit flow
      sendWs({
        type: 'message:edit',
        payload: {
          message_id: editMessage.id,
          content: trimmed,
          conversation_id: conversationId,
        },
      });
      onClearEdit?.();
      setValue('');
    } else {
      // New message — optimistic UI
      const tempId = nanoid();
      const optimisticMessage: Message = {
        id: tempId,
        conversation_id: conversationId,
        sender_id: user.id,
        content: trimmed,
        reply_to_id: replyTo?.id ?? null,
        reply_to: replyTo
          ? {
              id: replyTo.id,
              sender_id: replyTo.sender_id,
              content: replyTo.content,
            }
          : null,
        is_deleted: false,
        edited_at: null,
        created_at: new Date().toISOString(),
        sender: {
          id: user.id,
          username: user.username,
          avatar_url: null,
        },
        reactions: [],
        status: 'sending',
      };

      dispatch({ type: 'OPTIMISTIC_MESSAGE_ADD', conversationId, message: optimisticMessage });

      sendWs({
        type: 'message:send',
        id: tempId,
        payload: {
          conversation_id: conversationId,
          content: trimmed,
          reply_to_id: replyTo?.id ?? null,
        },
      });

      onClearReply?.();
      setValue('');
    }

    // Stop typing
    if (isTypingRef.current) {
      sendWs({ type: 'typing:stop', payload: { conversation_id: conversationId } });
      isTypingRef.current = false;
    }
    if (typingTimerRef.current !== null) {
      clearTimeout(typingTimerRef.current);
      typingTimerRef.current = null;
    }

    textareaRef.current?.focus();
  };

  const isDisabled = value.trim().length === 0;
  const conversationName = conversationId; // used for aria-label

  return (
    <div className={styles.inputArea}>
      {/* Reply strip */}
      {replyTo && (
        <div className={styles.replyStrip}>
          <span>↩ Replying to {replyTo.sender.username}:</span>
          <span className={styles.replyPreviewText}>
            {(replyTo.content ?? '').slice(0, 80)}
          </span>
          <button
            className={styles.stripCancelBtn}
            onClick={onClearReply}
            aria-label="Cancel reply"
          >
            ×
          </button>
        </div>
      )}

      {/* Edit strip */}
      {editMessage && (
        <div className={styles.replyStrip}>
          <span>✏ Editing message</span>
          <button
            className={styles.stripCancelBtn}
            onClick={() => {
              onClearEdit?.();
              setValue('');
            }}
            aria-label="Cancel edit"
          >
            ×
          </button>
        </div>
      )}

      <div className={styles.row}>
        <textarea
          ref={textareaRef}
          className={styles.textarea}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder="Message"
          aria-label={`Message ${conversationName}`}
          rows={1}
        />
        <button
          className={styles.sendBtn}
          onClick={handleSend}
          disabled={isDisabled}
          aria-label="Send message"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path
              d="M3 10l14-8-5 8 5 8-14-8z"
              fill="white"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}
