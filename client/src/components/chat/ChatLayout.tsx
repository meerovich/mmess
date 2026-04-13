import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useChat } from '../../contexts/ChatContext';
import { ConversationList } from './ConversationList';
import { ChatPane } from './ChatPane';
import { NotificationBanner } from './NotificationBanner';
import { registerPushSubscription } from '../../lib/pushSubscription';
import { useTranslation } from '../../lib/i18n';
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
  const { t } = useTranslation();
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem('mmess-sidebar-width');
    return saved ? parseInt(saved, 10) : 340;
  });
  const isDragging = useRef(false);

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
      // Immediately zero unread count in the sidebar — the user is looking at
      // this conversation now. The server-side read:mark is handled separately
      // by the IntersectionObserver in MessageList (500ms debounce).
      dispatch({ type: 'MARK_READ', conversationId: urlConversationId, messageId: '' });
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
  // Only show reload banner if client version is below server's minClientVersion.
  // This avoids false positives when only the server was patched without breaking the client.
  const [newVersionAvailable, setNewVersionAvailable] = useState(false);
  useEffect(() => {
    const versionLt = (a: string, b: string): boolean => {
      const pa = a.split('.').map(Number);
      const pb = b.split('.').map(Number);
      for (let i = 0; i < 3; i++) {
        if ((pa[i] ?? 0) < (pb[i] ?? 0)) return true;
        if ((pa[i] ?? 0) > (pb[i] ?? 0)) return false;
      }
      return false;
    };
    const checkVersion = async () => {
      try {
        const res = await fetch('/api/health');
        if (!res.ok) return;
        const data = await res.json() as { version?: string; minClientVersion?: string };
        const minVer = data.minClientVersion;
        if (minVer && __APP_VERSION__ !== 'dev' && versionLt(__APP_VERSION__, minVer)) {
          setNewVersionAvailable(true);
        }
      } catch { /* silent */ }
    };
    checkVersion();
    const interval = setInterval(checkVersion, 60_000);
    return () => clearInterval(interval);
  }, []);

  // MOBILE KEYBOARD FIX (Telegram approach):
  // iOS Safari doesn't resize the layout viewport when the keyboard opens.
  // Instead it scrolls the page up, pushing fixed elements off-screen.
  // Fix: set --vh CSS variable from visualViewport.height and use
  // transform: translateY to counteract the viewport offset.
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    // Capture initial viewport height (before keyboard opens).
    // Used to detect keyboard: if vv.height shrinks significantly, keyboard is open.
    const initialHeight = vv.height;

    const setVH = () => {
      document.documentElement.style.setProperty('--vh', `${vv.height * 0.01}px`);

      if (layoutRef.current) {
        layoutRef.current.style.height = `${vv.height}px`;
        // Only apply transform when offset > 0 (keyboard open).
        // translateY(0) creates a CSS stacking context that breaks position:fixed
        // for overlays (context menu, forward modal, etc.)
        layoutRef.current.style.transform = vv.offsetTop > 0
          ? `translateY(${vv.offsetTop}px)`
          : '';

        const keyboardOpen = vv.height < initialHeight * 0.85;
        layoutRef.current.style.paddingBottom = keyboardOpen ? '0' : '';
      }

      // Force window back to top
      if (window.scrollY !== 0) {
        window.scrollTo(0, 0);
      }
    };

    // Set initial
    setVH();

    vv.addEventListener('resize', setVH);
    vv.addEventListener('scroll', setVH);

    return () => {
      vv.removeEventListener('resize', setVH);
      vv.removeEventListener('scroll', setVH);
    };
  }, []);

  return (
    <ChatLayoutContext.Provider value={{ showChat, setShowChat }}>
      <>
        <NotificationBanner />
        {newVersionAvailable && (
          <div className={styles.versionBanner} onClick={() => window.location.reload()}>
            {t('update.available')}
          </div>
        )}
        <div ref={layoutRef} className={styles.layout}>
          <div
            className={`${styles.sidebar} ${showChat ? styles.hidden : ''}`}
            style={window.innerWidth >= 768 ? { width: sidebarWidth } : undefined}
          >
            <ConversationList />
          </div>
          <div
            className={styles.resizeHandle}
            onMouseDown={(e) => {
              e.preventDefault();
              isDragging.current = true;
              const startX = e.clientX;
              const startWidth = sidebarWidth;

              const onMouseMove = (ev: MouseEvent) => {
                if (!isDragging.current) return;
                const newWidth = Math.max(250, Math.min(600, startWidth + ev.clientX - startX));
                setSidebarWidth(newWidth);
              };

              const onMouseUp = () => {
                isDragging.current = false;
                localStorage.setItem('mmess-sidebar-width', String(sidebarWidth));
                document.removeEventListener('mousemove', onMouseMove);
                document.removeEventListener('mouseup', onMouseUp);
              };

              document.addEventListener('mousemove', onMouseMove);
              document.addEventListener('mouseup', onMouseUp);
            }}
          />
          <div className={`${styles.pane} ${!showChat ? styles.hidden : ''}`}>
            <ChatPane />
          </div>
        </div>
      </>
    </ChatLayoutContext.Provider>
  );
}
