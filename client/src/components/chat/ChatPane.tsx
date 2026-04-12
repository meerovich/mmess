import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useChat } from '../../contexts/ChatContext';
import { useAuth } from '../../contexts/AuthContext';
import { useChatLayout } from './ChatLayout';
import { MessageList } from './MessageList';
import { MessageInput } from './MessageInput';
import { TypingIndicator } from './TypingIndicator';
import { GroupSettingsModal } from './GroupSettingsModal';
import styles from './ChatPane.module.css';
import type { Conversation, Message } from '../../types/chat';

function getConversationName(conversation: Conversation, currentUserId: string): string {
  if (conversation.type === 'group') {
    return conversation.name ?? 'Group chat';
  }
  // DM: show the other participant's username
  const other = conversation.participants.find(p => p.user_id !== currentUserId);
  return other?.username ?? conversation.name ?? 'Chat';
}

export function ChatPane() {
  const { state, dispatch } = useChat();
  const { activeConversationId, conversations, wsStatus } = state;
  const { user } = useAuth();
  const { setShowChat } = useChatLayout();
  const navigate = useNavigate();
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
        <span>Select a conversation</span>
      </div>
    );
  }

  const conversation = conversations.find(c => c.id === activeConversationId);

  const conversationName = conversation
    ? getConversationName(conversation, user?.id ?? '')
    : 'Chat';

  return (
    <div className={styles.pane}>
      {wsStatus === 'reconnecting' && (
        <div className={styles.reconnectingBanner}>
          Reconnecting…
        </div>
      )}

      <header className={styles.header}>
        <button
          className={styles.backButton}
          onClick={handleBack}
          aria-label="Back to conversations"
        >
          ← Back
        </button>
        <div className={styles.headerAvatar}>
          <span className={styles.avatarInitial}>
            {conversationName.charAt(0).toUpperCase()}
          </span>
        </div>
        <div
          className={`${styles.headerInfo} ${conversation?.type === 'group' ? styles.headerInfoClickable : ''}`}
          onClick={() => conversation?.type === 'group' && setShowSettings(true)}
          role={conversation?.type === 'group' ? 'button' : undefined}
          tabIndex={conversation?.type === 'group' ? 0 : undefined}
          onKeyDown={e => conversation?.type === 'group' && e.key === 'Enter' && setShowSettings(true)}
          aria-label={conversation?.type === 'group' ? `Open ${conversationName} settings` : undefined}
        >
          <span className={styles.headerName}>{conversationName}</span>
          {conversation?.type === 'group' && (
            <span className={styles.headerSubtitle}>
              {conversation.participants.length} members
            </span>
          )}
        </div>
      </header>

      <MessageList
        conversationId={activeConversationId}
        onReply={setReplyTo}
        onEdit={setEditMessage}
      />
      <TypingIndicator conversationId={activeConversationId} />
      <MessageInput
        conversationId={activeConversationId}
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
