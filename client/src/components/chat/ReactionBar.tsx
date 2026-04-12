import React, { useRef, useState } from 'react';
import { useSendMessage } from '../../providers/WebSocketProvider';
import styles from './ReactionBar.module.css';
import type { MessageReaction } from '../../types/chat';

const QUICK_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🔥'];

interface ReactionBarProps {
  reactions: MessageReaction[];
  messageId: string;
  currentUserId: string;
  conversationId: string;
}

// Exported separately for use in timestamp row (MessageItem).
// Compact quick-reaction panel instead of full emoji-mart picker.
export function AddReactionButton({ messageId, conversationId }: { messageId: string; conversationId: string }) {
  const sendWs = useSendMessage();
  const [showPicker, setShowPicker] = useState(false);

  const handleEmojiClick = (emoji: string) => {
    sendWs({
      type: 'reaction:add',
      payload: { message_id: messageId, emoji, conversation_id: conversationId },
    });
    setShowPicker(false);
  };

  return (
    <div className={styles.addReactionWrapper} style={{ display: 'inline-flex' }}>
      <button
        className={`${styles.addReactionBtn} ${showPicker ? styles.addReactionBtnOpen : ''}`}
        onClick={() => setShowPicker(prev => !prev)}
        aria-label="Add reaction"
        style={{ opacity: 1, width: 18, height: 18, fontSize: '11px' }}
      >
        +
      </button>
      {showPicker && (
        <>
          <div className={styles.pickerBackdrop} onClick={() => setShowPicker(false)} />
          <div className={styles.quickPicker}>
            {QUICK_EMOJIS.map(emoji => (
              <button
                key={emoji}
                className={styles.quickEmojiBtn}
                onClick={() => handleEmojiClick(emoji)}
              >
                {emoji}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
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
