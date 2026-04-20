import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useNavigationType, useParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useChat } from '../../contexts/ChatContext';
import { ConversationList } from './ConversationList';
import { ChatPane } from './ChatPane';
import { NotificationBanner } from './NotificationBanner';
import { ensureE2eeIdentity } from '../../lib/e2ee';
import { registerPushSubscription } from '../../lib/pushSubscription';
import { useTranslation } from '../../lib/i18n';
import {
  clearNotificationTarget,
  parseNotificationTargetUrl,
  readNotificationTarget,
  readServiceWorkerNotificationTarget,
  writeNotificationTarget,
  type NotificationTarget,
} from '../../lib/notificationTarget';
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
  const location = useLocation();
  const navigate = useNavigate();
  const navigationType = useNavigationType();
  const { state, dispatch } = useChat();
  const { user } = useAuth();
  const [showChat, setShowChat] = useState(false);
  const layoutRef = useRef<HTMLDivElement>(null);
  const previousPathRef = useRef(location.pathname);
  const staleChatPopGuardRef = useRef(false);
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
    const isMobileViewport = window.matchMedia?.('(max-width: 767px)').matches ?? window.innerWidth < 768;
    const urlNotificationTarget = parseNotificationTargetUrl(window.location.href);
    const storedNotificationTarget = readNotificationTarget();
    const locationState = location.state as { mmessFromNotification?: boolean } | null;
    const isNotificationDrivenChat =
      Boolean(urlConversationId) &&
      (
        urlNotificationTarget?.conversationId === urlConversationId ||
        storedNotificationTarget?.conversationId === urlConversationId ||
        locationState?.mmessFromNotification === true
      );
    const isStaleChatPop =
      isMobileViewport &&
      Boolean(urlConversationId) &&
      !isNotificationDrivenChat &&
      navigationType === 'POP' &&
      previousPathRef.current === '/' &&
      staleChatPopGuardRef.current;

    if (isStaleChatPop) {
      dispatch({ type: 'SET_ACTIVE_CONVERSATION', conversationId: null });
      setShowChat(false);
      navigate('/', { replace: true });
      return;
    }

    if (urlConversationId) {
      if (isNotificationDrivenChat) {
        staleChatPopGuardRef.current = false;
      }
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
  }, [urlConversationId, dispatch, navigate, navigationType, location.state]);

  // Register Web Push subscription on mount (user is authenticated at this point).
  useEffect(() => {
    registerPushSubscription();
  }, []);

  // Publish the user's E2EE public key early so other participants can share
  // conversation keys before the first encrypted message reaches this device.
  useEffect(() => {
    if (!user?.id) return;
    void ensureE2eeIdentity();
  }, [user?.id]);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    const handleBotNavigation = (event: MessageEvent) => {
      const payload = event.data as {
        type?: string;
        url?: string;
        conversationId?: string;
        messageId?: string;
        replace?: boolean;
      } | null;
      if (payload?.type !== 'mmess:notification-open' || !payload.url) return;

      const parsedTarget = parseNotificationTargetUrl(payload.url) ?? {
        path: payload.url.startsWith('http')
          ? `${new URL(payload.url).pathname}${new URL(payload.url).search}${new URL(payload.url).hash}`
          : payload.url,
        conversationId: payload.conversationId,
        messageId: payload.messageId,
        replace: payload.replace ?? true,
      };
      writeNotificationTarget({
        ...parsedTarget,
        conversationId: payload.conversationId ?? parsedTarget.conversationId,
        messageId: payload.messageId ?? parsedTarget.messageId,
        replace: payload.replace ?? parsedTarget.replace ?? true,
      });
      const currentPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      if (currentPath !== parsedTarget.path) {
        window.location.replace(parsedTarget.path);
        return;
      }
      navigate(parsedTarget.path, { replace: payload.replace ?? parsedTarget.replace ?? true });
    };

    navigator.serviceWorker.addEventListener('message', handleBotNavigation);
    return () => navigator.serviceWorker.removeEventListener('message', handleBotNavigation);
  }, [navigate]);

  useEffect(() => {
    const urlNotificationTarget = parseNotificationTargetUrl(window.location.href);
    if (urlNotificationTarget?.conversationId || urlNotificationTarget?.messageId) {
      writeNotificationTarget(urlNotificationTarget);
      window.history.replaceState(window.history.state, '', urlNotificationTarget.path);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    const routeTarget = (target: NotificationTarget | null) => {
      if (!target?.path) return;

      const currentPath = `${location.pathname}${location.search}${location.hash}`;
      if (currentPath !== target.path) {
        navigate(target.path, {
          replace: target.replace ?? true,
          state: { mmessFromNotification: true },
        });
        return;
      }

      if (!target.messageId) {
        clearNotificationTarget();
      }
    };

    const syncPendingNotificationTarget = async () => {
      const target = readNotificationTarget() ?? await readServiceWorkerNotificationTarget();
      if (cancelled) return;
      routeTarget(target);
    };

    void syncPendingNotificationTarget();

    const handleFocus = () => void syncPendingNotificationTarget();
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') void syncPendingNotificationTarget();
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      cancelled = true;
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [
    location.hash,
    location.pathname,
    location.search,
    navigate,
    state.conversations.length,
    state.wsStatus,
  ]);

  useEffect(() => {
    const previousPath = previousPathRef.current;
    const isReturningToListViaNativeBack =
      location.pathname === '/' &&
      previousPath.startsWith('/chat/') &&
      navigationType === 'POP';

    if (isReturningToListViaNativeBack) {
      staleChatPopGuardRef.current = true;
      previousPathRef.current = location.pathname;
      return;
    }

    if (location.pathname.startsWith('/chat/') && navigationType !== 'POP') {
      staleChatPopGuardRef.current = false;
    }

    previousPathRef.current = location.pathname;
  }, [location.pathname, navigationType]);

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

    let rafId: number | null = null;

    const setVH = () => {
      rafId = null;
      document.documentElement.style.setProperty('--vh', `${vv.height * 0.01}px`);
      const keyboardOpen = vv.height < initialHeight * 0.85;

      if (layoutRef.current) {
        layoutRef.current.style.height = `${vv.height}px`;
        // Only apply transform when offset > 0 (keyboard open).
        // translateY(0) creates a CSS stacking context that breaks position:fixed
        // for overlays (context menu, forward modal, etc.)
        layoutRef.current.style.transform = keyboardOpen && vv.offsetTop > 0
          ? `translateY(${vv.offsetTop}px)`
          : '';

        layoutRef.current.style.paddingBottom = keyboardOpen ? '0' : '';
      }

      // Only correct window scroll while the keyboard is actively pushing the
      // visual viewport. Running this on every viewport event causes visible
      // "rubber-band" jerk on iOS during normal gestures.
      if (keyboardOpen && window.scrollY !== 0) {
        window.scrollTo(0, 0);
      }
    };

    const scheduleSetVH = () => {
      if (rafId !== null) return;
      rafId = window.requestAnimationFrame(setVH);
    };

    // Set initial
    setVH();

    vv.addEventListener('resize', scheduleSetVH);
    vv.addEventListener('scroll', scheduleSetVH);

    return () => {
      vv.removeEventListener('resize', scheduleSetVH);
      vv.removeEventListener('scroll', scheduleSetVH);
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
      }
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
