import { useState } from 'react';
import { useChat } from '../../contexts/ChatContext';
import { ConversationItem } from './ConversationItem';
import { NewChatModal } from './NewChatModal';
import { NewGroupModal } from './NewGroupModal';
import styles from './ConversationList.module.css';

export function ConversationList() {
  const { state } = useChat();
  const [showNewChat, setShowNewChat] = useState(false);
  const [showNewGroup, setShowNewGroup] = useState(false);

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>mmess</h1>
        <div className={styles.actions}>
          <button
            className={styles.actionButton}
            onClick={() => setShowNewChat(true)}
            aria-label="New chat"
          >
            New chat
          </button>
          <button
            className={styles.actionButton}
            onClick={() => setShowNewGroup(true)}
            aria-label="New group"
          >
            New group
          </button>
        </div>
      </div>

      <div className={styles.list}>
        {state.conversations.length === 0 ? (
          <div className={styles.emptyState}>
            <p className={styles.emptyTitle}>No conversations yet</p>
            <p className={styles.emptySubtitle}>Start a chat with a friend to get started.</p>
          </div>
        ) : (
          state.conversations.map(conv => (
            <ConversationItem key={conv.id} conversation={conv} />
          ))
        )}
      </div>

      {showNewChat && <NewChatModal onClose={() => setShowNewChat(false)} />}
      {showNewGroup && <NewGroupModal onClose={() => setShowNewGroup(false)} />}
    </div>
  );
}
