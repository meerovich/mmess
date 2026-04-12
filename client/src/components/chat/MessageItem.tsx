import React, { useRef, useState } from 'react';
import { format } from 'date-fns';
import { marked } from 'marked';
import { useAuth } from '../../contexts/AuthContext';
import { useChat } from '../../contexts/ChatContext';
import { useSendMessage } from '../../providers/WebSocketProvider';
import { ReplyPreview } from './ReplyPreview';
import { ReactionBar } from './ReactionBar';
import { FileCard } from './FileCard';
import { Lightbox } from './Lightbox';
import styles from './MessageItem.module.css';
import type { Message, Participant } from '../../types/chat';

// Configure marked for chat messages: no paragraph wrapping for single lines,
// breaks on newlines (GFM), sanitize by not allowing raw HTML.
marked.setOptions({ breaks: true, gfm: true });

/** Render markdown to HTML string, stripping outer <p> for single-line messages. */
function renderMarkdown(text: string): string {
  const html = marked.parse(text, { async: false }) as string;
  // Strip wrapping <p>...</p> if the entire output is a single paragraph
  const trimmed = html.trim();
  if (trimmed.startsWith('<p>') && trimmed.endsWith('</p>') && trimmed.indexOf('<p>', 1) === -1) {
    return trimmed.slice(3, -4);
  }
  return trimmed;
}

interface MessageItemProps {
  message: Message;
  isGrouped?: boolean;
  onReply?: (message: Message) => void;
  onEdit?: (message: Message) => void;
}

function ReadReceipt({
  message,
  currentUserId,
  participants,
}: {
  message: Message;
  currentUserId: string;
  participants: Participant[];
}) {
  if (message.sender_id !== currentUserId) return null;

  // D-06: No separate spinner — optimistic insert shows single check immediately
  if (message.status === 'sending') {
    return (
      <span className={`${styles.receipt} ${styles.sent}`} title="Sending">
        &#10003;
      </span>
    );
  }

  const otherParticipants = participants.filter(p => p.user_id !== currentUserId);

  // D-02: In group chats, ALL participants must have read for blue double check
  const isAllRead =
    otherParticipants.length > 0 &&
    otherParticipants.every(p =>
      p.last_read_at != null && p.last_read_at >= message.created_at
    );

  // D-01: delivered = at least one recipient socket received message:new
  const isDelivered = message.status === 'delivered' || isAllRead;

  // D-03: Tooltip shows list of names who have read
  const readNames: string[] = otherParticipants
    .filter(p => p.last_read_at != null && p.last_read_at >= message.created_at)
    .map(p => p.username);
  const tooltipText = readNames.length > 0
    ? `Read by: ${readNames.join(', ')}`
    : isDelivered
      ? 'Delivered'
      : 'Sent';

  // D-05: WhatsApp-style — single gray check (sent), double gray check (delivered), double blue check (read)
  if (isAllRead) {
    return (
      <span className={`${styles.receipt} ${styles.allRead}`} title={tooltipText}>
        &#10003;&#10003;
      </span>
    );
  }

  if (isDelivered) {
    return (
      <span className={`${styles.receipt} ${styles.delivered}`} title={tooltipText}>
        &#10003;&#10003;
      </span>
    );
  }

  // Sent (single gray check)
  return (
    <span className={`${styles.receipt} ${styles.sent}`} title={tooltipText}>
      &#10003;
    </span>
  );
}

export function MessageItem({ message, isGrouped = false, onReply, onEdit }: MessageItemProps) {
  const { user } = useAuth();
  const { state } = useChat();
  const sendWs = useSendMessage();
  const [showMenu, setShowMenu] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [showContextMenu, setShowContextMenu] = useState(false);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const currentUserId = user?.id ?? '';
  const isOwn = message.sender_id === currentUserId;

  // Presence dot on sender avatar (D-20)
  const senderPresence = state.presenceByUser[message.sender_id];
  const senderOnline = senderPresence?.online ?? false;

  const conversation = state.conversations.find(c => c.id === message.conversation_id);
  const currentParticipant = conversation?.participants.find(p => p.user_id === currentUserId);

  // D-21: edit/delete menu only in group chats with correct permissions
  const canEditDelete =
    conversation?.type === 'group' &&
    isOwn &&
    (currentParticipant?.can_edit_messages ?? false);

  // Edit flow: activates message:edit mode in MessageInput via onEdit callback
  const handleEdit = () => {
    setShowMenu(false);
    onEdit?.(message);
  };

  const handleDeleteConfirm = () => {
    sendWs({
      type: 'message:delete',
      payload: { message_id: message.id, conversation_id: message.conversation_id },
    });
    setShowDeleteConfirm(false);
  };

  const handleReply = () => {
    setShowMenu(false);
    onReply?.(message);
  };

  const timestamp = format(new Date(message.created_at), 'HH:mm');

  // Long-press handler for mobile context menu
  const handleTouchStart = () => {
    if (message.is_deleted) return;
    longPressTimerRef.current = setTimeout(() => {
      setShowContextMenu(true);
    }, 500);
  };
  const handleTouchEnd = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  return (
    <div
      className={`${styles.item} ${isOwn ? styles.own : ''}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => {
        setIsHovered(false);
        setShowMenu(false);
      }}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchMove={handleTouchEnd}
    >
      {/* Avatar placeholder for other user messages */}
      {!isOwn && (
        <div className={styles.avatarWrapper}>
          <div className={`${styles.avatar} ${isGrouped ? styles.avatarHidden : ''}`}>
            <span>{message.sender.username.charAt(0).toUpperCase()}</span>
          </div>
          {!isGrouped && (
            <span
              className={`${styles.onlineDot} ${senderOnline ? styles.onlineDotOnline : styles.onlineDotOffline}`}
              aria-label={senderOnline ? 'Online' : 'Offline'}
            />
          )}
        </div>
      )}

      <div className={`${styles.bubble} ${isOwn ? styles.own : styles.other}`}>
        {/* Sender name for group chats — show if not grouped and not own */}
        {!isOwn && !isGrouped && conversation?.type === 'group' && (
          <div className={styles.senderName}>{message.sender.username}</div>
        )}

        {/* Reply preview */}
        {message.reply_to && (
          <ReplyPreview replyTo={message.reply_to} />
        )}

        {/* Message content */}
        {message.is_deleted ? (
          <div className={`${styles.content} ${styles.deleted}`}>Message deleted</div>
        ) : (
          <>
            {/* Image attachment — inline thumbnail with click-to-lightbox (D-29, D-30) */}
            {message.file_id && message.is_image && (
              <div
                className={styles.imageContainer}
                onClick={() => setLightboxOpen(true)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter') setLightboxOpen(true); }}
                aria-label={`View ${message.file_name || 'image'}`}
              >
                <img
                  src={message.thumbnail_url ?? `/api/files/${message.file_id}/thumb`}
                  alt={message.file_name || 'Attached image'}
                  className={styles.inlineImage}
                  onError={(e) => {
                    // Fall back to hiding broken image
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
              </div>
            )}

            {/* File card — non-image attachment (D-32) */}
            {message.file_id && !message.is_image && message.file_name && (
              <FileCard
                fileId={message.file_id}
                fileName={message.file_name}
                fileSize={message.file_size ?? 0}
                mimeType={message.file_mime ?? 'application/octet-stream'}
              />
            )}

            {/* Text content with markdown rendering */}
            {message.content && (
              <div
                className={styles.content}
                dangerouslySetInnerHTML={{ __html: renderMarkdown(message.content) }}
              />
            )}
          </>
        )}

        {/* Reactions */}
        {!message.is_deleted && (
          <ReactionBar
            reactions={message.reactions}
            messageId={message.id}
            currentUserId={currentUserId}
            conversationId={message.conversation_id}
          />
        )}

        {/* Timestamp row */}
        <div className={styles.timestamp}>
          {timestamp}
          {message.edited_at && !message.is_deleted && (
            <span className={styles.edited}>(edited)</span>
          )}
          {isOwn && (
            <ReadReceipt
              message={message}
              currentUserId={currentUserId}
              participants={conversation?.participants ?? []}
            />
          )}
        </div>

        {/* Inline delete confirmation */}
        {showDeleteConfirm && (
          <div className={styles.deleteConfirm}>
            <span className={styles.deleteConfirmText}>Delete this message?</span>
            <div className={styles.deleteConfirmButtons}>
              <button
                className={styles.keepBtn}
                onClick={() => setShowDeleteConfirm(false)}
              >
                Keep message
              </button>
              <button
                className={styles.deleteBtn}
                onClick={handleDeleteConfirm}
              >
                Delete message
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Lightbox — full-size image viewer (D-30, D-31) */}
      {lightboxOpen && message.file_id && (
        <Lightbox
          fileId={message.file_id}
          fileName={message.file_name || 'Image'}
          onClose={() => setLightboxOpen(false)}
        />
      )}

      {/* Action menu — inside .item but positioned absolutely so no layout shift */}
      {isHovered && !message.is_deleted && (
        <div className={`${styles.menuWrapper} ${isOwn ? styles.menuWrapperOwn : ''}`}>
          <button
            className={styles.menuBtn}
            onClick={handleReply}
            aria-label="Reply"
          >
            ↩
          </button>

          {canEditDelete && (
            <div className={styles.overflowMenu}>
              <button
                className={styles.menuBtn}
                onClick={() => setShowMenu(prev => !prev)}
                aria-label="Message options"
              >
                ···
              </button>
              {showMenu && (
                <div className={styles.dropdown}>
                  <button className={styles.dropdownItem} onClick={handleEdit}>
                    Edit
                  </button>
                  <button
                    className={`${styles.dropdownItem} ${styles.dropdownItemDestructive}`}
                    onClick={() => {
                      setShowMenu(false);
                      setShowDeleteConfirm(true);
                    }}
                  >
                    Delete message
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Long-press context menu (mobile) */}
      {showContextMenu && (
        <>
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 19 }}
            onClick={() => setShowContextMenu(false)}
          />
          <div className={styles.contextMenu}>
            <button className={styles.contextMenuItem} onClick={() => { setShowContextMenu(false); handleReply(); }}>
              ↩ Ответить
            </button>
            {canEditDelete && (
              <>
                <button className={styles.contextMenuItem} onClick={() => { setShowContextMenu(false); handleEdit(); }}>
                  ✏ Редактировать
                </button>
                <button className={styles.contextMenuItem} onClick={() => { setShowContextMenu(false); setShowDeleteConfirm(true); }}>
                  🗑 Удалить
                </button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
