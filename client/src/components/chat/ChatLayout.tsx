import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
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
  const layoutRef = useRef<HTMLDivElement>(null);

  // Register Web Push subscription on mount (user is authenticated at this point).
  useEffect(() => {
    registerPushSubscription();
  }, []);

  // MOBILE KEYBOARD FIX: use visualViewport to resize the layout when the
  // virtual keyboard opens. On mobile browsers, opening the keyboard shrinks
  // the visual viewport but does NOT shrink CSS viewport units (vh/dvh).
  // This causes content to be pushed behind the keyboard. By listening to
  // visualViewport.resize and setting an explicit pixel height on the layout
  // container, the flex column reflows correctly — the header stays pinned
  // at the top and only the message list shrinks.
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return; // desktop or unsupported browser — CSS dvh is fine

    const onResize = () => {
      if (layoutRef.current) {
        layoutRef.current.style.height = `${vv.height}px`;
      }
    };

    // Set initial height
    onResize();

    vv.addEventListener('resize', onResize);
    return () => vv.removeEventListener('resize', onResize);
  }, []);

  return (
    <ChatLayoutContext.Provider value={{ showChat, setShowChat }}>
      <>
        <NotificationBanner />
        <div ref={layoutRef} className={styles.layout}>
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
