import { useCallback, useEffect, useRef, useState } from 'react';
import { format, formatDistanceToNow, isToday, isYesterday } from 'date-fns';
import { ru, enUS } from 'date-fns/locale';
import { useNavigate } from 'react-router-dom';
import { useChat } from '../../contexts/ChatContext';
import { useAuth } from '../../contexts/AuthContext';
import { useTranslation } from '../../lib/i18n';
import { getPlainMessagePreview } from '../../lib/chatText';
import { decryptMessagePayload, isEncryptedPayload } from '../../lib/e2ee';
import { useChatLayout } from './ChatLayout';
import { useSendMessage } from '../../providers/WebSocketProvider';
import { Avatar } from '../common/Avatar';
import type { Conversation } from '../../types/chat';
import styles from './ConversationItem.module.css';

interface ConversationItemProps {
  conversation: Conversation;
}

function formatTime(dateStr: string, locale: 'ru' | 'en', t: (key: string) => string): string {
  const date = new Date(dateStr);
  if (isToday(date)) {
    return format(date, 'HH:mm');
  }
  if (isYesterday(date)) {
    return t('time.yesterday');
  }
  return format(date, 'dd.MM.yy', { locale: locale === 'ru' ? ru : enUS });
}

export function ConversationItem({ conversation }: ConversationItemProps) {
  const { state, dispatch } = useChat();
  const { user } = useAuth();
  const { setShowChat } = useChatLayout();
  const navigate = useNavigate();
  const sendWs = useSendMessage();
  const { t, locale } = useTranslation();
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [didSwipeMarkRead, setDidSwipeMarkRead] = useState(false);
  const touchRef = useRef<{ startX: number; startY: number; swiping: boolean } | null>(null);

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
      ? (conversation.participants.find(p => p.user_id !== user.id)?.username ?? conversation.name ?? t('chat.unknown'))
      : (conversation.name ?? t('sidebar.newGroup'));
  const displayAvatarUrl =
    conversation.type === 'direct' && user
      ? (conversation.participants.find(p => p.user_id !== user.id)?.avatar_url ?? null)
      : conversation.avatar_url;

  // Strip markdown syntax for sidebar preview and mirror message emoticons.
  const encryptedLastMessage = isEncryptedPayload(conversation.last_message?.content);
  const lastPreview = conversation.last_message?.content && !encryptedLastMessage
    ? getPlainMessagePreview(conversation.last_message.content, 50)
    : null;
  const [decryptedPreview, setDecryptedPreview] = useState<string | null>(null);

  useEffect(() => {
    const content = conversation.last_message?.content;
    if (!content || !user?.id || !isEncryptedPayload(content)) {
      setDecryptedPreview(null);
      return;
    }

    let cancelled = false;
    decryptMessagePayload(conversation, user.id, content)
      .then((payload) => {
        if (cancelled) return;
        const text = payload?.text || (payload?.file ? payload.file.name : null);
        setDecryptedPreview(text ? getPlainMessagePreview(text, 50) : null);
      })
      .catch(() => {
        if (!cancelled) setDecryptedPreview(t('chat.encryptedMessage'));
      });

    return () => {
      cancelled = true;
    };
  }, [conversation, conversation.last_message?.content, t, user?.id]);

  const timeStr = conversation.updated_at ? formatTime(conversation.updated_at, locale, t) : '';

  // Check for draft text in localStorage
  const draft = typeof window !== 'undefined'
    ? localStorage.getItem(`draft:${conversation.id}`) ?? ''
    : '';

  const unreadCount = conversation.unread_count;
  const unreadLabel = unreadCount > 99 ? '99+' : String(unreadCount);
  const canMarkRead = unreadCount > 0 && Boolean(conversation.last_message?.id);
  const SWIPE_THRESHOLD = 88;

  // Read receipt status for the last outgoing message in conversation list.
  // Show check (sent) / double-check (delivered/read) with color for read state.
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

  const markConversationRead = useCallback(() => {
    if (!user?.id || !conversation.last_message?.id || unreadCount === 0) return;

    sendWs({
      type: 'read:mark',
      payload: {
        conversation_id: conversation.id,
        message_id: conversation.last_message.id,
      },
    });
    dispatch({ type: 'MARK_READ', conversationId: conversation.id, messageId: conversation.last_message.id });
    dispatch({
      type: 'UPDATE_PARTICIPANT_READ',
      conversationId: conversation.id,
      userId: user.id,
      lastReadAt: new Date().toISOString(),
      messageId: conversation.last_message.id,
    });
  }, [conversation.id, conversation.last_message?.id, dispatch, sendWs, unreadCount, user?.id]);

  function handleClick() {
    if (didSwipeMarkRead) {
      setDidSwipeMarkRead(false);
      return;
    }
    const isReplacingExistingChat = window.location.pathname.startsWith('/chat/');
    dispatch({ type: 'SET_ACTIVE_CONVERSATION', conversationId: conversation.id });
    setShowChat(true);
    // List -> chat should create one back-stack entry to return to the list.
    // Chat -> chat should replace, otherwise iOS swipe-back can walk through
    // previously viewed chats instead of stopping at the list.
    navigate(`/chat/${conversation.id}`, { replace: isReplacingExistingChat });
  }

  const handleTouchStart = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    const touch = e.touches[0];
    touchRef.current = { startX: touch.clientX, startY: touch.clientY, swiping: false };
    setDidSwipeMarkRead(false);
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    if (!touchRef.current || !canMarkRead) return;
    const touch = e.touches[0];
    const dx = touch.clientX - touchRef.current.startX;
    const dy = touch.clientY - touchRef.current.startY;

    if (!touchRef.current.swiping && Math.abs(dy) > Math.abs(dx)) {
      touchRef.current = null;
      setSwipeOffset(0);
      return;
    }

    if (dx < -10) {
      e.preventDefault();
      touchRef.current.swiping = true;
      setSwipeOffset(Math.max(dx, -120));
    }
  }, [canMarkRead]);

  const handleTouchEnd = useCallback(() => {
    if (touchRef.current?.swiping && swipeOffset <= -SWIPE_THRESHOLD) {
      markConversationRead();
      setDidSwipeMarkRead(true);
    }
    touchRef.current = null;
    setSwipeOffset(0);
  }, [markConversationRead, swipeOffset]);

  return (
    <div className={styles.swipeShell}>
      <div className={`${styles.swipeAction} ${canMarkRead && swipeOffset < 0 ? styles.swipeActionVisible : ''}`}>
        {t('chat.markRead')}
      </div>
      <div
        className={`${styles.item} ${isActive ? styles.active : ''}`}
        onClick={handleClick}
        role="button"
        tabIndex={0}
        onKeyDown={e => e.key === 'Enter' && handleClick()}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={swipeOffset !== 0 ? { transform: `translateX(${swipeOffset}px)` } : undefined}
        aria-label={unreadCount > 0 ? t('unread.messages', { count: String(unreadCount) }) + ' — ' + displayName : displayName}
      >
      <div className={styles.avatarWrapper}>
        <Avatar
          name={displayName}
          avatarUrl={displayAvatarUrl}
          size="sm"
          kind={conversation.type === 'group' ? 'group' : 'user'}
        />
        {presenceTargetId && (
          <span
            className={`${styles.onlineDot} ${isOnline ? styles.onlineDotOnline : styles.onlineDotOffline}`}
            title={
              isOnline
                ? t('time.online')
                : presence?.last_seen_at
                ? t('time.lastSeen', { time: formatDistanceToNow(new Date(presence.last_seen_at), { addSuffix: true, locale: locale === 'ru' ? ru : enUS }) })
                : t('time.lastSeenUnknown')
            }
            aria-label={isOnline ? t('time.online') : t('time.offline')}
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
              <><span className={styles.draftLabel}>{t('sidebar.draft')}</span>{getPlainMessagePreview(draft, 40)}</>
            ) : (
              <>
                {isOwnLastMessage && outgoingStatus && (
                  <span className={outgoingStatus === 'read' ? styles.checkRead : styles.checkSent}>
                    {outgoingStatus === 'read' ? '\u2713\u2713 ' : '\u2713 '}
                  </span>
                )}
                {decryptedPreview
                  ?? lastPreview
                  ?? (encryptedLastMessage
                    ? t('chat.encryptedMessage')
                    : <em className={styles.noPreview}>{t('sidebar.noMessages')}</em>)}
              </>
            )}
          </span>
          {unreadCount > 0 && (
            <span
              className={styles.unreadBadge}
              aria-label={t('unread.messages', { count: String(unreadCount) })}
            >
              {unreadLabel}
            </span>
          )}
        </div>
      </div>
      </div>
    </div>
  );
}
