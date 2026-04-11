import React from 'react';
import type { ReplyTo } from '../../types/chat';
import styles from './MessageItem.module.css';

interface ReplyPreviewProps {
  replyTo: ReplyTo | null;
}

export function ReplyPreview({ replyTo }: ReplyPreviewProps) {
  if (!replyTo) return null;

  const senderName = replyTo.sender?.username ?? 'Unknown';
  const preview = replyTo.content ? replyTo.content.slice(0, 80) : '(no content)';

  return (
    <div className={styles.replyPreview}>
      <span className={styles.replyPreviewSender}>{senderName}</span>
      <span className={styles.replyPreviewText}>{preview}</span>
    </div>
  );
}
