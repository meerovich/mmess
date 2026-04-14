import React, { useCallback, useEffect, useRef, useState } from 'react';
import { getAvatarPalette } from '../../lib/avatarColor';
import { replaceTextEmoticons } from '../../lib/chatText';
import { useAuth } from '../../contexts/AuthContext';
import { useChat } from '../../contexts/ChatContext';
import { useTranslation } from '../../lib/i18n';
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

type AttachmentUploadState =
  | { clientId: string; status: 'uploading'; file: File; progress: number; abortController: AbortController }
  | { clientId: string; status: 'ready'; file: File; fileId: string; thumbnailUrl?: string }
  | { clientId: string; status: 'error'; file: File; message: string };

export function MessageInput({
  conversationId,
  replyTo = null,
  onClearReply,
  editMessage = null,
  onClearEdit,
}: MessageInputProps) {
  const { user } = useAuth();
  const { state, dispatch } = useChat();
  const { t } = useTranslation();
  const sendWs = useSendMessage();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isTypingRef = useRef(false);

  // Draft persistence: restore draft from localStorage on conversation switch.
  const draftKey = `draft:${conversationId}`;
  const [value, setValue] = useState(() => localStorage.getItem(draftKey) ?? '');
  const [uploadStates, setUploadStates] = useState<AttachmentUploadState[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionStart, setMentionStart] = useState(0);

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

  const handleFilesSelect = useCallback((files: File[]) => {
    files.forEach((file) => {
      const clientId = nanoid();

      // Client-side size check (D-01): 25 MB max
      if (file.size > 25 * 1024 * 1024) {
        setUploadStates(prev => [...prev, { clientId, status: 'error', file, message: t('file.tooLarge') }]);
        return;
      }

      const abortController = new AbortController();
      setUploadStates(prev => [...prev, { clientId, status: 'uploading', file, progress: 0, abortController }]);

      uploadFile(
        file,
        (progress) => setUploadStates(prev => prev.map(item =>
          item.clientId === clientId && item.status === 'uploading'
            ? { ...item, progress }
            : item
        )),
        abortController.signal,
      ).then((result) => {
        setUploadStates(prev => prev.map(item =>
          item.clientId === clientId
            ? {
                clientId,
                status: 'ready',
                file,
                fileId: result.id,
                thumbnailUrl: result.thumbnail_url ?? undefined,
              }
            : item
        ));
      }).catch((err: Error) => {
        if (err.name === 'AbortError') {
          setUploadStates(prev => prev.filter(item => item.clientId !== clientId));
          return;
        }
        setUploadStates(prev => prev.map(item =>
          item.clientId === clientId
            ? { clientId, status: 'error', file, message: err.message || t('file.retry') }
            : item
        ));
      });
    });
  }, [t]);

  const handleCancelUpload = useCallback((clientId: string) => {
    setUploadStates(prev => {
      const current = prev.find(item => item.clientId === clientId);
      if (current?.status === 'uploading') {
        current.abortController.abort();
      }
      return prev.filter(item => item.clientId !== clientId);
    });
  }, []);

  const handleRetry = useCallback((clientId: string) => {
    const current = uploadStates.find(item => item.clientId === clientId);
    if (current?.status === 'error') {
      setUploadStates(prev => prev.filter(item => item.clientId !== clientId));
      handleFilesSelect([current.file]);
    }
  }, [handleFilesSelect, uploadStates]);

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
      const files = Array.from(e.dataTransfer?.files ?? []);
      if (files.length > 0) handleFilesSelect(files);
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
  }, [handleFilesSelect]);

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

  // Get conversation participants for mention autocomplete
  const conversation = state.conversations.find(c => c.id === conversationId);
  const participants = conversation?.participants.filter(p => p.user_id !== user?.id) ?? [];

  const mentionCandidates = mentionQuery !== null
    ? participants.filter(p => p.username.toLowerCase().startsWith(mentionQuery.toLowerCase())).slice(0, 5)
    : [];

  const handleMentionSelect = (username: string) => {
    const before = value.slice(0, mentionStart);
    const after = value.slice(mentionStart + (mentionQuery?.length ?? 0) + 1); // +1 for @
    setValue(`${before}@${username} ${after}`);
    setMentionQuery(null);
    textareaRef.current?.focus();
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    setValue(newValue);

    // Mention detection: find @query at cursor
    const cursor = e.target.selectionStart;
    const textBefore = newValue.slice(0, cursor);
    const atMatch = textBefore.match(/@([\w\s]*)$/);
    if (atMatch) {
      setMentionQuery(atMatch[1]);
      setMentionStart(cursor - atMatch[0].length);
    } else {
      setMentionQuery(null);
    }

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
    const readyUploads = uploadStates.filter((item): item is Extract<AttachmentUploadState, { status: 'ready' }> => item.status === 'ready');
    // Allow send when at least one file is ready even with empty text (caption is optional)
    if (!trimmed && readyUploads.length === 0) return;
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
      const uploadsToSend = readyUploads.length > 0 ? readyUploads : [null];

      uploadsToSend.forEach((readyUpload, index) => {
        const tempId = nanoid();
        const fileId = readyUpload?.fileId;
        const thumbnailUrl = readyUpload?.thumbnailUrl;
        const uploadFile_ = readyUpload?.file ?? null;
        const isPrimaryMessage = index === 0;

        const optimisticMessage: Message = {
          id: tempId,
          conversation_id: conversationId,
          sender_id: user.id,
          content: isPrimaryMessage ? (trimmed || null) : null,
          reply_to_id: isPrimaryMessage ? (replyTo?.id ?? null) : null,
          reply_to: isPrimaryMessage && replyTo
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
            avatar_url: user.avatar_url,
          },
          reactions: [],
          status: 'sending',
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
            content: isPrimaryMessage ? (trimmed || undefined) : undefined,
            reply_to_id: isPrimaryMessage ? (replyTo?.id ?? null) : null,
            file_id: fileId,
          },
        });
      });

      // Clear upload state and reply
      setUploadStates([]);
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
    // Scroll chat to bottom after sending
    window.dispatchEvent(new CustomEvent('mmess-scroll-bottom'));
  };

  // Send is disabled when: no text AND no ready file; OR upload in progress; OR upload error
  const isDisabled =
    (value.trim().length === 0 && !uploadStates.some(item => item.status === 'ready')) ||
    uploadStates.some(item => item.status === 'uploading' || item.status === 'error');
  const replyPalette = replyTo ? getAvatarPalette(replyTo.sender.username) : null;

  return (
    <div
      className={`${styles.inputArea} ${isDragging ? styles.dragOver : ''}`}
      data-chat-input-area="true"
      aria-dropeffect={isDragging ? 'copy' : undefined}
      onTouchMove={(e) => {
        // Prevent iOS from dragging the input area (rubber-band bounce)
        // Only prevent if the target is not the textarea itself (allow scroll inside textarea)
        if (!(e.target instanceof HTMLTextAreaElement)) {
          e.preventDefault();
        }
      }}
    >
      {/* Reply strip */}
      {replyTo && (
        <div
          className={styles.replyStrip}
          style={replyPalette ? {
            '--reply-accent': replyPalette.accent,
            '--reply-tint': replyPalette.tint,
          } as React.CSSProperties : undefined}
        >
          <span>{t('chat.replyingTo', { name: replyTo.sender.username })}</span>
          <span className={styles.replyPreviewText}>
            {replaceTextEmoticons(replyTo.content ?? '').slice(0, 80)}
          </span>
          <button
            className={styles.stripCancelBtn}
            onClick={onClearReply}
            aria-label={t('chat.cancelReply')}
          >
            ×
          </button>
        </div>
      )}

      {/* Edit strip */}
      {editMessage && (
        <div className={styles.replyStrip}>
          <span>{t('chat.editingMessage')}</span>
          <button
            className={styles.stripCancelBtn}
            onClick={() => {
              onClearEdit?.();
              setValue('');
            }}
            aria-label={t('chat.cancelEdit')}
          >
            ×
          </button>
        </div>
      )}

      {/* Upload strip — shown when not idle */}
      {uploadStates.map((uploadState) => (
        <UploadStrip
          key={uploadState.clientId}
          uploadState={uploadState as Exclude<UploadState, { status: 'idle' }>}
          onCancel={() => handleCancelUpload(uploadState.clientId)}
          onRetry={() => handleRetry(uploadState.clientId)}
        />
      ))}

      {/* Mention autocomplete dropdown */}
      {mentionCandidates.length > 0 && (
        <div className={styles.mentionDropdown}>
          {mentionCandidates.map(p => (
            <button
              key={p.user_id}
              className={styles.mentionItem}
              onMouseDown={e => { e.preventDefault(); handleMentionSelect(p.username); }}
            >
              @{p.username}
            </button>
          ))}
        </div>
      )}

      <div className={styles.row}>
        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          style={{ display: 'none' }}
          aria-label={t('chat.attachFile')}
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            if (files.length > 0) handleFilesSelect(files);
            e.target.value = ''; // reset so same file can be re-selected
          }}
        />

        {/* Paperclip button (D-27) */}
        <button
          className={styles.attachBtn}
          onMouseDown={e => e.preventDefault()}
          onClick={() => {
            // Blur textarea so iOS keyboard closes; visualViewport resize
            // handler in ChatLayout will restore safe-area padding automatically.
            textareaRef.current?.blur();
            fileInputRef.current?.click();
          }}
          aria-label={t('chat.attachFile')}
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
          onFocus={() => {
            window.dispatchEvent(new CustomEvent('mmess-scroll-bottom'));
          }}
          placeholder={t('chat.message')}
          aria-label={t('chat.message')}
          rows={1}
        />
        <button
          className={styles.sendBtn}
          onClick={handleSend}
          onMouseDown={e => e.preventDefault()}
          disabled={isDisabled}
          aria-label={t('chat.sendMessage')}
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
