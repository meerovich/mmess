import { formatDistanceToNow, format, isThisYear } from 'date-fns';
import { useNavigate } from 'react-router-dom';
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
  const navigate = useNavigate();

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

  // Strip markdown syntax for sidebar preview: remove **bold**, *italic*,
  // `code`, [links](url), # headers, etc. — show clean plain text.
  const lastPreview = conversation.last_message?.content
    ? conversation.last_message.content
        .replace(/[*_~`#>\[\]()!]/g, '')
        .replace(/\n+/g, ' ')
        .trim()
        .slice(0, 50)
    : null;

  const timeStr = conversation.updated_at ? formatTime(conversation.updated_at) : '';

  // Check for draft text in localStorage
  const draft = typeof window !== 'undefined'
    ? localStorage.getItem(`draft:${conversation.id}`) ?? ''
    : '';

  const unreadCount = conversation.unread_count;
  const unreadLabel = unreadCount > 99 ? '99+' : String(unreadCount);

  // Read receipt status for the last outgoing message in conversation list.
  // Show ✓ (sent) / ✓✓ (delivered/read) with color for read state.
  const lastMsg = conversation.last_message;
  const isOwnLastMessage = lastMsg && user && lastMsg.sender_id === user.id;
  let outgoingStatus: 'sent' | 'read' | null = null;
  if (isOwnLastMessage && unreadCount === 0) {
    // Check if all other participants have read this message
    const otherParticipants = conversation.participants.filter(p => p.user_id !== user!.id);
    const allRead = otherParticipants.length > 0 && otherParticipants.every(p =>
      p.last_read_at && lastMsg.created_at && p.last_read_at >= lastMsg.created_at
    );
    outgoingStatus = allRead ? 'read' : 'sent';
  }

  function handleClick() {
    dispatch({ type: 'SET_ACTIVE_CONVERSATION', conversationId: conversation.id });
    setShowChat(true);
    // Push (not replace) so browser swipe-back has a history entry to go back to.
    // ChatLayout.useEffect on urlConversationId handles the state sync.
    navigate(`/chat/${conversation.id}`);
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
            {draft ? (
              <><span className={styles.draftLabel}>Черновик: </span>{draft.replace(/\n/g, ' ').slice(0, 40)}</>
            ) : (
              <>
                {isOwnLastMessage && outgoingStatus && (
                  <span className={outgoingStatus === 'read' ? styles.checkRead : styles.checkSent}>
                    {outgoingStatus === 'read' ? '✓✓ ' : '✓ '}
                  </span>
                )}
                {lastPreview ?? <em className={styles.noPreview}>No messages yet</em>}
              </>
            )}
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
