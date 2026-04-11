import React from 'react';
import styles from './MessageItem.module.css';

interface ReplyPreviewProps {
  replyTo: {
    sender_id: string;
    content: string | null;
    sender?: { username: string };
    id?: string;
  } | null;
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
