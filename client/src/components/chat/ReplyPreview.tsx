import React from 'react';
import { getAvatarPalette } from '../../lib/avatarColor';
import { replaceTextEmoticons } from '../../lib/chatText';
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
  const preview = replyTo.content
    ? replaceTextEmoticons(replyTo.content).slice(0, 80)
    : t('chat.noContent');
  const palette = getAvatarPalette(senderName);

  return (
    <div
      className={styles.replyPreview}
      style={{
        '--reply-accent': palette.accent,
        '--reply-tint': palette.tint,
      } as React.CSSProperties}
    >
      <span className={styles.replyPreviewSender}>{senderName}</span>
      <span className={styles.replyPreviewText}>{preview}</span>
    </div>
  );
}
