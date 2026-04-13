import { useState, useMemo } from 'react';
import { useChat } from '../../contexts/ChatContext';
import { useAuth } from '../../contexts/AuthContext';
import { useTranslation } from '../../lib/i18n';
import { useSendMessage } from '../../providers/WebSocketProvider';
import { Avatar } from '../common/Avatar';
import styles from './ForwardModal.module.css';
import type { Message, Conversation } from '../../types/chat';
import { nanoid } from 'nanoid';

interface ForwardModalProps {
  message: Message;
  onClose: () => void;
}

function getConvDisplayName(conv: Conversation, currentUserId: string): string {
  if (conv.type === 'group') return conv.name ?? 'Group';
  const other = conv.participants.find(p => p.user_id !== currentUserId);
  return other?.username ?? conv.name ?? 'Chat';
}

function getConvAvatar(conv: Conversation, currentUserId: string): string | null {
  if (conv.type === 'group') return conv.avatar_url;
  const other = conv.participants.find(p => p.user_id !== currentUserId);
  return other?.avatar_url ?? null;
}

export function ForwardModal({ message, onClose }: ForwardModalProps) {
  const { state, dispatch } = useChat();
  const { user } = useAuth();
  const { t } = useTranslation();
  const sendWs = useSendMessage();
  const [filter, setFilter] = useState('');

  const currentUserId = user?.id ?? '';

  const filtered = useMemo(() => {
    const q = filter.toLowerCase();
    return state.conversations.filter(c => {
      const name = getConvDisplayName(c, currentUserId).toLowerCase();
      return !q || name.includes(q);
    });
  }, [state.conversations, filter, currentUserId]);

  const handleForward = (conv: Conversation) => {
    const tempId = `temp-${nanoid()}`;

    // Optimistic add
    dispatch({
      type: 'OPTIMISTIC_MESSAGE_ADD',
      conversationId: conv.id,
      message: {
        id: tempId,
        conversation_id: conv.id,
        sender_id: currentUserId,
        content: message.content,
        reply_to_id: null,
        reply_to: null,
        forwarded_from_id: message.id,
        forwarded_from: {
          id: message.id,
          sender: { id: message.sender_id, username: message.sender.username },
          content_preview: message.content?.slice(0, 100) ?? null,
        },
        is_deleted: false,
        edited_at: null,
        created_at: new Date().toISOString(),
        sender: { id: currentUserId, username: user?.username ?? '', avatar_url: null },
        reactions: [],
        status: 'sending',
        file_id: message.file_id,
        file_name: message.file_name,
        file_mime: message.file_mime,
        file_size: message.file_size,
        is_image: message.is_image,
        thumbnail_url: message.thumbnail_url,
      },
    });

    // Send via WS — server copies content/file from original
    sendWs({
      type: 'message:send',
      payload: {
        conversation_id: conv.id,
        forwarded_from_id: message.id,
      },
      id: tempId,
    });

    onClose();
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <h2 className={styles.title}>{t('chat.forwardTo')}</h2>
        <input
          className={styles.searchInput}
          type="text"
          placeholder={t('chat.searchConversation')}
          value={filter}
          onChange={e => setFilter(e.target.value)}
          autoFocus
        />
        <ul className={styles.list}>
          {filtered.map(conv => {
            const name = getConvDisplayName(conv, currentUserId);
            const avatar = getConvAvatar(conv, currentUserId);
            return (
              <li key={conv.id}>
                <button className={styles.item} onClick={() => handleForward(conv)}>
                  <Avatar name={name} avatarUrl={avatar} size="sm" />
                  <span className={styles.convName}>{name}</span>
                </button>
              </li>
            );
          })}
        </ul>
        <button className={styles.cancelButton} onClick={onClose}>
          {t('chat.cancel')}
        </button>
      </div>
    </div>
  );
}
