import { useEffect, useState } from 'react';
import styles from './Lightbox.module.css';

interface LightboxProps {
  fileId: string;
  fileName: string;
  onClose: () => void;
}

export function Lightbox({ fileId, onClose, fileName }: LightboxProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

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

      <div className={styles.imageWrapper} onClick={(e) => e.stopPropagation()}>
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
