import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';

import { format } from 'date-fns';
import { marked } from 'marked';
import { getAvatarPalette } from '../../lib/avatarColor';
import { replaceTextEmoticons } from '../../lib/chatText';
import { useAuth } from '../../contexts/AuthContext';
import { useChat } from '../../contexts/ChatContext';
import { useTranslation } from '../../lib/i18n';
import { useSendMessage } from '../../providers/WebSocketProvider';
import { ReplyPreview } from './ReplyPreview';
import { ReactionBar, AddReactionButton, LONG_PRESS_REACTION_EMOJIS } from './ReactionBar';
import { FileCard } from './FileCard';
import { Lightbox } from './Lightbox';
import { ForwardModal } from './ForwardModal';
import { Avatar } from '../common/Avatar';
import styles from './MessageItem.module.css';
import type { Message, Participant } from '../../types/chat';

// Configure marked for chat messages: no paragraph wrapping for single lines,
// breaks on newlines (GFM), sanitize by not allowing raw HTML.
marked.setOptions({ breaks: true, gfm: true });

/** Render markdown to HTML string, stripping outer <p> for single-line messages. */
function renderMarkdown(text: string, participantNames?: string[]): string {
  const html = marked.parse(replaceTextEmoticons(text), { async: false }) as string;
  // Strip wrapping <p>...</p> if the entire output is a single paragraph
  const trimmed = html.trim();
  let result = trimmed;
  if (result.startsWith('<p>') && result.endsWith('</p>') && result.indexOf('<p>', 1) === -1) {
    result = result.slice(3, -4);
  }
  // Highlight @mentions — match full participant names (may contain spaces)
  if (participantNames && participantNames.length > 0) {
    // Sort by length descending so longer names match first
    const sorted = [...participantNames].sort((a, b) => b.length - a.length);
    for (const name of sorted) {
      const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      result = result.replace(
        new RegExp(`@${escaped}`, 'gi'),
        `<span class="mmess-mention">@${name}</span>`
      );
    }
  } else {
    // Fallback: simple word match
    result = result.replace(/@(\w+)/g, '<span class="mmess-mention">@$1</span>');
  }
  return result;
}

function getSafeAreaInsetTop(): number {
  if (typeof document === 'undefined') return 0;

  const probe = document.createElement('div');
  probe.style.position = 'fixed';
  probe.style.top = '0';
  probe.style.left = '0';
  probe.style.paddingTop = 'env(safe-area-inset-top)';
  probe.style.visibility = 'hidden';
  probe.style.pointerEvents = 'none';
  document.body.appendChild(probe);
  const inset = Number.parseFloat(window.getComputedStyle(probe).paddingTop || '0');
  probe.remove();
  return Number.isFinite(inset) ? inset : 0;
}

interface MessageItemProps {
  message: Message;
  isGrouped?: boolean;
  onReply?: (message: Message) => void;
  onEdit?: (message: Message) => void;
}

type ReceiptVisualState = 'sending' | 'sent' | 'delivered' | 'read';

function formatReceiptTimestamp(timestamp: string, locale: 'ru' | 'en'): string {
  return format(new Date(timestamp), locale === 'ru' ? 'dd.MM.yyyy HH:mm' : 'MM/dd/yyyy HH:mm');
}

function getReceiptVisualState(
  message: Message,
  currentUserId: string,
  participants: Participant[],
): ReceiptVisualState | null {
  if (message.sender_id !== currentUserId) return null;
  if (message.status === 'sending') return 'sending';

  const otherParticipants = participants.filter(p => p.user_id !== currentUserId);
  const readUserIds = new Set((message.reads ?? []).map(read => read.user_id));
  const deliveredUserIds = new Set([
    ...(message.deliveries ?? []).map(delivery => delivery.user_id),
    ...(message.reads ?? []).map(read => read.user_id),
  ]);
  const isAllRead =
    otherParticipants.length > 0 &&
    otherParticipants.every(p =>
      readUserIds.has(p.user_id) ||
      (p.last_read_at != null && p.last_read_at >= message.created_at)
    );

  if (isAllRead) return 'read';
  if (message.status === 'delivered' || otherParticipants.some(p => deliveredUserIds.has(p.user_id))) return 'delivered';
  return 'sent';
}

function ReadReceipt({
  state,
  onClick,
}: {
  state: ReceiptVisualState | null;
  onClick?: () => void;
}) {
  if (!state) return null;

  const className =
    state === 'read'
      ? `${styles.receipt} ${styles.allRead}`
      : state === 'delivered'
        ? `${styles.receipt} ${styles.delivered}`
        : `${styles.receipt} ${styles.sent}`;
  const symbol = state === 'delivered' || state === 'read' ? '\u2713\u2713' : '\u2713';

  return (
    <button
      type="button"
      className={styles.receiptButton}
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
      aria-label="message receipt details"
    >
      <span className={className}>{symbol}</span>
    </button>
  );
}

export function MessageItem({ message, isGrouped = false, onReply, onEdit }: MessageItemProps) {
  const { user } = useAuth();
  const { state } = useChat();
  const { t, locale } = useTranslation();
  const sendWs = useSendMessage();
  const [showMenu, setShowMenu] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [forwardMessage, setForwardMessage] = useState<Message | null>(null);
  const [showReceiptDetails, setShowReceiptDetails] = useState(false);
  const [receiptViewport, setReceiptViewport] = useState(() => ({
    offsetTop: 0,
    height: typeof window !== 'undefined' ? window.innerHeight : 0,
    keyboardInset: 0,
  }));
  const [swipeX, setSwipeX] = useState(0);
  const touchRef = useRef<{ startX: number; startY: number; swiping: boolean } | null>(null);
  const itemRef = useRef<HTMLDivElement>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const currentUserId = user?.id ?? '';
  const isOwn = message.sender_id === currentUserId;
  const conversation = state.conversations.find(c => c.id === message.conversation_id);
  const receiptVisualState = getReceiptVisualState(message, currentUserId, conversation?.participants ?? []);

  // WhatsApp-style swipe gestures
  const SWIPE_THRESHOLD = 48;

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    touchRef.current = { startX: touch.clientX, startY: touch.clientY, swiping: false };
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!touchRef.current) return;
    const touch = e.touches[0];
    const dx = touch.clientX - touchRef.current.startX;
    const dy = touch.clientY - touchRef.current.startY;

    // If vertical scroll is dominant, don't swipe
    if (!touchRef.current.swiping && Math.abs(dy) > Math.abs(dx)) {
      touchRef.current = null;
      return;
    }

    if (dx > 10) {
      e.preventDefault();
      touchRef.current.swiping = true;
      setSwipeX(Math.min(dx, 100));
      return;
    }

    if (isOwn && receiptVisualState && dx < -10) {
      e.preventDefault();
      touchRef.current.swiping = true;
      setSwipeX(Math.max(dx, -100));
    }
  }, [isOwn, receiptVisualState]);

  const handleTouchEnd = useCallback(() => {
    if (touchRef.current?.swiping && swipeX >= SWIPE_THRESHOLD) {
      onReply?.(message);
    }
    if (touchRef.current?.swiping && swipeX <= -SWIPE_THRESHOLD && isOwn && receiptVisualState) {
      setShowReceiptDetails(true);
    }
    touchRef.current = null;
    setSwipeX(0);
  }, [isOwn, message, onReply, receiptVisualState, swipeX]);

  const senderPalette = getAvatarPalette(message.sender.username);
  const forwardedPalette = message.forwarded_from?.sender?.username
    ? getAvatarPalette(message.forwarded_from.sender.username)
    : null;

  // Presence dot on sender avatar (D-20)
  const senderPresence = state.presenceByUser[message.sender_id];
  const senderOnline = senderPresence?.online ?? false;

  const currentParticipant = conversation?.participants.find(p => p.user_id === currentUserId);
  const otherParticipants = useMemo(
    () => (conversation?.participants ?? []).filter(p => p.user_id !== currentUserId),
    [conversation?.participants, currentUserId]
  );
  const receiptParticipants = useMemo(() => {
    const deliveries = message.deliveries ?? [];
    const reads = message.reads ?? [];
    return otherParticipants.map((participant, index) => {
      const read = reads.find(item => item.user_id === participant.user_id);
      const delivery = deliveries.find(item => item.user_id === participant.user_id);
      const fallbackReadAt =
        participant.last_read_at && participant.last_read_at >= message.created_at
          ? participant.last_read_at
          : null;
      return {
        ...participant,
        delivered_at: delivery?.delivered_at ?? read?.read_at ?? fallbackReadAt ?? (index === 0 ? message.delivered_at ?? null : null),
        read_at: read?.read_at ?? fallbackReadAt,
      };
    });
  }, [message.created_at, message.deliveries, message.reads, otherParticipants]);
  const deliveredParticipants = receiptParticipants.filter(participant => participant.delivered_at);
  const readParticipants = receiptParticipants.filter(participant => participant.read_at);
  const receiptDetailRows = useMemo(() => {
    if (!isOwn) return [];

    const rows: Array<{ label: string; value: string }> = [];
    rows.push({
      label: t('time.sent'),
      value: formatReceiptTimestamp(message.created_at, locale),
    });

    if (conversation?.type === 'group') {
      rows.push({
        label: t('time.delivered'),
        value: `${deliveredParticipants.length}/${receiptParticipants.length}`,
      });
      rows.push({
        label: t('time.readLabel'),
        value: `${readParticipants.length}/${receiptParticipants.length}`,
      });
      receiptParticipants.forEach(participant => {
        const readAt = participant.read_at;
        const deliveredAt = participant.delivered_at;
        rows.push({
          label: participant.username,
          value: readAt
            ? `${t('time.readLabel')} ${formatReceiptTimestamp(readAt, locale)}`
            : deliveredAt
              ? `${t('time.delivered')} ${formatReceiptTimestamp(deliveredAt, locale)}`
              : t('time.pendingReceipt'),
        });
      });
    } else {
      const firstReader = readParticipants[0];
      const firstDelivery = deliveredParticipants[0];
      rows.push({
        label: t('time.delivered'),
        value: firstDelivery?.delivered_at
          ? formatReceiptTimestamp(firstDelivery.delivered_at, locale)
          : t('time.pendingReceipt'),
      });
      rows.push({
        label: t('time.readLabel'),
        value: firstReader?.read_at
          ? formatReceiptTimestamp(firstReader.read_at, locale)
          : t('time.pendingReceipt'),
      });
    }

    return rows;
  }, [conversation?.type, deliveredParticipants, isOwn, locale, message.created_at, readParticipants, receiptParticipants, t]);

  // D-21: edit/delete menu only in group chats with correct permissions
  const canEditDelete =
    conversation?.type === 'group' &&
    isOwn &&
    (currentParticipant?.can_edit_messages ?? false);

  // Edit flow: activates message:edit mode in MessageInput via onEdit callback
  const handleEdit = () => {
    setShowMenu(false);
    onEdit?.(message);
  };

  const handleDeleteConfirm = () => {
    sendWs({
      type: 'message:delete',
      payload: { message_id: message.id, conversation_id: message.conversation_id },
    });
    setShowDeleteConfirm(false);
  };

  const handleReply = () => {
    setShowMenu(false);
    onReply?.(message);
  };

  const handleLongPressReaction = (emoji: string) => {
    sendWs({
      type: 'reaction:add',
      payload: { message_id: message.id, emoji, conversation_id: message.conversation_id },
    });
    closeLongPressMenu();
  };

  // Long-press context menu (WhatsApp-style, mobile)
  const [showLongPressMenu, setShowLongPressMenu] = useState(false);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Menu position: saved when long-press fires
  const [menuTop, setMenuTop] = useState(0);
  const [menuLeft, setMenuLeft] = useState(0);
  const [menuWidth, setMenuWidth] = useState(220);
  const [reactionsTop, setReactionsTop] = useState(0);
  const [reactionsLeft, setReactionsLeft] = useState(0);
  const [reactionsWidth, setReactionsWidth] = useState(316);
  const [bubbleShiftY, setBubbleShiftY] = useState(0);
  const [overlayBubbleRect, setOverlayBubbleRect] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);
  const closeLongPressMenu = useCallback(() => {
    setShowLongPressMenu(false);
    setBubbleShiftY(0);
    setOverlayBubbleRect(null);
    setReactionsTop(0);
    setReactionsLeft(0);
  }, []);

  const handleLongPressStart = useCallback(() => {
    longPressTimerRef.current = setTimeout(() => {
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      if (!bubbleRef.current) return;

      const rect = bubbleRef.current.getBoundingClientRect();
      const viewport = window.visualViewport;
      const viewportTop = viewport?.offsetTop ?? 0;
      const viewportLeft = viewport?.offsetLeft ?? 0;
      const viewportHeight = viewport?.height ?? window.innerHeight;
      const viewportWidth = viewport?.width ?? window.innerWidth;
      const viewportBottom = viewportTop + viewportHeight;
      const viewportRight = viewportLeft + viewportWidth;
      const safeTop = viewportTop + getSafeAreaInsetTop() + 8;
      const inputArea = document.querySelector('[data-chat-input-area="true"]') as HTMLElement | null;
      const inputTop = inputArea?.getBoundingClientRect().top ?? viewportBottom;
      const actionCount = 2 + Number(Boolean(message.content)) + (canEditDelete ? 2 : 0);
      const menuH = actionCount * 52;
      const horizontalMargin = 8;
      const desiredMenuWidth = Math.max(160, Math.min(280, viewportWidth - horizontalMargin * 2));
      const desiredReactionsWidth = Math.max(280, Math.min(316, viewportWidth - horizontalMargin * 2));
      const reactionsH = 56;
      const floatingGap = 8;
      const verticalMargin = 8;
      const menuBottomLimit = Math.min(viewportBottom - verticalMargin, inputTop - floatingGap);
      // Keep the menu below the bubble. If there isn't enough room,
      // temporarily lift the bubble just enough so the menu fully fits
      // above the composer / bottom panel.
      const shiftForMenu = Math.max(
        0,
        rect.bottom + floatingGap + menuH - menuBottomLimit
      );
      const shiftedBubbleTop = rect.top - shiftForMenu;
      const shiftedBubbleBottom = rect.bottom - shiftForMenu;
      const nextMenuTop = Math.max(
        viewportTop + verticalMargin,
        Math.min(shiftedBubbleBottom + floatingGap, menuBottomLimit - menuH)
      );
      const nextMenuLeft = Math.max(
        viewportLeft + horizontalMargin,
        Math.min(rect.left, viewportRight - desiredMenuWidth - horizontalMargin)
      );
      const nextReactionsLeft = Math.max(
        viewportLeft + horizontalMargin,
        Math.min(
          rect.left + rect.width / 2 - desiredReactionsWidth / 2,
          viewportRight - desiredReactionsWidth - horizontalMargin
        )
      );
      const preferredReactionsTop = shiftedBubbleTop - reactionsH - floatingGap;
      const nextReactionsTop =
        preferredReactionsTop >= safeTop
          ? preferredReactionsTop
          : safeTop;

      setMenuTop(nextMenuTop);
      setMenuLeft(nextMenuLeft);
      setMenuWidth(desiredMenuWidth);
      setReactionsTop(nextReactionsTop);
      setReactionsLeft(nextReactionsLeft);
      setReactionsWidth(desiredReactionsWidth);
      setBubbleShiftY(shiftForMenu);
      setOverlayBubbleRect({
        top: shiftedBubbleTop,
        left: rect.left,
        width: rect.width,
      });

      setShowLongPressMenu(true);
      if (navigator.vibrate) navigator.vibrate(30);
    }, 500);
  }, [canEditDelete, message.content]);

  useEffect(() => {
    if (!showReceiptDetails) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setShowReceiptDetails(false);
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [showReceiptDetails]);

  useEffect(() => {
    if (!showReceiptDetails) return;
    const visualViewport = window.visualViewport;
    if (!visualViewport) return;

    const updateReceiptViewport = () => {
      setReceiptViewport({
        offsetTop: visualViewport.offsetTop,
        height: visualViewport.height,
        keyboardInset: Math.max(0, window.innerHeight - (visualViewport.offsetTop + visualViewport.height)),
      });
    };

    updateReceiptViewport();
    visualViewport.addEventListener('resize', updateReceiptViewport);
    visualViewport.addEventListener('scroll', updateReceiptViewport);
    return () => {
      visualViewport.removeEventListener('resize', updateReceiptViewport);
      visualViewport.removeEventListener('scroll', updateReceiptViewport);
    };
  }, [showReceiptDetails]);

  const handleLongPressEnd = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  // Refs for stable callbacks in native listeners (avoid re-registering on every render)
  const onReplyRef = useRef(onReply);
  onReplyRef.current = onReply;
  const messageRef = useRef(message);
  messageRef.current = message;
  const swipeXRef = useRef(swipeX);
  swipeXRef.current = swipeX;

  // Register native touch listeners ONCE with { passive: false } so e.preventDefault()
  // works on iOS. React synthetic touch events are passive and silently ignore it.
  useEffect(() => {
    const el = bubbleRef.current;
    if (!el) return;

    const onStart = (e: TouchEvent) => {
      const touch = e.touches[0];
      touchRef.current = { startX: touch.clientX, startY: touch.clientY, swiping: false };
      handleLongPressStart();
    };

    const onMove = (e: TouchEvent) => {
      handleLongPressEnd();
      if (!touchRef.current) return;
      const touch = e.touches[0];
      const dx = touch.clientX - touchRef.current.startX;
      const dy = touch.clientY - touchRef.current.startY;

      if (!touchRef.current.swiping && Math.abs(dy) > Math.abs(dx)) {
        touchRef.current = null;
        return;
      }

      if (dx > 10) {
        e.preventDefault();
        touchRef.current.swiping = true;
        setSwipeX(Math.min(dx, 100));
        return;
      }

      if (isOwn && receiptVisualState && dx < -10) {
        e.preventDefault();
        touchRef.current.swiping = true;
        setSwipeX(Math.max(dx, -100));
      }
    };

    const onEnd = () => {
      handleLongPressEnd();
      if (touchRef.current?.swiping && swipeXRef.current >= SWIPE_THRESHOLD) {
        onReplyRef.current?.(messageRef.current);
      }
      if (touchRef.current?.swiping && swipeXRef.current <= -SWIPE_THRESHOLD && isOwn && receiptVisualState) {
        setShowReceiptDetails(true);
      }
      touchRef.current = null;
      setSwipeX(0);
    };

    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd, { passive: true });

    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handleLongPressStart, handleLongPressEnd, isOwn, receiptVisualState]);

  const timestamp = format(new Date(message.created_at), 'HH:mm');
  const bubbleContent = (
    <>
      {!isOwn && !isGrouped && conversation?.type === 'group' && (
        <div className={styles.senderName} style={{ color: senderPalette.accent }}>
          {message.sender.username}
        </div>
      )}

      {message.reply_to && (
        <ReplyPreview replyTo={message.reply_to} />
      )}

      {message.forwarded_from && (
        <div
          className={styles.forwardedHeader}
          style={forwardedPalette ? {
            '--reply-accent': forwardedPalette.accent,
            '--reply-tint': forwardedPalette.tint,
          } as React.CSSProperties : undefined}
        >
          {t('chat.forwardedFrom', { name: message.forwarded_from.sender?.username ?? '?' })}
        </div>
      )}

      {message.is_deleted ? (
        <div className={`${styles.content} ${styles.deleted}`}>{t('chat.deleted')}</div>
      ) : (
        <>
          {message.file_id && message.is_image && (
            <div
              className={styles.imageContainer}
              onClick={() => setLightboxOpen(true)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter') setLightboxOpen(true); }}
              aria-label={`View ${message.file_name || 'image'}`}
            >
              <img
                src={message.thumbnail_url ?? `/api/files/${message.file_id}/thumb`}
                alt={message.file_name || 'Attached image'}
                className={styles.inlineImage}
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
            </div>
          )}

          {message.file_id && !message.is_image && message.file_name && (
            <FileCard
              fileId={message.file_id}
              fileName={message.file_name}
              fileSize={message.file_size ?? 0}
              mimeType={message.file_mime ?? 'application/octet-stream'}
            />
          )}

          {message.content && (
            <div
              className={styles.content}
              dangerouslySetInnerHTML={{ __html: renderMarkdown(message.content, conversation?.participants.map(p => p.username)) }}
            />
          )}
        </>
      )}

      <div className={styles.timestamp}>
        {!message.is_deleted && (
          <span className={styles.timestampReactions}>
            <ReactionBar
              reactions={message.reactions}
              messageId={message.id}
              currentUserId={currentUserId}
              conversationId={message.conversation_id}
            />
          </span>
        )}
        <span className={styles.timestampSpacer} />
        <span className={styles.timestampTime}>
          {timestamp}
          {message.edited_at && !message.is_deleted && (
            <span className={styles.edited}>{t('chat.edited')}</span>
          )}
          {isOwn && (
            <>
              <ReadReceipt
                state={receiptVisualState}
                onClick={() => setShowReceiptDetails(prev => !prev)}
              />
            </>
          )}
        </span>
      </div>

      {showDeleteConfirm && (
        <div className={styles.deleteConfirm}>
          <span className={styles.deleteConfirmText}>{t('chat.deleteConfirm')}</span>
          <div className={styles.deleteConfirmButtons}>
            <button
              className={styles.keepBtn}
              onClick={() => setShowDeleteConfirm(false)}
            >
              {t('chat.keepMessage')}
            </button>
            <button
              className={styles.deleteBtn}
              onClick={handleDeleteConfirm}
            >
              {t('chat.deleteMessage')}
            </button>
          </div>
        </div>
      )}
    </>
  );

  const longPressMenuPortal =
    showLongPressMenu && !message.is_deleted && typeof document !== 'undefined'
      ? createPortal(
          <>
            <div
              className={styles.longPressOverlay}
              style={{ inset: 0 }}
              onClick={() => { closeLongPressMenu(); }}
              onTouchMove={e => e.preventDefault()}
            />
            {overlayBubbleRect && (
              <div
                className={`${styles.bubble} ${isOwn ? styles.own : styles.other} ${styles.bubbleOverlayClone}`}
                style={{
                  position: 'fixed',
                  top: overlayBubbleRect.top,
                  left: overlayBubbleRect.left,
                  width: overlayBubbleRect.width,
                  maxWidth: overlayBubbleRect.width,
                }}
                aria-hidden="true"
              >
                {bubbleContent}
              </div>
            )}
            <div
              className={styles.longPressReactionTray}
              style={{
                position: 'fixed',
                left: reactionsLeft,
                top: reactionsTop,
                width: reactionsWidth,
                zIndex: 100002,
              }}
              onClick={e => e.stopPropagation()}
              onTouchMove={e => e.stopPropagation()}
            >
              <div className={styles.longPressReactionsRow}>
                {LONG_PRESS_REACTION_EMOJIS.map(emoji => (
                  <button
                    key={emoji}
                    className={styles.longPressReactionBtn}
                    onClick={() => handleLongPressReaction(emoji)}
                    aria-label={`React ${emoji}`}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
            <div
              className={styles.longPressMenu}
              style={{
                position: 'fixed',
                left: menuLeft,
                top: menuTop,
                width: menuWidth,
                zIndex: 100002,
              }}
              onClick={e => e.stopPropagation()}
              onTouchMove={e => e.stopPropagation()}
            >
              <button className={styles.longPressItem} onClick={() => { handleReply(); closeLongPressMenu(); }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 14L4 9l5-5"/><path d="M20 20v-7a4 4 0 00-4-4H4"/></svg>
                {t('chat.reply')}
              </button>
              <button className={styles.longPressItem} onClick={() => { setForwardMessage(message); closeLongPressMenu(); }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 14l5-5-5-5"/><path d="M4 20v-7a4 4 0 014-4h12"/></svg>
                {t('chat.forward')}
              </button>
              {message.content && (
                <button className={styles.longPressItem} onClick={() => { navigator.clipboard.writeText(message.content!); closeLongPressMenu(); }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
                  {t('chat.copy')}
                </button>
              )}
              {canEditDelete && (
                <>
                  <button className={styles.longPressItem} onClick={() => { handleEdit(); closeLongPressMenu(); }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 113 3L7 19l-4 1 1-4Z"/></svg>
                    {t('chat.edit')}
                  </button>
                  <button className={styles.longPressItem} onClick={() => { setShowDeleteConfirm(true); closeLongPressMenu(); }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M8 6V4a1 1 0 011-1h6a1 1 0 011 1v2"/><path d="M19 6l-1 14a1 1 0 01-1 1H7a1 1 0 01-1-1L5 6"/></svg>
                    {t('chat.deleteMessage')}
                  </button>
                </>
              )}
            </div>
          </>,
          document.body
        )
      : null;

  const receiptDetailsPortal =
    showReceiptDetails && receiptVisualState && typeof document !== 'undefined'
      ? createPortal(
          <>
            <div
              className={styles.receiptSheetOverlay}
              style={{
                top: receiptViewport.offsetTop,
                height: receiptViewport.height,
                bottom: 'auto',
              }}
              onClick={() => setShowReceiptDetails(false)}
            />
            <div
              className={styles.receiptSheet}
              style={{
                bottom: `calc(${receiptViewport.keyboardInset}px + env(safe-area-inset-bottom, 0px) + 12px)`,
                maxHeight: Math.max(180, receiptViewport.height - 24),
              }}
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-label={t('chat.messageReceiptInfo')}
            >
              <div className={styles.receiptSheetHandle} />
              <div className={styles.receiptSheetHeader}>
                <div className={styles.receiptSheetTitle}>{t('chat.messageReceiptInfo')}</div>
                <button
                  type="button"
                  className={styles.receiptSheetClose}
                  onClick={() => setShowReceiptDetails(false)}
                  aria-label={t('chat.closeMenu')}
                >
                  ×
                </button>
              </div>
              <div className={styles.receiptSheetRows}>
                {receiptDetailRows.map((row, idx) => (
                  <div key={`${row.label}-${idx}`} className={styles.receiptSheetRow}>
                    <span className={styles.receiptSheetLabel}>{row.label}</span>
                    <span className={styles.receiptSheetValue}>{row.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </>,
          document.body
        )
      : null;

  return (
    <div
      ref={itemRef}
      className={`${styles.item} ${isOwn ? styles.own : ''}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => {
        setIsHovered(false);
        setShowMenu(false);
      }}
    >
      {swipeX !== 0 && (
        <div
          className={`${styles.swipeCue} ${styles.swipeCueVisible} ${swipeX > 0 ? styles.swipeCueReply : styles.swipeCueReceipts}`}
          aria-hidden="true"
        >
          <span className={styles.swipeCueIcon}>{swipeX > 0 ? '↩' : '✓✓'}</span>
        </div>
      )}

      {/* Avatar placeholder for other user messages */}
      {!isOwn && (
        <div className={styles.avatarWrapper}>
          <div
            className={`${styles.avatar} ${isGrouped ? styles.avatarHidden : ''}`}
          >
            <Avatar
              name={message.sender.username}
              avatarUrl={message.sender.avatar_url}
              size="sm"
            />
          </div>
          {!isGrouped && (
            <span
              className={`${styles.onlineDot} ${senderOnline ? styles.onlineDotOnline : styles.onlineDotOffline}`}
              aria-label={senderOnline ? t('time.online') : t('time.offline')}
            />
          )}
        </div>
      )}

      <div
        ref={bubbleRef}
        className={`${styles.bubble} ${isOwn ? styles.own : styles.other} ${showLongPressMenu ? styles.bubbleHighlighted : ''}`}
        style={
          swipeX !== 0
            ? { transform: `translateX(${swipeX}px)`, transition: 'none' }
            : showLongPressMenu && bubbleShiftY > 0
              ? { transform: `translateY(-${bubbleShiftY}px)`, transition: 'transform 0.2s ease-out' }
              : { transition: 'transform 0.2s ease-out' }
        }
      >
        {bubbleContent}
      </div>

      {/* Lightbox — full-size image viewer (D-30, D-31) */}
      {lightboxOpen && message.file_id && (
        <Lightbox
          fileId={message.file_id}
          fileName={message.file_name || 'Image'}
          onClose={() => setLightboxOpen(false)}
        />
      )}

      {/* Forward modal */}
      {forwardMessage && (
        <ForwardModal
          message={forwardMessage}
          onClose={() => setForwardMessage(null)}
        />
      )}
      {longPressMenuPortal}
      {receiptDetailsPortal}

      {/* Action menu — inside .item but positioned absolutely so no layout shift */}
      {isHovered && !message.is_deleted && (
        <div className={`${styles.menuWrapper} ${isOwn ? styles.menuWrapperOwn : ''}`}>
          <AddReactionButton
            messageId={message.id}
            conversationId={message.conversation_id}
            variant="menu"
          />
          <button
            className={styles.menuBtn}
            onClick={handleReply}
            aria-label={t('chat.reply')}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 14L4 9l5-5"/><path d="M20 20v-7a4 4 0 00-4-4H4"/></svg>
          </button>
          <button
            className={styles.menuBtn}
            onClick={() => setForwardMessage(message)}
            aria-label={t('chat.forward')}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 14l5-5-5-5"/><path d="M4 20v-7a4 4 0 014-4h12"/></svg>
          </button>
          {message.content && (
            <button
              className={styles.menuBtn}
              onClick={() => navigator.clipboard.writeText(message.content!)}
              aria-label={t('chat.copy')}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
            </button>
          )}

          {canEditDelete && (
            <div className={styles.overflowMenu}>
              <button
                className={styles.menuBtn}
                onClick={() => setShowMenu(prev => !prev)}
                aria-label={t('chat.messageOptions')}
              >
                ···
              </button>
              {showMenu && (
                <div className={styles.dropdown}>
                  <button className={styles.dropdownItem} onClick={handleEdit}>
                    {t('chat.edit')}
                  </button>
                  <button
                    className={`${styles.dropdownItem} ${styles.dropdownItemDestructive}`}
                    onClick={() => {
                      setShowMenu(false);
                      setShowDeleteConfirm(true);
                    }}
                  >
                    {t('chat.deleteMessage')}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

    </div>
  );
}
