import React, { useEffect, useState } from 'react';
import { useChat } from '../../contexts/ChatContext';
import styles from './TypingIndicator.module.css';

interface TypingIndicatorProps {
  conversationId: string;
}

/**
 * When the typing user stops, the server instantly broadcasts an empty typers
 * array. If we rendered from that immediately the "Alice is typing…" line
 * would flicker off for a fraction of a second on every keystroke boundary.
 *
 * We mirror the incoming state into a local snapshot that is only cleared
 * after a short grace period (GRACE_MS) of continuous emptiness — so rapid
 * stop/start cycles do not flap, and a genuine stop still fades the hint out
 * within ~1.5s of the last keystroke.
 */
const GRACE_MS = 1500;

export function TypingIndicator({ conversationId }: TypingIndicatorProps) {
  const { state } = useChat();
  const typers = state.typingUsers[conversationId] ?? [];

  // visibleTypers is what we actually render. It lags behind `typers` on the
  // way down (empty) by GRACE_MS but follows immediately on the way up.
  const [visibleTypers, setVisibleTypers] = useState(typers);

  useEffect(() => {
    if (typers.length > 0) {
      setVisibleTypers(typers);
      return;
    }
    // typers is empty — schedule a delayed hide. If new typers arrive
    // before the timer fires the effect re-runs and clears this timer.
    const t = setTimeout(() => setVisibleTypers([]), GRACE_MS);
    return () => clearTimeout(t);
    // Re-run whenever the typers identity OR length changes. Deep compare
    // via length + first username is sufficient — our typers array is tiny.
  }, [typers.length, typers[0]?.username]);

  let text = '';
  if (visibleTypers.length === 1) {
    text = `${visibleTypers[0].username} is typing…`;
  } else if (visibleTypers.length === 2) {
    text = `${visibleTypers[0].username} and ${visibleTypers[1].username} are typing…`;
  } else if (visibleTypers.length >= 3) {
    text = 'Several people are typing…';
  }

  return (
    <div className={styles.container}>
      {text}
    </div>
  );
}
