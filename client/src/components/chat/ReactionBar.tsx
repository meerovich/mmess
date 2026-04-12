import React, { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSendMessage } from '../../providers/WebSocketProvider';
import styles from './ReactionBar.module.css';
import type { MessageReaction } from '../../types/chat';

// Row 1: 7 most frequent reactions + ▼ expand button (8 cells)
const TOP_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🔥', '👏'];
// Rows 2-4: 8 emojis each (fills all cells below including the ▼ column)
const MORE_EMOJIS = [
  ['🎉', '🤔', '👎', '😡', '🥰', '😎', '🙏', '💯'],
  ['✅', '❌', '⭐', '🤝', '💪', '😏', '🙄', '😍'],
  ['🤣', '😤', '🥺', '💀', '🫡', '🤗', '😘', '🤩'],
];

interface ReactionBarProps {
  reactions: MessageReaction[];
  messageId: string;
  currentUserId: string;
  conversationId: string;
}

// Exported separately for use in timestamp row (MessageItem).
// Telegram-style: + button → 7 frequent emojis + ▼ expand → 3 more rows.
export function AddReactionButton({ messageId, conversationId }: {
  messageId: string;
  conversationId: string;
}) {
  const sendWs = useSendMessage();
  const [showPicker, setShowPicker] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [pickerPos, setPickerPos] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  // Close picker when viewport resizes (keyboard open/close) to avoid stale positioning
  React.useEffect(() => {
    if (!showPicker) return;
    const vv = window.visualViewport;
    if (!vv) return;
    const onResize = () => { setShowPicker(false); setExpanded(false); };
    vv.addEventListener('resize', onResize);
    return () => vv.removeEventListener('resize', onResize);
  }, [showPicker]);

  const handleEmojiClick = (emoji: string) => {
    sendWs({
      type: 'reaction:add',
      payload: { message_id: messageId, emoji, conversation_id: conversationId },
    });
    setShowPicker(false);
    setExpanded(false);
  };

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (showPicker) {
      setShowPicker(false);
      setExpanded(false);
      return;
    }
    // Calculate position from button rect — picker appears above the button
    if (btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      // Position picker above the button, right-aligned
      const left = Math.max(8, Math.min(r.right - 316, window.innerWidth - 324));
      setPickerPos({ top: r.top - 8, left });
    }
    setShowPicker(true);
  };

  // Render picker via portal at document.body so it escapes all overflow:hidden ancestors
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
  const pickerPortal = showPicker && pickerPos ? createPortal(
    <>
      <div
        className={styles.pickerBackdrop}
        onClick={() => { setShowPicker(false); setExpanded(false); }}
        onTouchMove={(e) => e.preventDefault()}
      />
      <div
        className={`${styles.quickPicker} ${isMobile ? styles.quickPickerMobile : ''}`}
        style={isMobile ? {
          position: 'fixed',
          bottom: window.innerHeight - pickerPos.top,
        } : {
          position: 'fixed',
          bottom: window.innerHeight - pickerPos.top,
          left: pickerPos.left,
        }}
        onTouchMove={(e) => e.stopPropagation()}
      >
        <div className={styles.quickPickerRow}>
          {TOP_EMOJIS.map(emoji => (
            <button key={emoji} className={styles.quickEmojiBtn} onClick={() => handleEmojiClick(emoji)}>
              {emoji}
            </button>
          ))}
          <button
            className={styles.quickExpandBtn}
            onClick={() => setExpanded(prev => !prev)}
            aria-label={expanded ? 'Collapse' : 'More emojis'}
          >
            {expanded ? '▲' : '▼'}
          </button>
        </div>
        {expanded && MORE_EMOJIS.map((row, i) => (
          <div key={i} className={styles.quickPickerRow}>
            {row.map(emoji => (
              <button key={emoji} className={styles.quickEmojiBtn} onClick={() => handleEmojiClick(emoji)}>
                {emoji}
              </button>
            ))}
          </div>
        ))}
      </div>
    </>,
    document.body
  ) : null;

  return (
    <>
      <button
        ref={btnRef}
        className={`${styles.inlineAddBtn} ${showPicker ? styles.addReactionBtnOpen : ''}`}
        onClick={handleToggle}
        aria-label="Add reaction"
      >
        +
      </button>
      {pickerPortal}
    </>
  );
}

interface GroupedReaction {
  emoji: string;
  count: number;
  usernames: string[];
  reactedByMe: boolean;
}

function groupReactions(reactions: MessageReaction[], currentUserId: string): GroupedReaction[] {
  const map = new Map<string, { count: number; usernames: string[]; reactedByMe: boolean }>();
  for (const r of reactions) {
    const existing = map.get(r.emoji);
    if (existing) {
      existing.count++;
      existing.usernames.push(r.username);
      if (r.user_id === currentUserId) existing.reactedByMe = true;
    } else {
      map.set(r.emoji, {
        count: 1,
        usernames: [r.username],
        reactedByMe: r.user_id === currentUserId,
      });
    }
  }
  return Array.from(map.entries()).map(([emoji, data]) => ({ emoji, ...data }));
}

export function ReactionBar({ reactions, messageId, currentUserId, conversationId }: ReactionBarProps) {
  const sendWs = useSendMessage();
  const [showPicker, setShowPicker] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  const grouped = groupReactions(reactions, currentUserId);
  const hasReactions = grouped.length > 0;

  const handleBadgeClick = (emoji: string, reactedByMe: boolean) => {
    if (reactedByMe) {
      sendWs({
        type: 'reaction:remove',
        payload: { message_id: messageId, emoji, conversation_id: conversationId },
      });
    } else {
      sendWs({
        type: 'reaction:add',
        payload: { message_id: messageId, emoji, conversation_id: conversationId },
      });
    }
  };

  const handleEmojiSelect = (emojiData: { native: string }) => {
    sendWs({
      type: 'reaction:add',
      payload: { message_id: messageId, emoji: emojiData.native, conversation_id: conversationId },
    });
    setShowPicker(false);
  };

  // When there are no reactions and the picker is closed, we still render the
  // add-reaction button but mark the wrapper as "empty" so MessageItem.module.css
  // can collapse it out of the document flow until the parent bubble is hovered
  // (desktop) or we're on mobile (always visible via media query).
  const wrapperClass = [
    styles.reactionBarWrapper,
    !hasReactions ? 'mmess-reaction-bar-empty' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const addBtnClass = [
    styles.addReactionBtn,
    'mmess-add-reaction-btn',
    showPicker ? styles.addReactionBtnOpen : '',
  ]
    .filter(Boolean)
    .join(' ');

  // Only render if there are reaction badges to show.
  // The + button has been moved to the timestamp row (AddReactionButton).
  if (!hasReactions) return null;

  return (
    <div className={wrapperClass}>
      <div className={styles.reactions}>
        {grouped.map(g => (
          <button
            key={g.emoji}
            className={`${styles.badge} ${g.reactedByMe ? styles.badgeActive : ''}`}
            onClick={() => handleBadgeClick(g.emoji, g.reactedByMe)}
            title={g.usernames.join(', ')}
            aria-label={`${g.emoji} ${g.count} reaction${g.count !== 1 ? 's' : ''} from ${g.usernames.join(', ')}`}
          >
            {g.emoji} {g.count}
          </button>
        ))}
      </div>
    </div>
  );
}
