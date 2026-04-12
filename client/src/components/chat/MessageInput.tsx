import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useChat } from '../../contexts/ChatContext';
import { useSendMessage } from '../../providers/WebSocketProvider';
import { uploadFile } from '../../lib/api';
import { UploadStrip } from './UploadStrip';
import styles from './MessageInput.module.css';
import type { Message, UploadState } from '../../types/chat';

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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isTypingRef = useRef(false);

  // Draft persistence: restore draft from localStorage on conversation switch.
  const draftKey = `draft:${conversationId}`;
  const [value, setValue] = useState(() => localStorage.getItem(draftKey) ?? '');
  const [uploadState, setUploadState] = useState<UploadState>({ status: 'idle' });
  const [isDragging, setIsDragging] = useState(false);

  // Save draft to localStorage on every change (debounced implicitly by React batching)
  useEffect(() => {
    if (value) {
      localStorage.setItem(draftKey, value);
    } else {
      localStorage.removeItem(draftKey);
    }
  }, [value, draftKey]);

  // When switching conversations, restore draft for the new conversation
  useEffect(() => {
    setValue(localStorage.getItem(draftKey) ?? '');
  }, [conversationId]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const handleFileSelect = useCallback((file: File) => {
    // Client-side size check (D-01): 25 MB max
    if (file.size > 25 * 1024 * 1024) {
      setUploadState({ status: 'error', file, message: 'file too large (25 MB max)' });
      return;
    }

    const abortController = new AbortController();
    setUploadState({ status: 'uploading', file, progress: 0, abortController });

    uploadFile(
      file,
      (progress) => setUploadState(prev =>
        prev.status === 'uploading' ? { ...prev, progress } : prev
      ),
      abortController.signal,
    ).then((result) => {
      setUploadState({
        status: 'ready',
        file,
        fileId: result.id,
        thumbnailUrl: result.thumbnail_url ?? undefined,
      });
    }).catch((err: Error) => {
      if (err.name === 'AbortError') {
        setUploadState({ status: 'idle' });
        return;
      }
      setUploadState({ status: 'error', file, message: err.message || 'Please try again.' });
    });
  }, []);

  const handleCancelUpload = useCallback(() => {
    if (uploadState.status === 'uploading') {
      uploadState.abortController.abort();
    }
    setUploadState({ status: 'idle' });
  }, [uploadState]);

  const handleRetry = useCallback(() => {
    if (uploadState.status === 'error') {
      handleFileSelect(uploadState.file);
    }
  }, [uploadState, handleFileSelect]);

  // Drag-drop window event listeners
  useEffect(() => {
    const handleDragEnter = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes('Files')) setIsDragging(true);
    };
    const handleDragLeave = (e: DragEvent) => {
      // Only deactivate when cursor leaves the window entirely
      if (e.relatedTarget === null) setIsDragging(false);
    };
    const handleDrop = (e: DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer?.files[0];
      if (file) handleFileSelect(file);
    };
    const handleDragOver = (e: DragEvent) => { e.preventDefault(); };

    window.addEventListener('dragenter', handleDragEnter);
    window.addEventListener('dragleave', handleDragLeave);
    window.addEventListener('drop', handleDrop);
    window.addEventListener('dragover', handleDragOver);
    return () => {
      window.removeEventListener('dragenter', handleDragEnter);
      window.removeEventListener('dragleave', handleDragLeave);
      window.removeEventListener('drop', handleDrop);
      window.removeEventListener('dragover', handleDragOver);
    };
  }, [handleFileSelect]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Auto-resize textarea to fit content (up to ~6 lines).
  // Runs on every value change including after send (setValue('')) so the
  // textarea shrinks back to 1 row.
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 150)}px`;
  }, [value]);

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
    // Allow send when file is ready even with empty text (caption is optional)
    if (!trimmed && uploadState.status !== 'ready') return;
    if (!user) return;

    if (editMessage) {
      // Edit flow — files not applicable to edits
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
      const fileId = uploadState.status === 'ready' ? uploadState.fileId : undefined;
      const thumbnailUrl = uploadState.status === 'ready' ? uploadState.thumbnailUrl : undefined;
      const uploadFile_ = uploadState.status === 'ready' ? uploadState.file : null;

      const optimisticMessage: Message = {
        id: tempId,
        conversation_id: conversationId,
        sender_id: user.id,
        content: trimmed || null,
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
        // File fields
        file_id: fileId ?? null,
        file_name: uploadFile_ ? uploadFile_.name : null,
        file_mime: uploadFile_ ? uploadFile_.type : null,
        file_size: uploadFile_ ? uploadFile_.size : null,
        is_image: uploadFile_ ? uploadFile_.type.startsWith('image/') : null,
        thumbnail_url: thumbnailUrl ?? null,
      };

      dispatch({ type: 'OPTIMISTIC_MESSAGE_ADD', conversationId, message: optimisticMessage });

      sendWs({
        type: 'message:send',
        id: tempId,
        payload: {
          conversation_id: conversationId,
          content: trimmed || undefined,
          reply_to_id: replyTo?.id ?? null,
          file_id: fileId,
        },
      });

      // Clear upload state and reply
      setUploadState({ status: 'idle' });
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

  // Send is disabled when: no text AND no ready file; OR upload in progress; OR upload error
  const isDisabled =
    (value.trim().length === 0 && uploadState.status !== 'ready') ||
    uploadState.status === 'uploading' ||
    uploadState.status === 'error';

  const conversationName = conversationId; // used for aria-label

  return (
    <div
      className={`${styles.inputArea} ${isDragging ? styles.dragOver : ''}`}
      aria-dropeffect={isDragging ? 'copy' : undefined}
    >
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

      {/* Upload strip — shown when not idle */}
      {uploadState.status !== 'idle' && (
        <UploadStrip
          uploadState={uploadState as Exclude<UploadState, { status: 'idle' }>}
          onCancel={handleCancelUpload}
          onRetry={handleRetry}
        />
      )}

      <div className={styles.row}>
        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          style={{ display: 'none' }}
          aria-label="Attach file"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFileSelect(file);
            e.target.value = ''; // reset so same file can be re-selected
          }}
        />

        {/* Paperclip button (D-27) */}
        <button
          className={styles.attachBtn}
          onClick={() => fileInputRef.current?.click()}
          disabled={uploadState.status === 'uploading'}
          aria-label="Attach file"
          aria-disabled={uploadState.status === 'uploading'}
          type="button"
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
            <path
              d="M15.5 8.5l-7.3 7.3a4.5 4.5 0 01-6.4-6.4l7.8-7.8a3 3 0 014.2 4.2L6.5 13.1a1.5 1.5 0 01-2.1-2.1L11 4.4"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>

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
              d="M17 10L3 2l5 8-5 8 14-8z"
              fill="white"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}
