import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useTranslation } from '../../lib/i18n';
import { Avatar } from '../common/Avatar';
import styles from './UserMenu.module.css';

export function UserMenu() {
  const { user, logout } = useAuth();
  const { locale, setLocale, t } = useTranslation();
  const [open, setOpen] = useState(false);

  if (!user) return null;

  const handleLogout = async () => {
    setOpen(false);
    await logout();
    window.location.href = '/login';
  };

  const toggleLanguage = () => {
    setLocale(locale === 'ru' ? 'en' : 'ru');
  };

  return (
    <div className={styles.wrapper}>
      <button
        className={styles.avatarBtn}
        onClick={() => setOpen(prev => !prev)}
        aria-label={t('menu.profile')}
      >
        <Avatar name={user.username} size="sm" />
      </button>

      {open && (
        <>
          <div className={styles.backdrop} onClick={() => setOpen(false)} />
          <div className={styles.menu}>
            <div className={styles.menuHeader}>
              <strong>{user.username}</strong>
              <span className={styles.email}>{user.email}</span>
            </div>
            <div className={styles.separator} />
            <button className={styles.menuItem} onClick={toggleLanguage}>
              🌐 {t('menu.language')}: {locale === 'ru' ? 'Русский' : 'English'}
            </button>
            <div className={styles.separator} />
            <button className={`${styles.menuItem} ${styles.menuItemDanger}`} onClick={handleLogout}>
              🚪 {t('menu.logout')}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
