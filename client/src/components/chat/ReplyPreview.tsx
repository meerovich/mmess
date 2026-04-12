import React from 'react';
import { useTranslation } from '../../lib/i18n';
import type { ReplyTo } from '../../types/chat';
import styles from './MessageItem.module.css';

interface ReplyPreviewProps {
  replyTo: ReplyTo | null;
}

export function ReplyPreview({ replyTo }: ReplyPreviewProps) {
  const { t } = useTranslation();

  if (!replyTo) return null;

  const senderName = replyTo.sender?.username ?? t('chat.unknown');
  const preview = replyTo.content ? replyTo.content.slice(0, 80) : t('chat.noContent');

  return (
    <div className={styles.replyPreview}>
      <span className={styles.replyPreviewSender}>{senderName}</span>
      <span className={styles.replyPreviewText}>{preview}</span>
    </div>
  );
}
