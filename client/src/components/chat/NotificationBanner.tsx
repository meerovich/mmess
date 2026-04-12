import { useState, useEffect } from 'react';
import { useTranslation } from '../../lib/i18n';
import styles from './NotificationBanner.module.css';

const STORAGE_KEY = 'notif-banner-dismissed';

export function NotificationBanner() {
  const { t } = useTranslation();
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
        {t('notification.bannerText')}
      </span>
      <div className={styles.actions}>
        <button className={styles.enableBtn} onClick={handleEnable}>
          {t('notification.enable')}
        </button>
        <button className={styles.dismissBtn} onClick={handleDismiss} aria-label={t('notification.dismiss')}>
          &#10005;
        </button>
      </div>
    </div>
  );
}
