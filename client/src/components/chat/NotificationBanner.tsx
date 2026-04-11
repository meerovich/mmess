import { useState, useEffect } from 'react';
import styles from './NotificationBanner.module.css';

const STORAGE_KEY = 'notif-banner-dismissed';

export function NotificationBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Show if permission is 'default' and user hasn't dismissed this session
    if (
      typeof window !== 'undefined' &&
      'Notification' in window &&
      Notification.permission === 'default' &&
      !sessionStorage.getItem(STORAGE_KEY)
    ) {
      setVisible(true);
    }
  }, []);

  if (!visible) return null;

  function handleEnable() {
    Notification.requestPermission().finally(() => {
      setVisible(false);
      sessionStorage.setItem(STORAGE_KEY, '1');
    });
  }

  function handleDismiss() {
    setVisible(false);
    sessionStorage.setItem(STORAGE_KEY, '1');
  }

  return (
    <div className={styles.banner} role="status" aria-live="polite">
      <span className={styles.message}>
        Enable notifications to be alerted when tabs are in the background.
      </span>
      <div className={styles.actions}>
        <button className={styles.enableBtn} onClick={handleEnable}>
          Enable notifications
        </button>
        <button className={styles.dismissBtn} onClick={handleDismiss} aria-label="Dismiss notification banner">
          ✕
        </button>
      </div>
    </div>
  );
}
