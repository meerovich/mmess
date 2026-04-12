import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useChat } from '../../contexts/ChatContext';
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
  const sendWs = useSendMessage();
  const listRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const lastMessageRef = useRef<HTMLDivElement>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const didInitialLoadRef = useRef<string | null>(null);

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
        // Scroll to bottom after initial load and mark the user as being at
        // the bottom so subsequent incoming messages auto-follow.
        isAtBottomRef.current = true;
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            scrollToBottom();
            isAtBottomRef.current = true;
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
        <div
          key={msg.id}
          ref={idx === groupedMessages.length - 1 ? lastMessageRef : undefined}
        >
          <MessageItem
            message={msg}
            isGrouped={isGrouped}
            onReply={onReply}
            onEdit={onEdit}
          />
        </div>
      ))}
    </div>
  );
}
