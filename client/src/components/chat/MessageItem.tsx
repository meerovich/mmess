import React, { useState } from 'react';
import { format } from 'date-fns';
import { useAuth } from '../../contexts/AuthContext';
import { useChat } from '../../contexts/ChatContext';
import { useSendMessage } from '../../providers/WebSocketProvider';
import { ReplyPreview } from './ReplyPreview';
import { ReactionBar } from './ReactionBar';
import styles from './MessageItem.module.css';
import type { Message, Participant } from '../../types/chat';

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

  if (message.status === 'sending') {
    return (
      <span className={`${styles.receipt} ${styles.pending}`} title="Sending">
        ✓
      </span>
    );
  }

  // Check if all other participants have read
  const otherParticipants = participants.filter(p => p.user_id !== currentUserId);

  // isAllRead: true when every other participant's last_read_at >= this message's created_at.
  // last_read_at is the created_at of the last message they read (ISO string from server).
  // Both are ISO strings — lexicographic comparison is valid for ISO 8601 timestamps.
  const isAllRead =
    otherParticipants.length > 0 &&
    otherParticipants.every(p =>
      p.last_read_at != null && p.last_read_at >= message.created_at
    );

  const tooltipParts: string[] = otherParticipants
    .filter(p => p.last_read_at != null && p.last_read_at >= message.created_at)
    .map(p => p.username);
  const tooltipText = tooltipParts.length > 0 ? `Read by: ${tooltipParts.join(', ')}` : undefined;

  return (
    <span
      className={`${styles.receipt} ${isAllRead ? styles.allRead : styles.pending}`}
      title={tooltipText}
    >
      {isAllRead ? '✓✓' : '✓'}
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

  const currentUserId = user?.id ?? '';
  const isOwn = message.sender_id === currentUserId;

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
        <div className={`${styles.avatar} ${isGrouped ? styles.avatarHidden : ''}`}>
          <span>{message.sender.username.charAt(0).toUpperCase()}</span>
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
          <div className={styles.content}>{message.content}</div>
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

      {/* Hover menu */}
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
    </div>
  );
}
