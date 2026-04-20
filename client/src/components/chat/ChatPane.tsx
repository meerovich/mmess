import React, { useMemo, useState } from 'react';
import { format, isToday, isYesterday } from 'date-fns';
import { ru, enUS } from 'date-fns/locale';
import { useLocation, useNavigate } from 'react-router-dom';
import { useChat } from '../../contexts/ChatContext';
import { useAuth } from '../../contexts/AuthContext';
import { useTranslation } from '../../lib/i18n';
import { apiFetch } from '../../lib/api';
import { useChatLayout } from './ChatLayout';
import { MessageList } from './MessageList';
import { MessageInput } from './MessageInput';
import { TypingIndicator } from './TypingIndicator';
import { GroupSettingsModal } from './GroupSettingsModal';
import { Avatar } from '../common/Avatar';
import styles from './ChatPane.module.css';
import type { Conversation, Message } from '../../types/chat';

function getConversationName(conversation: Conversation, currentUserId: string, t: (key: string) => string): string {
  if (conversation.type === 'group') {
    return conversation.name ?? t('chat.groupChat');
  }
  // DM: show the other participant's username
  const other = conversation.participants.find(p => p.user_id !== currentUserId);
  return other?.username ?? conversation.name ?? t('chat.chat');
}

function formatLastSeenAt(timestamp: string, locale: 'ru' | 'en'): string {
  const date = new Date(timestamp);
  if (isToday(date)) return format(date, 'HH:mm');
  if (isYesterday(date)) {
    return locale === 'ru'
      ? `вчера ${format(date, 'HH:mm')}`
      : `yesterday ${format(date, 'HH:mm')}`;
  }
  return format(date, 'dd.MM.yy HH:mm', { locale: locale === 'ru' ? ru : enUS });
}

function formatLastSeenStatus(timestamp: string, locale: 'ru' | 'en', t: (key: string, params?: Record<string, string>) => string): string {
  const date = new Date(timestamp);
  const time = formatLastSeenAt(timestamp, locale);
  if (locale === 'ru' && !isToday(date)) {
    return t('time.lastSeen', { time });
  }
  return t('time.lastSeenAt', { time });
}

export function ChatPane() {
  const { state, dispatch } = useChat();
  const { activeConversationId, conversations, wsStatus } = state;
  const { user } = useAuth();
  const { setShowChat } = useChatLayout();
  const navigate = useNavigate();
  const location = useLocation();
  const { t, locale } = useTranslation();
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [editMessage, setEditMessage] = useState<Message | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showAvatarPreview, setShowAvatarPreview] = useState(false);

  // Mobile back navigation: clear active conversation + close chat pane so the
  // sidebar becomes visible again. Navigate to / so the URL matches.
  const handleBack = () => {
    dispatch({ type: 'SET_ACTIVE_CONVERSATION', conversationId: null });
    setShowChat(false);
    const canReturnToListEntry =
      (location.state as { mmessBackToList?: boolean } | null)?.mmessBackToList === true &&
      (window.history.state?.idx ?? 0) > 0;

    if (canReturnToListEntry) {
      navigate(-1);
      return;
    }

    navigate('/', { replace: true });
  };

  const conversation = conversations.find(c => c.id === activeConversationId);

  const conversationName = conversation
    ? getConversationName(conversation, user?.id ?? '', t)
    : t('chat.chat');
  const otherParticipant = useMemo(
    () => conversation?.type === 'direct'
      ? conversation.participants.find(p => p.user_id !== user?.id)
      : null,
    [conversation, user?.id]
  );
  const presence = otherParticipant ? state.presenceByUser[otherParticipant.user_id] : null;
  const headerSubtitle = useMemo(() => {
    if (!conversation) return '';
    if (conversation.type === 'group') {
      return t('chat.membersCount', { count: String(conversation.participants.length) });
    }
    if (presence?.online) return t('time.online');
    if (!presence?.last_seen_at) return t('time.lastSeenUnknown');

    return formatLastSeenStatus(presence.last_seen_at, locale, t);
  }, [conversation, locale, presence?.last_seen_at, presence?.online, t]);
  const currentParticipant = useMemo(
    () => conversation?.participants.find(p => p.user_id === user?.id) ?? null,
    [conversation, user?.id]
  );
  const canDeleteConversation = Boolean(conversation) && (
    conversation?.type === 'direct' || currentParticipant?.is_admin
  );
  const canManagePins = Boolean(conversation) && (
    conversation?.type === 'direct' || currentParticipant?.is_admin
  );

  const handleDeleteConversation = async () => {
    if (!conversation || !canDeleteConversation) return;
    if (!window.confirm(t('chat.deleteConversationConfirm'))) return;

    const res = await apiFetch(`/api/conversations/${conversation.id}`, { method: 'DELETE' });
    if (!res.ok) return;

    dispatch({ type: 'CONVERSATION_REMOVED', conversationId: conversation.id });
    setShowAvatarPreview(false);
    handleBack();
  };

  const handleUnpinConversation = async () => {
    if (!conversation || !canManagePins || !conversation.pinned_message) return;
    const res = await apiFetch(`/api/conversations/${conversation.id}/pin`, { method: 'DELETE' });
    if (!res.ok) return;
    const updatedConversation = await res.json();
    dispatch({ type: 'CONVERSATION_UPDATED', conversation: updatedConversation });
  };

  if (!activeConversationId) {
    return (
      <div className={styles.emptyState}>
        <span>{t('chat.selectConversation')}</span>
      </div>
    );
  }

  return (
    <div className={styles.pane}>
      {wsStatus === 'reconnecting' && (
        <div className={styles.reconnectingBanner}>
          {t('chat.reconnecting')}
        </div>
      )}

      <header className={styles.header}>
        <button
          className={styles.backButton}
          onClick={handleBack}
          aria-label={t('chat.backToConversations')}
        >
          ←
        </button>
        <div
          className={`${styles.headerCenter} ${conversation?.type === 'group' ? styles.headerCenterClickable : ''}`}
          onClick={() => conversation?.type === 'group' && setShowSettings(true)}
          role={conversation?.type === 'group' ? 'button' : undefined}
          tabIndex={conversation?.type === 'group' ? 0 : undefined}
          onKeyDown={e => conversation?.type === 'group' && e.key === 'Enter' && setShowSettings(true)}
        >
          <span className={styles.headerName}>{conversationName}</span>
          {headerSubtitle && <span className={styles.headerSubtitle}>{headerSubtitle}</span>}
        </div>
        <button
          type="button"
          className={styles.headerAvatar}
          onClick={() => setShowAvatarPreview(true)}
          aria-label={t('chat.openAvatar')}
        >
          <Avatar
            name={conversationName}
            avatarUrl={conversation?.type === 'direct' ? otherParticipant?.avatar_url ?? null : conversation?.avatar_url ?? null}
            size="md"
            kind={conversation?.type === 'group' ? 'group' : 'user'}
          />
        </button>
      </header>
      {conversation?.pinned_message && (
        <div className={styles.pinnedBar}>
          <div className={styles.pinnedLabel}>{t('chat.pinnedMessage')}</div>
          <div className={styles.pinnedContent}>
            <strong>{conversation.pinned_message.sender?.username ?? t('chat.unknown')}</strong>
            <span>{conversation.pinned_message.content ?? t('chat.noPinnedContent')}</span>
          </div>
          {canManagePins && (
            <button
              type="button"
              className={styles.pinnedAction}
              onClick={handleUnpinConversation}
              aria-label={t('chat.unpinMessage')}
            >
              ×
            </button>
          )}
        </div>
      )}

      <MessageList
        conversationId={activeConversationId}
        onReply={setReplyTo}
        onEdit={setEditMessage}
      />
      <TypingIndicator conversationId={activeConversationId} />
      <InvitationAwareInput
        conversation={conversation}
        conversationId={activeConversationId}
        currentUserId={user?.id ?? ''}
        replyTo={replyTo}
        onClearReply={() => setReplyTo(null)}
        editMessage={editMessage}
        onClearEdit={() => setEditMessage(null)}
      />
      {showSettings && conversation && conversation.type === 'group' && (
        <GroupSettingsModal
          conversation={conversation}
          onClose={() => setShowSettings(false)}
        />
      )}
      {showAvatarPreview && conversation && (
        <div
          className={styles.avatarPreviewOverlay}
          onClick={() => setShowAvatarPreview(false)}
          role="dialog"
          aria-modal="true"
          aria-label={t('chat.avatarPreview')}
        >
          <div className={styles.avatarPreviewCard} onClick={event => event.stopPropagation()}>
            <button
              type="button"
              className={styles.avatarPreviewClose}
              onClick={() => setShowAvatarPreview(false)}
              aria-label={t('chat.closeMenu')}
            >
              ×
            </button>
            <Avatar
              name={conversationName}
              avatarUrl={conversation.type === 'direct' ? otherParticipant?.avatar_url ?? null : conversation.avatar_url ?? null}
              size="xl"
              kind={conversation.type === 'group' ? 'group' : 'user'}
            />
            <div className={styles.avatarPreviewName}>{conversationName}</div>
            {headerSubtitle && <div className={styles.avatarPreviewSubtitle}>{headerSubtitle}</div>}
            {canDeleteConversation && (
              <button
                type="button"
                className={styles.avatarPreviewDanger}
                onClick={handleDeleteConversation}
              >
                {t('chat.deleteConversation')}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** Wraps MessageInput with invitation-aware logic for DMs */
function InvitationAwareInput({
  conversation,
  conversationId,
  currentUserId,
  replyTo,
  onClearReply,
  editMessage,
  onClearEdit,
}: {
  conversation: Conversation | undefined;
  conversationId: string;
  currentUserId: string;
  replyTo: Message | null;
  onClearReply: () => void;
  editMessage: Message | null;
  onClearEdit: () => void;
}) {
  const { dispatch } = useChat();
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [invitationError, setInvitationError] = useState<string | null>(null);

  React.useEffect(() => {
    setInvitationError(null);
  }, [conversationId]);

  const refreshConversations = async () => {
    try {
      const res = await apiFetch('/api/conversations');
      if (!res.ok) return;
      const conversations = await res.json() as Conversation[];
      dispatch({ type: 'SET_CONVERSATIONS', conversations });
    } catch {
      // Best-effort refresh to reconcile invitation state.
    }
  };

  if (!conversation || conversation.type !== 'direct') {
    return (
      <MessageInput
        conversationId={conversationId}
        replyTo={replyTo}
        onClearReply={onClearReply}
        editMessage={editMessage}
        onClearEdit={onClearEdit}
      />
    );
  }

  const myParticipant = conversation.participants.find(p => p.user_id === currentUserId);
  const otherParticipant = conversation.participants.find(p => p.user_id !== currentUserId);

  // I'm the invited user — show accept/decline
  if (myParticipant?.status === 'pending') {
    const handleAccept = async () => {
      setLoading(true);
      setInvitationError(null);
      try {
        const res = await apiFetch(`/api/conversations/${conversationId}/accept`, { method: 'POST' });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error((err as { error?: string }).error ?? 'Failed to accept invitation');
        }
        dispatch({ type: 'INVITATION_ACCEPTED', conversationId, userId: currentUserId });
        await refreshConversations();
      } catch (err) {
        setInvitationError(err instanceof Error ? err.message : t('chat.accept'));
      } finally {
        setLoading(false);
      }
    };
    const handleDecline = async () => {
      setLoading(true);
      setInvitationError(null);
      try {
        const res = await apiFetch(`/api/conversations/${conversationId}/decline`, { method: 'POST' });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error((err as { error?: string }).error ?? 'Failed to decline invitation');
        }
        dispatch({ type: 'INVITATION_DECLINED', conversationId, userId: currentUserId });
        await refreshConversations();
      } catch (err) {
        setInvitationError(err instanceof Error ? err.message : t('chat.decline'));
      } finally {
        setLoading(false);
      }
    };

    return (
      <div className={styles.invitationBar}>
        <span>{t('chat.invitationReceived')}</span>
        <div className={styles.invitationActions}>
          <button className={styles.acceptBtn} onClick={handleAccept} disabled={loading}>
            {t('chat.accept')}
          </button>
          <button className={styles.declineBtn} onClick={handleDecline} disabled={loading}>
            {t('chat.decline')}
          </button>
        </div>
        {invitationError && <span className={styles.invitationError}>{invitationError}</span>}
      </div>
    );
  }

  // Other user hasn't accepted yet — show waiting state
  if (otherParticipant?.status === 'pending') {
    const msgs = conversation.last_message ? 1 : 0;
    if (msgs > 0) {
      return (
        <div className={styles.invitationBar}>
          <span>{t('chat.waitingAcceptance')}</span>
        </div>
      );
    }
  }

  return (
    <MessageInput
      conversationId={conversationId}
      replyTo={replyTo}
      onClearReply={onClearReply}
      editMessage={editMessage}
      onClearEdit={onClearEdit}
    />
  );
}
