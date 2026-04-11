import { useState, useRef, useEffect } from 'react';
import { useChat } from '../../contexts/ChatContext';
import { useAuth } from '../../contexts/AuthContext';
import { ConversationItem } from './ConversationItem';
import { NewChatModal } from './NewChatModal';
import { NewGroupModal } from './NewGroupModal';
import { Avatar } from '../common/Avatar';
import { ThemeToggle } from '../common/ThemeToggle';
import styles from './ConversationList.module.css';

export function ConversationList() {
  const { state } = useChat();
  const { user } = useAuth();
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
            aria-label="New chat"
          >
            New chat
          </button>
          <button
            className={styles.actionButton}
            onClick={() => setShowNewGroup(true)}
            aria-label="New group"
          >
            New group
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
            placeholder="Search conversations\u2026"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            aria-label="Search conversations"
          />
          {searchQuery.length > 0 && (
            <button
              type="button"
              className={styles.clearBtn}
              onClick={() => setSearchQuery('')}
              aria-label="Clear search"
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
            <p className={styles.emptyTitle}>No conversations match</p>
            <p className={styles.emptySubtitle}>"{searchQuery}"</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className={styles.emptyState}>
            <p className={styles.emptyTitle}>No conversations yet</p>
            <p className={styles.emptySubtitle}>Start a chat with a friend to get started.</p>
          </div>
        ) : (
          filtered.map(conv => (
            <ConversationItem key={conv.id} conversation={conv} />
          ))
        )}
      </div>

      {/* Footer: current user info + theme toggle (D-06) */}
      {user && (
        <div className={styles.footer}>
          <Avatar name={user.username} size="sm" />
          <span className={styles.footerName}>{user.username}</span>
          <ThemeToggle />
        </div>
      )}

      {showNewChat && <NewChatModal onClose={() => setShowNewChat(false)} />}
      {showNewGroup && <NewGroupModal onClose={() => setShowNewGroup(false)} />}
    </div>
  );
}
