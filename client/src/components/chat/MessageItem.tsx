import React, { useState } from 'react';
import { format } from 'date-fns';
import { marked } from 'marked';
import { useAuth } from '../../contexts/AuthContext';
import { useChat } from '../../contexts/ChatContext';
import { useTranslation } from '../../lib/i18n';
import { useSendMessage } from '../../providers/WebSocketProvider';
import { ReplyPreview } from './ReplyPreview';
import { ReactionBar, AddReactionButton } from './ReactionBar';
import { FileCard } from './FileCard';
import { Lightbox } from './Lightbox';
import { ForwardModal } from './ForwardModal';
import styles from './MessageItem.module.css';
import type { Message, Participant } from '../../types/chat';

// Configure marked for chat messages: no paragraph wrapping for single lines,
// breaks on newlines (GFM), sanitize by not allowing raw HTML.
marked.setOptions({ breaks: true, gfm: true });

/** Render markdown to HTML string, stripping outer <p> for single-line messages. */
function renderMarkdown(text: string, participantNames?: string[]): string {
  const html = marked.parse(text, { async: false }) as string;
  // Strip wrapping <p>...</p> if the entire output is a single paragraph
  const trimmed = html.trim();
  let result = trimmed;
  if (result.startsWith('<p>') && result.endsWith('</p>') && result.indexOf('<p>', 1) === -1) {
    result = result.slice(3, -4);
  }
  // Highlight @mentions — match full participant names (may contain spaces)
  if (participantNames && participantNames.length > 0) {
    // Sort by length descending so longer names match first
    const sorted = [...participantNames].sort((a, b) => b.length - a.length);
    for (const name of sorted) {
      const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      result = result.replace(
        new RegExp(`@${escaped}`, 'gi'),
        `<span class="mmess-mention">@${name}</span>`
      );
    }
  } else {
    // Fallback: simple word match
    result = result.replace(/@(\w+)/g, '<span class="mmess-mention">@$1</span>');
  }
  return result;
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
  t,
}: {
  message: Message;
  currentUserId: string;
  participants: Participant[];
  t: (key: string, params?: Record<string, string>) => string;
}) {
  if (message.sender_id !== currentUserId) return null;

  // D-06: No separate spinner — optimistic insert shows single check immediately
  if (message.status === 'sending') {
    return (
      <span className={`${styles.receipt} ${styles.sent}`} title={t('time.sending')}>
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
    ? t('time.readBy', { names: readNames.join(', ') })
    : isDelivered
      ? t('time.delivered')
      : t('time.sent');

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
  const { t } = useTranslation();
  const sendWs = useSendMessage();
  const [showMenu, setShowMenu] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [forwardMessage, setForwardMessage] = useState<Message | null>(null);

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

  return (
    <div
      className={`${styles.item} ${isOwn ? styles.own : ''}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => {
        setIsHovered(false);
        setShowMenu(false);
      }}
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
              aria-label={senderOnline ? t('time.online') : t('time.offline')}
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

        {/* Forwarded header (Telegram-style) */}
        {message.forwarded_from && (
          <div className={styles.forwardedHeader}>
            {t('chat.forwardedFrom', { name: message.forwarded_from.sender?.username ?? '?' })}
          </div>
        )}

        {/* Message content */}
        {message.is_deleted ? (
          <div className={`${styles.content} ${styles.deleted}`}>{t('chat.deleted')}</div>
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
                dangerouslySetInnerHTML={{ __html: renderMarkdown(message.content, conversation?.participants.map(p => p.username)) }}
              />
            )}
          </>
        )}

        {/* Timestamp row: [reaction badges] left | spacer | [+ ↩ time receipt] right */}
        <div className={styles.timestamp}>
          {!message.is_deleted && (
            <span className={styles.timestampReactions}>
              <ReactionBar
                reactions={message.reactions}
                messageId={message.id}
                currentUserId={currentUserId}
                conversationId={message.conversation_id}
              />
            </span>
          )}
          <span className={styles.timestampSpacer} />
          <span className={styles.timestampTime}>
            {!message.is_deleted && (
              <>
                <AddReactionButton messageId={message.id} conversationId={message.conversation_id} />
                <button
                  className={styles.inlineReplyBtn}
                  onClick={handleReply}
                  aria-label={t('chat.reply')}
                >
                  ↩
                </button>
                <button
                  className={styles.inlineReplyBtn}
                  onClick={() => setForwardMessage(message)}
                  aria-label={t('chat.forward')}
                >
                  ↗
                </button>
              </>
            )}
            {timestamp}
            {message.edited_at && !message.is_deleted && (
              <span className={styles.edited}>{t('chat.edited')}</span>
            )}
            {isOwn && (
              <ReadReceipt
                message={message}
                currentUserId={currentUserId}
                participants={conversation?.participants ?? []}
                t={t}
              />
            )}
          </span>
        </div>

        {/* Inline delete confirmation */}
        {showDeleteConfirm && (
          <div className={styles.deleteConfirm}>
            <span className={styles.deleteConfirmText}>{t('chat.deleteConfirm')}</span>
            <div className={styles.deleteConfirmButtons}>
              <button
                className={styles.keepBtn}
                onClick={() => setShowDeleteConfirm(false)}
              >
                {t('chat.keepMessage')}
              </button>
              <button
                className={styles.deleteBtn}
                onClick={handleDeleteConfirm}
              >
                {t('chat.deleteMessage')}
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

      {/* Forward modal */}
      {forwardMessage && (
        <ForwardModal
          message={forwardMessage}
          onClose={() => setForwardMessage(null)}
        />
      )}

      {/* Action menu — inside .item but positioned absolutely so no layout shift */}
      {isHovered && !message.is_deleted && (
        <div className={`${styles.menuWrapper} ${isOwn ? styles.menuWrapperOwn : ''}`}>
          <button
            className={styles.menuBtn}
            onClick={handleReply}
            aria-label={t('chat.reply')}
          >
            ↩
          </button>
          <button
            className={styles.menuBtn}
            onClick={() => setForwardMessage(message)}
            aria-label={t('chat.forward')}
          >
            ↗
          </button>

          {canEditDelete && (
            <div className={styles.overflowMenu}>
              <button
                className={styles.menuBtn}
                onClick={() => setShowMenu(prev => !prev)}
                aria-label={t('chat.messageOptions')}
              >
                ···
              </button>
              {showMenu && (
                <div className={styles.dropdown}>
                  <button className={styles.dropdownItem} onClick={handleEdit}>
                    {t('chat.edit')}
                  </button>
                  <button
                    className={`${styles.dropdownItem} ${styles.dropdownItemDestructive}`}
                    onClick={() => {
                      setShowMenu(false);
                      setShowDeleteConfirm(true);
                    }}
                  >
                    {t('chat.deleteMessage')}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

    </div>
  );
}
