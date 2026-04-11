import React from 'react';
import { useChat } from '../../contexts/ChatContext';
import styles from './TypingIndicator.module.css';

interface TypingIndicatorProps {
  conversationId: string;
}

export function TypingIndicator({ conversationId }: TypingIndicatorProps) {
  const { state } = useChat();
  const typers = state.typingUsers[conversationId] ?? [];

  let text = '';
  if (typers.length === 1) {
    text = `${typers[0].username} is typing…`;
  } else if (typers.length === 2) {
    text = `${typers[0].username} and ${typers[1].username} are typing…`;
  } else if (typers.length >= 3) {
    text = 'Several people are typing…';
  }

  return (
    <div className={styles.container}>
      {text}
    </div>
  );
}
