import { useEffect, useRef, useState } from 'react';
import styles from './Lightbox.module.css';

interface LightboxProps {
  fileId: string;
  fileName: string;
  onClose: () => void;
}

export function Lightbox({ fileId, onClose, fileName }: LightboxProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [dragY, setDragY] = useState(0);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  // Fade in on mount
  useEffect(() => {
    requestAnimationFrame(() => setIsVisible(true));
  }, []);

  // Escape key handler
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleClose = () => {
    setIsVisible(false);
    // Wait for fade-out before unmounting
    setTimeout(onClose, 150);
  };

  const handleTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
    const touch = event.touches[0];
    touchStartRef.current = { x: touch.clientX, y: touch.clientY };
  };

  const handleTouchMove = (event: React.TouchEvent<HTMLDivElement>) => {
    if (!touchStartRef.current) return;
    const touch = event.touches[0];
    const dy = touch.clientY - touchStartRef.current.y;
    const dx = Math.abs(touch.clientX - touchStartRef.current.x);
    if (dy > 0 && dy > dx) {
      event.preventDefault();
      setDragY(dy);
    }
  };

  const handleTouchEnd = () => {
    if (dragY > 120) {
      handleClose();
    } else {
      setDragY(0);
    }
    touchStartRef.current = null;
  };

  return (
    <div
      className={`${styles.backdrop} ${isVisible ? styles.visible : ''}`}
      onClick={handleClose}
      role="dialog"
      aria-modal="true"
      aria-label="Image viewer"
    >
      <button
        className={styles.closeBtn}
        onClick={handleClose}
        aria-label="Close image viewer"
        autoFocus
      >
        &#215;
      </button>

      <div
        className={styles.imageWrapper}
        onClick={(e) => e.stopPropagation()}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={dragY > 0 ? { transform: `translateY(${dragY}px) scale(${Math.max(0.9, 1 - dragY / 900)})` } : undefined}
      >
        {!isLoaded && <div className={styles.spinner} aria-hidden="true" />}
        <img
          src={`/api/files/${fileId}`}
          alt={fileName}
          className={`${styles.image} ${isLoaded ? styles.imageLoaded : ''}`}
          onLoad={() => setIsLoaded(true)}
          tabIndex={0}
        />
      </div>
    </div>
  );
}
