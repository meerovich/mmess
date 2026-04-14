import { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useTranslation } from '../../lib/i18n';
import { Avatar } from '../common/Avatar';
import { ProfileModal } from './ProfileModal';
import styles from './UserMenu.module.css';

interface UserMenuProps {
  placement?: 'up' | 'down';
  align?: 'left' | 'right';
  className?: string;
}

export function UserMenu({
  placement = 'up',
  align = 'left',
  className,
}: UserMenuProps) {
  const { user, logout } = useAuth();
  const { locale, setLocale, t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [showProfile, setShowProfile] = useState(false);

  useEffect(() => {
    const closeMenu = (event: MouseEvent) => {
      if (!(event.target instanceof Node)) return;
      if (!(event.target as HTMLElement).closest('[data-user-menu="true"]')) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', closeMenu);
    return () => document.removeEventListener('mousedown', closeMenu);
  }, []);

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
    <div className={`${styles.wrapper} ${className ?? ''}`} data-user-menu="true">
      <button
        className={styles.avatarBtn}
        onClick={() => setOpen(prev => !prev)}
        aria-label={t('menu.profile')}
      >
        <Avatar name={user.username} avatarUrl={user.avatar_url} size="sm" />
      </button>

      {open && (
        <>
          <div className={styles.backdrop} onClick={() => setOpen(false)} />
          <div
            className={`${styles.menu} ${placement === 'down' ? styles.menuDown : styles.menuUp} ${align === 'right' ? styles.menuAlignRight : styles.menuAlignLeft}`}
          >
            <div className={styles.menuHeader}>
              <strong>{user.username}</strong>
              <span className={styles.email}>{user.email}</span>
              {user.profile_status && <span className={styles.status}>{user.profile_status}</span>}
            </div>
            <div className={styles.separator} />
            <button className={styles.menuItem} onClick={() => { setOpen(false); setShowProfile(true); }}>
              ✨ {t('menu.editProfile')}
            </button>
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
      {showProfile && <ProfileModal onClose={() => setShowProfile(false)} />}
    </div>
  );
}
