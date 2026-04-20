import { useRef, useState } from 'react';
import { Avatar } from '../common/Avatar';
import { useTranslation } from '../../lib/i18n';
import styles from './AvatarFullscreenPreview.module.css';

interface AvatarFullscreenPreviewProps {
  name: string;
  avatarUrl: string | null;
  kind?: 'user' | 'group';
  subtitle?: string | null;
  onClose: () => void;
}

export function AvatarFullscreenPreview({
  name,
  avatarUrl,
  kind = 'user',
  subtitle,
  onClose,
}: AvatarFullscreenPreviewProps) {
  const { t } = useTranslation();
  const [dragY, setDragY] = useState(0);
  const dragRef = useRef<{ startY: number; active: boolean } | null>(null);

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture?.(event.pointerId);
    dragRef.current = { startY: event.clientY, active: true };
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag?.active) return;
    setDragY(Math.max(0, event.clientY - drag.startY));
  };

  const handlePointerEnd = () => {
    if (dragY > 90) {
      onClose();
      return;
    }
    dragRef.current = null;
    setDragY(0);
  };

  return (
    <div
      className={styles.overlay}
      role="dialog"
      aria-modal="true"
      aria-label={t('chat.avatarPreview')}
      onClick={(event) => event.target === event.currentTarget && onClose()}
    >
      <div
        className={styles.preview}
        style={dragY > 0 ? { transform: `translateY(${dragY}px) scale(${Math.max(0.88, 1 - dragY / 900)})` } : undefined}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
      >
        <div className={styles.grabber} aria-hidden="true" />
        <button type="button" className={styles.closeButton} onClick={onClose} aria-label={t('chat.closeMenu')}>
          ×
        </button>
        <div className={styles.avatarStage}>
          {avatarUrl ? (
            <img src={avatarUrl} alt={name} className={styles.avatarImage} draggable={false} />
          ) : (
            <Avatar name={name} avatarUrl={avatarUrl} size="xl" kind={kind} />
          )}
        </div>
        <div className={styles.caption}>
          <strong>{name}</strong>
          {subtitle && <span>{subtitle}</span>}
        </div>
      </div>
    </div>
  );
}
