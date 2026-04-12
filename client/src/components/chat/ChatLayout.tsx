import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useChat } from '../../contexts/ChatContext';
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
  const { conversationId: urlConversationId } = useParams<{ conversationId?: string }>();
  const { dispatch } = useChat();
  const [showChat, setShowChat] = useState(false);
  const layoutRef = useRef<HTMLDivElement>(null);

  // Sync URL param → ChatContext activeConversationId.
  // This is how push notification clicks (/chat/:id) and deep links work:
  // the URL drives the active conversation, not just sidebar clicks.
  // When URL is / (no conversationId), reset to sidebar view — this is what
  // makes browser swipe-back gesture work: history.back() goes to /,
  // urlConversationId becomes undefined, showChat resets to false.
  useEffect(() => {
    if (urlConversationId) {
      dispatch({ type: 'SET_ACTIVE_CONVERSATION', conversationId: urlConversationId });
      setShowChat(true);
      // Close any push notifications for this conversation — user is reading it now.
      if ('serviceWorker' in navigator && navigator.serviceWorker.ready) {
        navigator.serviceWorker.ready.then(reg => {
          reg.getNotifications({ tag: urlConversationId }).then(notifications => {
            notifications.forEach(n => n.close());
          });
        });
      }
    } else {
      dispatch({ type: 'SET_ACTIVE_CONVERSATION', conversationId: null });
      setShowChat(false);
    }
  }, [urlConversationId, dispatch]);

  // Register Web Push subscription on mount (user is authenticated at this point).
  useEffect(() => {
    registerPushSubscription();
  }, []);

  // VERSION CHECK: periodically poll /api/health to detect server version upgrades.
  // If server version differs from the built-in client version, show a reload banner.
  const [newVersionAvailable, setNewVersionAvailable] = useState(false);
  useEffect(() => {
    const checkVersion = async () => {
      try {
        const res = await fetch('/api/health');
        if (!res.ok) return;
        const data = await res.json() as { version?: string };
        if (data.version && data.version !== __APP_VERSION__) {
          setNewVersionAvailable(true);
        }
      } catch { /* silent */ }
    };
    // Check on mount + every 60 seconds
    checkVersion();
    const interval = setInterval(checkVersion, 60_000);
    return () => clearInterval(interval);
  }, []);

  // MOBILE KEYBOARD FIX: use visualViewport to resize layout when virtual
  // keyboard opens. CSS dvh doesn't update when the keyboard appears on many
  // mobile browsers. We set a CSS custom property --vh that the layout uses.
  // No position:fixed needed — just an accurate height.
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    const onResize = () => {
      if (layoutRef.current) {
        // vv.height = distance from top of visible area to top of keyboard.
        // vv.offsetTop = how much iOS Safari pushed the viewport down (scroll
        // compensation when the focused input is near the bottom). We subtract
        // offsetTop so the layout height exactly fills the visible area between
        // the top of the screen and the top of the keyboard — no gap.
        const h = vv.height - (vv.offsetTop ?? 0);
        layoutRef.current.style.height = `${h}px`;
      }
      // Prevent iOS Safari from scrolling the page up when focusing input.
      window.scrollTo(0, 0);
    };

    vv.addEventListener('resize', onResize);
    vv.addEventListener('scroll', onResize);
    return () => {
      vv.removeEventListener('resize', onResize);
      vv.removeEventListener('scroll', onResize);
    };
  }, []);

  return (
    <ChatLayoutContext.Provider value={{ showChat, setShowChat }}>
      <>
        <NotificationBanner />
        {newVersionAvailable && (
          <div className={styles.versionBanner} onClick={() => window.location.reload()}>
            Доступно обновление — нажмите для перезагрузки
          </div>
        )}
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
