import { formatDistanceToNow, format, isThisYear } from 'date-fns';
import { useChat } from '../../contexts/ChatContext';
import { useAuth } from '../../contexts/AuthContext';
import { useChatLayout } from './ChatLayout';
import { Avatar } from '../common/Avatar';
import type { Conversation } from '../../types/chat';
import styles from './ConversationItem.module.css';

interface ConversationItemProps {
  conversation: Conversation;
}

function formatTime(dateStr: string): string {
  const date = new Date(dateStr);
  const diffHours = (Date.now() - date.getTime()) / (1000 * 60 * 60);
  if (diffHours < 24) {
    return formatDistanceToNow(date);
  }
  if (isThisYear(date)) {
    return format(date, 'dd/MM');
  }
  return format(date, 'dd/MM/yy');
}

export function ConversationItem({ conversation }: ConversationItemProps) {
  const { state, dispatch } = useChat();
  const { user } = useAuth();
  const { setShowChat } = useChatLayout();

  const isActive = conversation.id === state.activeConversationId;

  // Presence: only show dot for DM conversations (the other participant)
  const { presenceByUser } = state;
  const presenceTargetId =
    conversation.type === 'direct' && user
      ? conversation.participants.find(p => p.user_id !== user.id)?.user_id ?? null
      : null;
  const presence = presenceTargetId ? presenceByUser[presenceTargetId] : null;
  const isOnline = presence?.online ?? false;

  // For DMs: display the other participant's name
  const displayName =
    conversation.type === 'direct' && user
      ? (conversation.participants.find(p => p.user_id !== user.id)?.username ?? conversation.name ?? 'Unknown')
      : (conversation.name ?? 'Group');

  const lastPreview = conversation.last_message?.content
    ? conversation.last_message.content.slice(0, 50)
    : null;

  const timeStr = conversation.updated_at ? formatTime(conversation.updated_at) : '';

  const unreadCount = conversation.unread_count;
  const unreadLabel = unreadCount > 99 ? '99+' : String(unreadCount);

  function handleClick() {
    dispatch({ type: 'SET_ACTIVE_CONVERSATION', conversationId: conversation.id });
    setShowChat(true);
  }

  return (
    <div
      className={`${styles.item} ${isActive ? styles.active : ''}`}
      onClick={handleClick}
      role="button"
      tabIndex={0}
      onKeyDown={e => e.key === 'Enter' && handleClick()}
      aria-label={unreadCount > 0 ? `${displayName}, ${unreadCount} unread messages` : displayName}
    >
      <div className={styles.avatarWrapper}>
        <Avatar name={displayName} size="sm" />
        {presenceTargetId && (
          <span
            className={`${styles.onlineDot} ${isOnline ? styles.onlineDotOnline : styles.onlineDotOffline}`}
            title={
              isOnline
                ? 'Online'
                : presence?.last_seen_at
                ? `Last seen ${formatDistanceToNow(new Date(presence.last_seen_at), { addSuffix: true })}`
                : 'Last seen unknown'
            }
            aria-label={isOnline ? 'Online' : 'Offline'}
          />
        )}
      </div>

      <div className={styles.content}>
        <div className={styles.topRow}>
          <span className={styles.name}>{displayName}</span>
          <span className={styles.time}>{timeStr}</span>
        </div>
        <div className={styles.bottomRow}>
          <span className={styles.preview}>
            {lastPreview ?? <em className={styles.noPreview}>No messages yet</em>}
          </span>
          {unreadCount > 0 && (
            <span
              className={styles.unreadBadge}
              aria-label={`${unreadCount} unread messages`}
            >
              {unreadLabel}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
