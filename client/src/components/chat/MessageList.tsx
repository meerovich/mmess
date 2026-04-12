import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useChat } from '../../contexts/ChatContext';
import { useAuth } from '../../contexts/AuthContext';
import { useSendMessage } from '../../providers/WebSocketProvider';
import { apiFetch } from '../../lib/api';
import { MessageItem } from './MessageItem';
import styles from './MessageList.module.css';
import type { Message } from '../../types/chat';

interface MessageListProps {
  conversationId: string;
  onReply?: (message: Message) => void;
  onEdit?: (message: Message) => void;
}

export function MessageList({ conversationId, onReply, onEdit }: MessageListProps) {
  const { state, dispatch, messagePagination } = useChat();
  const { user } = useAuth();
  const sendWs = useSendMessage();
  const listRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const lastMessageRef = useRef<HTMLDivElement>(null);
  const unreadDividerRef = useRef<HTMLDivElement>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const didInitialLoadRef = useRef<string | null>(null);
  // Track the last_read_message_id at the moment the conversation was opened,
  // so the "unread" divider stays stable while new messages come in.
  const [openReadCursor, setOpenReadCursor] = useState<string | null>(null);
  const [showDivider, setShowDivider] = useState(true);

  const messages: Message[] = state.messages[conversationId] ?? [];
  const pagination = messagePagination[conversationId];

  // We track "is the user currently at the bottom of the list" via a ref that
  // is updated on every scroll event. Reading the value AFTER React has
  // already inserted the new message gives a false-negative (the inserted
  // message extends scrollHeight, so the pre-insert "at bottom" user is no
  // longer < 100px from bottom). The ref stores the LAST observed state and
  // is the source of truth used by the new-message effect.
  const isAtBottomRef = useRef(true);

  const scrollToBottom = useCallback(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, []);

  const handleScroll = useCallback(() => {
    if (!listRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = listRef.current;
    // 150px threshold — slightly generous so the auto-scroll is forgiving
    // of users who nudged the list a few pixels.
    isAtBottomRef.current = scrollHeight - scrollTop - clientHeight < 150;
  }, []);

  // Register scroll listener so isAtBottomRef stays fresh.
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => el.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  // MOBILE KEYBOARD FIX: when the virtual keyboard opens, the visual viewport
  // shrinks. If the user was at the bottom, scroll down so the last messages
  // remain visible above the keyboard instead of being covered.
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    let prevHeight = vv.height;

    const onResize = () => {
      const newHeight = vv.height;
      // Keyboard opened (viewport shrank) while user was at bottom → scroll down
      if (newHeight < prevHeight && isAtBottomRef.current) {
        requestAnimationFrame(() => scrollToBottom());
      }
      prevHeight = newHeight;
    };

    vv.addEventListener('resize', onResize);
    return () => vv.removeEventListener('resize', onResize);
  }, [scrollToBottom]);

  // Reset initial-load guard on WS reconnect so that navigating to any
  // conversation after a reconnect triggers a fresh fetch — otherwise the
  // guard prevents re-fetching and the user sees stale messages from before
  // the connection was lost (screen lock, network change, etc.).
  const prevWsStatusRef = useRef(state.wsStatus);
  useEffect(() => {
    if (prevWsStatusRef.current === 'reconnecting' && state.wsStatus === 'connected') {
      didInitialLoadRef.current = null; // force re-fetch on next render
    }
    prevWsStatusRef.current = state.wsStatus;
  }, [state.wsStatus]);

  // Capture the current user's last_read_message_id when opening a conversation.
  // This determines where the "unread messages" divider is placed.
  useEffect(() => {
    const conv = state.conversations.find(c => c.id === conversationId);
    const me = conv?.participants.find(p => p.user_id === user?.id);
    setOpenReadCursor(me?.last_read_message_id ?? null);
    setShowDivider(true);
  }, [conversationId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Initial load when conversationId changes
  useEffect(() => {
    if (!conversationId) return;
    if (didInitialLoadRef.current === conversationId) return;
    didInitialLoadRef.current = conversationId;

    apiFetch(`/api/conversations/${conversationId}/messages?limit=50`)
      .then(res => res.ok ? res.json() : { messages: [], hasMore: false, nextCursor: null })
      .then((data: { messages: Message[]; hasMore: boolean; nextCursor: string | null }) => {
        dispatch({
          type: 'SET_MESSAGES',
          conversationId,
          messages: data.messages ?? [],
          hasMore: data.hasMore ?? false,
          nextCursor: data.nextCursor ?? null,
        });
        // After load: if there's an unread divider, scroll to it.
        // Otherwise scroll to bottom.
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            if (unreadDividerRef.current) {
              unreadDividerRef.current.scrollIntoView({ block: 'center' });
              isAtBottomRef.current = false;
            } else {
              scrollToBottom();
              isAtBottomRef.current = true;
            }
          });
        });
      })
      .catch(() => {
        dispatch({
          type: 'SET_MESSAGES',
          conversationId,
          messages: [],
          hasMore: false,
          nextCursor: null,
        });
      });
  }, [conversationId, dispatch, scrollToBottom]);

  // Auto-scroll on new messages if the user was already at the bottom. We
  // read `isAtBottomRef.current` which reflects state from the LAST scroll
  // event — before React inserted the new message and invalidated the
  // "distance from bottom" calculation. Also reset the ref to true after
  // auto-scrolling so subsequent messages keep following.
  const prevLengthRef = useRef(messages.length);
  useEffect(() => {
    if (messages.length > prevLengthRef.current && isAtBottomRef.current) {
      // Double rAF: first waits for React to commit the new DOM, second
      // runs after layout so scrollHeight reflects the inserted message.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          scrollToBottom();
          isAtBottomRef.current = true;
        });
      });
    }
    prevLengthRef.current = messages.length;
  }, [messages.length, scrollToBottom]);

  // Load more (infinite upward scroll)
  const loadMore = useCallback(async () => {
    if (isLoadingMore) return;
    if (!pagination?.hasMore) return;
    if (!pagination?.nextCursor) return;

    setIsLoadingMore(true);
    const prevScrollHeight = listRef.current?.scrollHeight ?? 0;

    try {
      const res = await apiFetch(
        `/api/conversations/${conversationId}/messages?limit=50&before=${encodeURIComponent(pagination.nextCursor)}`
      );
      if (!res.ok) return;
      const data: { messages: Message[]; hasMore: boolean; nextCursor: string | null } = await res.json();

      dispatch({
        type: 'PREPEND_MESSAGES',
        conversationId,
        messages: data.messages ?? [],
        hasMore: data.hasMore ?? false,
        nextCursor: data.nextCursor ?? null,
      });

      // Restore scroll position using scrollHeight delta
      requestAnimationFrame(() => {
        if (listRef.current) {
          const newScrollHeight = listRef.current.scrollHeight;
          listRef.current.scrollTop += newScrollHeight - prevScrollHeight;
        }
      });
    } finally {
      setIsLoadingMore(false);
    }
  }, [isLoadingMore, pagination, conversationId, dispatch]);

  // IntersectionObserver on sentinel (top of list)
  useEffect(() => {
    if (!sentinelRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && pagination?.hasMore && !isLoadingMore) {
          loadMore();
        }
      },
      { threshold: 0.1 }
    );

    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [pagination?.hasMore, isLoadingMore, loadMore]);

  // IntersectionObserver on last message for read receipt (Pattern 10, debounce 500ms)
  useEffect(() => {
    if (!lastMessageRef.current) return;
    const lastMessage = messages[messages.length - 1];
    if (!lastMessage) return;

    let debounceTimer: ReturnType<typeof setTimeout>;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          debounceTimer = setTimeout(() => {
            sendWs({
              type: 'read:mark',
              payload: {
                conversation_id: conversationId,
                message_id: lastMessage.id,
              },
            });
            // Immediately update local state so the unread divider won't
            // reappear when re-entering this conversation.
            dispatch({
              type: 'MARK_READ',
              conversationId,
              messageId: lastMessage.id,
            });
            if (user?.id) {
              dispatch({
                type: 'UPDATE_PARTICIPANT_READ',
                conversationId,
                userId: user.id,
                lastReadAt: new Date().toISOString(),
              });
            }
          }, 500);
        } else {
          clearTimeout(debounceTimer);
        }
      },
      { threshold: 0.5 }
    );

    observer.observe(lastMessageRef.current);
    return () => {
      observer.disconnect();
      clearTimeout(debounceTimer);
    };
  }, [messages, conversationId, sendWs]);

  // Find the index of the first unread message for the divider.
  // "Unread" = any message AFTER the openReadCursor (by position in the sorted array).
  // The divider is placed BEFORE the first unread message.
  const firstUnreadIdx = (() => {
    if (!openReadCursor || !showDivider) return -1;
    const cursorIdx = messages.findIndex(m => m.id === openReadCursor);
    if (cursorIdx === -1) return -1; // cursor not in loaded messages
    if (cursorIdx >= messages.length - 1) return -1; // everything is read
    return cursorIdx + 1;
  })();

  // Hide the divider 3 seconds after it's been rendered (user has "seen" the unread section).
  useEffect(() => {
    if (firstUnreadIdx < 0 || !showDivider) return;
    const timer = setTimeout(() => setShowDivider(false), 3000);
    return () => clearTimeout(timer);
  }, [firstUnreadIdx, showDivider]);

  // Group messages: consecutive same sender within 5 minutes
  const groupedMessages = messages.map((msg, idx) => {
    if (idx === 0) return { msg, isGrouped: false };
    const prev = messages[idx - 1];
    const sameUser = prev.sender_id === msg.sender_id;
    const within5Min =
      new Date(msg.created_at).getTime() - new Date(prev.created_at).getTime() < 5 * 60 * 1000;
    return { msg, isGrouped: sameUser && within5Min };
  });

  return (
    <div ref={listRef} className={styles.list}>
      <div ref={sentinelRef} className={styles.sentinel} />
      {isLoadingMore && <div className={styles.loadingMore}>Loading older messages…</div>}
      {groupedMessages.map(({ msg, isGrouped }, idx) => (
        <React.Fragment key={msg.id}>
          {idx === firstUnreadIdx && (
            <div ref={unreadDividerRef} className={styles.unreadDivider}>
              <span className={styles.unreadDividerText}>Unread messages</span>
            </div>
          )}
          <div
            ref={idx === groupedMessages.length - 1 ? lastMessageRef : undefined}
          >
            <MessageItem
              message={msg}
              isGrouped={isGrouped}
              onReply={onReply}
              onEdit={onEdit}
            />
          </div>
        </React.Fragment>
      ))}
    </div>
  );
}
