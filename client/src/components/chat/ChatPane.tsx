import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useChat } from '../../contexts/ChatContext';
import { useAuth } from '../../contexts/AuthContext';
import { useTranslation } from '../../lib/i18n';
import { apiFetch } from '../../lib/api';
import { useChatLayout } from './ChatLayout';
import { MessageList } from './MessageList';
import { MessageInput } from './MessageInput';
import { TypingIndicator } from './TypingIndicator';
import { GroupSettingsModal } from './GroupSettingsModal';
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

export function ChatPane() {
  const { state, dispatch } = useChat();
  const { activeConversationId, conversations, wsStatus } = state;
  const { user } = useAuth();
  const { setShowChat } = useChatLayout();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [editMessage, setEditMessage] = useState<Message | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  // Mobile back navigation: clear active conversation + close chat pane so the
  // sidebar becomes visible again. Navigate to / so the URL matches.
  const handleBack = () => {
    dispatch({ type: 'SET_ACTIVE_CONVERSATION', conversationId: null });
    setShowChat(false);
    navigate('/');
  };

  if (!activeConversationId) {
    return (
      <div className={styles.emptyState}>
        <span>{t('chat.selectConversation')}</span>
      </div>
    );
  }

  const conversation = conversations.find(c => c.id === activeConversationId);

  const conversationName = conversation
    ? getConversationName(conversation, user?.id ?? '', t)
    : t('chat.chat');

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
          {conversation?.type === 'group' && (
            <span className={styles.headerSubtitle}>
              {t('chat.membersCount', { count: String(conversation.participants.length) })}
            </span>
          )}
        </div>
        <div className={styles.headerAvatar}>
          <span className={styles.avatarInitial}>
            {conversationName.charAt(0).toUpperCase()}
          </span>
        </div>
      </header>

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
      try {
        await apiFetch(`/api/conversations/${conversationId}/accept`, { method: 'POST' });
        dispatch({ type: 'INVITATION_ACCEPTED', conversationId, userId: currentUserId });
        await refreshConversations();
      } catch { /* ignore */ }
      setLoading(false);
    };
    const handleDecline = async () => {
      setLoading(true);
      try {
        await apiFetch(`/api/conversations/${conversationId}/decline`, { method: 'POST' });
        dispatch({ type: 'INVITATION_DECLINED', conversationId, userId: currentUserId });
        await refreshConversations();
      } catch { /* ignore */ }
      setLoading(false);
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
