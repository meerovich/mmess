import React, { useState } from 'react';
import { useChat } from '../../contexts/ChatContext';
import { MessageList } from './MessageList';
import { MessageInput } from './MessageInput';
import { TypingIndicator } from './TypingIndicator';
import styles from './ChatPane.module.css';
import type { Conversation, Message } from '../../types/chat';

interface ChatPaneProps {
  onBack?: () => void;
}

function getConversationName(conversation: Conversation, currentUserId: string): string {
  if (conversation.type === 'group') {
    return conversation.name ?? 'Group chat';
  }
  // DM: show the other participant's username
  const other = conversation.participants.find(p => p.user_id !== currentUserId);
  return other?.username ?? conversation.name ?? 'Chat';
}

export function ChatPane({ onBack }: ChatPaneProps) {
  const { state } = useChat();
  const { activeConversationId, conversations, wsStatus } = state;
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [editMessage, setEditMessage] = useState<Message | null>(null);

  if (!activeConversationId) {
    return (
      <div className={styles.emptyState}>
        <span>Select a conversation</span>
      </div>
    );
  }

  const conversation = conversations.find(c => c.id === activeConversationId);

  // Find current user — derive from participants
  // Since we don't have an easy way without useAuth here, use auth from participant list
  // We'll pass the handlers through context or props — use simple prop drilling via MessageList
  const conversationName = conversation
    ? getConversationName(conversation, '')
    : 'Chat';

  return (
    <div className={styles.pane}>
      {wsStatus === 'reconnecting' && (
        <div className={styles.reconnectingBanner}>
          Reconnecting…
        </div>
      )}

      <header className={styles.header}>
        {onBack && (
          <button className={styles.backButton} onClick={onBack} aria-label="Back to conversations">
            ← Back
          </button>
        )}
        <div className={styles.headerAvatar}>
          <span className={styles.avatarInitial}>
            {conversationName.charAt(0).toUpperCase()}
          </span>
        </div>
        <div className={styles.headerInfo}>
          <span className={styles.headerName}>{conversationName}</span>
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
    </div>
  );
}
