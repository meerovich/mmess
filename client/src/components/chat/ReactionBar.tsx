import React, { lazy, Suspense, useRef, useState } from 'react';
import { useSendMessage } from '../../providers/WebSocketProvider';
import styles from './ReactionBar.module.css';
import type { MessageReaction } from '../../types/chat';

// @emoji-mart/react has no TS declarations — use any cast for the lazy picker
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const EmojiPickerRaw = lazy(() =>
  import('@emoji-mart/react').then(mod => ({ default: (mod as any).default ?? mod }))
);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const EmojiPicker = EmojiPickerRaw as React.ComponentType<any>;

interface ReactionBarProps {
  reactions: MessageReaction[];
  messageId: string;
  currentUserId: string;
  conversationId: string;
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

  return (
    <div className={wrapperClass}>
      {hasReactions && (
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
      )}

      <div className={styles.addReactionWrapper}>
        <button
          className={addBtnClass}
          onClick={() => setShowPicker(prev => !prev)}
          aria-label="Add reaction"
        >
          +
        </button>
        {showPicker && (
          <div
            ref={pickerRef}
            className={styles.pickerContainer}
            onBlur={(e) => {
              if (!pickerRef.current?.contains(e.relatedTarget as Node)) {
                setShowPicker(false);
              }
            }}
          >
            <Suspense fallback={<div className={styles.pickerLoading}>Loading…</div>}>
              <EmojiPicker onEmojiSelect={handleEmojiSelect} />
            </Suspense>
          </div>
        )}
      </div>
    </div>
  );
}
