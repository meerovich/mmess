import React, { createContext, useContext, useEffect, useState } from 'react';
import { ConversationList } from './ConversationList';
import { ChatPane } from './ChatPane';
import { NotificationBanner } from './NotificationBanner';
import { registerPushSubscription } from '../../lib/pushSubscription';
import styles from './ChatLayout.module.css';

interface ChatLayoutContextValue {
  showChat: boolean;
  setShowChat: (show: boolean) => void;
}

const ChatLayoutContext = createContext<ChatLayoutContextValue | null>(null);

export function useChatLayout(): ChatLayoutContextValue {
  const ctx = useContext(ChatLayoutContext);
  if (!ctx) throw new Error('useChatLayout must be used within ChatLayout');
  return ctx;
}

export function ChatLayout() {
  const [showChat, setShowChat] = useState(false);

  // Register Web Push subscription on mount (user is authenticated at this point).
  // Idempotent — skips if already subscribed or if push is not supported.
  useEffect(() => {
    registerPushSubscription();
  }, []);

  return (
    <ChatLayoutContext.Provider value={{ showChat, setShowChat }}>
      <>
        <NotificationBanner />
        <div className={styles.layout}>
          <div className={`${styles.sidebar} ${showChat ? styles.hidden : ''}`}>
            <ConversationList />
          </div>
          <div className={`${styles.pane} ${!showChat ? styles.hidden : ''}`}>
            <ChatPane />
          </div>
        </div>
      </>
    </ChatLayoutContext.Provider>
  );
}
