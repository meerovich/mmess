import React, { useEffect, useState } from 'react';
import { getAvatarPalette } from '../../lib/avatarColor';
import { replaceTextEmoticons } from '../../lib/chatText';
import { decryptMessagePayload, isEncryptedPayload } from '../../lib/e2ee';
import { useTranslation } from '../../lib/i18n';
import type { Conversation, ReplyTo } from '../../types/chat';
import styles from './MessageItem.module.css';

interface ReplyPreviewProps {
  replyTo: ReplyTo | null;
  conversation?: Conversation;
  userId?: string;
}

export function ReplyPreview({ replyTo, conversation, userId }: ReplyPreviewProps) {
  const { t } = useTranslation();
  const [decryptedText, setDecryptedText] = useState<string | null>(null);
  const encrypted = isEncryptedPayload(replyTo?.content);

  useEffect(() => {
    if (!replyTo?.content || !conversation || !userId || !encrypted) {
      setDecryptedText(null);
      return;
    }

    let cancelled = false;
    decryptMessagePayload(conversation, userId, replyTo.content)
      .then((payload) => {
        if (cancelled) return;
        setDecryptedText(payload?.text ?? payload?.file?.name ?? null);
      })
      .catch(() => {
        if (!cancelled) setDecryptedText(t('chat.decryptFailed'));
      });

    return () => {
      cancelled = true;
    };
  }, [conversation, encrypted, replyTo?.content, t, userId]);

  if (!replyTo) return null;

  const senderName = replyTo.sender?.username ?? t('chat.unknown');
  const content = encrypted ? decryptedText ?? t('chat.decrypting') : replyTo.content;
  const preview = content
    ? replaceTextEmoticons(content).slice(0, 80)
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
