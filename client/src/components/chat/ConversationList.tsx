import { useState, useRef, useEffect } from 'react';
import { useChat } from '../../contexts/ChatContext';
import { useAuth } from '../../contexts/AuthContext';
import { useTranslation } from '../../lib/i18n';
import { ConversationItem } from './ConversationItem';
import { NewChatModal } from './NewChatModal';
import { NewGroupModal } from './NewGroupModal';
import { UserMenu } from './UserMenu';
import { ThemeToggle } from '../common/ThemeToggle';
import styles from './ConversationList.module.css';

export function ConversationList() {
  const { state } = useChat();
  const { user } = useAuth();
  const { t } = useTranslation();
  const [showNewChat, setShowNewChat] = useState(false);
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  // Ctrl+K / Cmd+K focuses search input (D-14)
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        searchRef.current?.focus();
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Client-side filter (D-10, D-11)
  const filtered = searchQuery.trim() === ''
    ? state.conversations
    : state.conversations.filter(conv => {
        const q = searchQuery.toLowerCase();
        if (conv.name !== null && conv.name.toLowerCase().includes(q)) return true;
        return conv.participants.some(p => p.username.toLowerCase().includes(q));
      });

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>mmess</h1>
        <div className={styles.actions}>
          <button
            className={styles.actionButton}
            onClick={() => setShowNewChat(true)}
            aria-label={t('sidebar.newChat')}
          >
            {t('sidebar.newChat')}
          </button>
          <button
            className={styles.actionButton}
            onClick={() => setShowNewGroup(true)}
            aria-label={t('sidebar.newGroup')}
          >
            {t('sidebar.newGroup')}
          </button>
        </div>
      </div>

      {/* Search row (D-09) */}
      <div className={styles.searchRow}>
        <div className={styles.searchInputWrap}>
          <svg className={styles.searchIcon} width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
            <circle cx="7" cy="7" r="4.5"/>
            <line x1="10.5" y1="10.5" x2="14" y2="14"/>
          </svg>
          <input
            ref={searchRef}
            className={styles.searchInput}
            type="text"
            placeholder={t('sidebar.search')}
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            aria-label={t('sidebar.search')}
          />
          {searchQuery.length > 0 && (
            <button
              type="button"
              className={styles.clearBtn}
              onClick={() => setSearchQuery('')}
              aria-label={t('sidebar.clearSearch')}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
                <line x1="4" y1="4" x2="12" y2="12"/>
                <line x1="12" y1="4" x2="4" y2="12"/>
              </svg>
            </button>
          )}
        </div>
      </div>

      <div className={styles.list}>
        {filtered.length === 0 && searchQuery.trim() !== '' ? (
          <div className={styles.emptyState}>
            <p className={styles.emptyTitle}>{t('sidebar.noConversationsMatch')}</p>
            <p className={styles.emptySubtitle}>"{searchQuery}"</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className={styles.emptyState}>
            <p className={styles.emptyTitle}>{t('sidebar.noConversationsYet')}</p>
            <p className={styles.emptySubtitle}>{t('sidebar.startChatHint')}</p>
          </div>
        ) : (
          filtered.map(conv => (
            <ConversationItem key={conv.id} conversation={conv} />
          ))
        )}
      </div>

      {/* Footer: user menu (avatar click -> logout/language) + theme + version */}
      {user && (
        <div className={styles.footer}>
          <UserMenu />
          <span className={styles.footerName}>{user.username}</span>
          <span className={styles.versionLabel} title={`Build ${__APP_VERSION__}`}>
            v{__APP_VERSION__}
          </span>
          <ThemeToggle />
        </div>
      )}

      {showNewChat && <NewChatModal onClose={() => setShowNewChat(false)} />}
      {showNewGroup && <NewGroupModal onClose={() => setShowNewGroup(false)} />}
    </div>
  );
}
