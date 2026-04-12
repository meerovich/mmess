import { useState, useEffect, useRef } from 'react';
import { useChat } from '../../contexts/ChatContext';
import { useTranslation } from '../../lib/i18n';
import { apiFetch } from '../../lib/api';
import { Avatar } from '../common/Avatar';
import styles from './NewGroupModal.module.css';

interface UserResult {
  id: string;
  username: string;
  email: string;
  avatar_url: string | null;
}

interface SelectedUser {
  id: string;
  username: string;
}

interface NewGroupModalProps {
  onClose: () => void;
}

export function NewGroupModal({ onClose }: NewGroupModalProps) {
  const { dispatch } = useChat();
  const { t } = useTranslation();
  const [groupName, setGroupName] = useState('');
  const [selectedUsers, setSelectedUsers] = useState<SelectedUser[]>([]);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<UserResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);

  // Focus name input on mount
  useEffect(() => {
    nameInputRef.current?.focus();
  }, []);

  // Escape closes modal
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Debounced user search — 300ms
  useEffect(() => {
    if (query.length < 2) {
      setResults([]);
      return;
    }
    setIsSearching(true);
    const timer = setTimeout(() => {
      apiFetch(`/api/users?q=${encodeURIComponent(query)}&limit=20`)
        .then(res => res.ok ? res.json() : { users: [] })
        .then((data: { users: UserResult[] }) => {
          // Filter out already-selected users
          const selectedIds = new Set(selectedUsers.map(u => u.id));
          setResults((data.users ?? []).filter((u: UserResult) => !selectedIds.has(u.id)));
        })
        .catch(() => setResults([]))
        .finally(() => setIsSearching(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [query, selectedUsers]);

  function addUser(user: UserResult) {
    setSelectedUsers(prev => [...prev, { id: user.id, username: user.username }]);
    setQuery('');
    setResults([]);
  }

  function removeUser(userId: string) {
    setSelectedUsers(prev => prev.filter(u => u.id !== userId));
  }

  const canCreate = groupName.trim().length > 0 && selectedUsers.length > 0;

  async function handleCreate() {
    if (!canCreate || isCreating) return;
    setIsCreating(true);
    try {
      const res = await apiFetch('/api/conversations', {
        method: 'POST',
        body: JSON.stringify({
          type: 'group',
          name: groupName.trim(),
          participant_ids: selectedUsers.map(u => u.id),
        }),
      });
      if (res.ok) {
        const conversation = await res.json();
        dispatch({ type: 'UPSERT_CONVERSATION', conversation });
        dispatch({ type: 'SET_ACTIVE_CONVERSATION', conversationId: conversation.id });
        onClose();
      }
    } finally {
      setIsCreating(false);
    }
  }

  function handleOverlayClick(e: React.MouseEvent) {
    if (e.target === e.currentTarget) onClose();
  }

  // Focus trap
  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key !== 'Tab') return;
    const modal = e.currentTarget as HTMLElement;
    const focusable = modal.querySelectorAll<HTMLElement>(
      'button, input, [tabindex]:not([tabindex="-1"])'
    );
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey) {
      if (document.activeElement === first) { e.preventDefault(); last.focus(); }
    } else {
      if (document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  }

  return (
    <div className={styles.overlay} onClick={handleOverlayClick}>
      <div
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-group-title"
        onKeyDown={handleKeyDown}
      >
        <h2 id="new-group-title" className={styles.title}>{t('newGroup.title')}</h2>

        <input
          ref={nameInputRef}
          className={styles.input}
          type="text"
          placeholder={t('newGroup.namePlaceholder')}
          value={groupName}
          onChange={e => setGroupName(e.target.value.slice(0, 100))}
          maxLength={100}
          aria-label={t('newGroup.namePlaceholder')}
        />

        {selectedUsers.length > 0 && (
          <div className={styles.chips}>
            {selectedUsers.map(user => (
              <span key={user.id} className={styles.chip}>
                {user.username}
                <button
                  className={styles.chipRemove}
                  onClick={() => removeUser(user.id)}
                  aria-label={t('newGroup.removeMember', { name: user.username })}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}

        <input
          className={styles.input}
          type="text"
          placeholder={t('newGroup.addMembersPlaceholder')}
          value={query}
          onChange={e => setQuery(e.target.value)}
          aria-label={t('newGroup.searchUsers')}
        />

        {isSearching && <p className={styles.statusText}>{t('newGroup.searching')}</p>}

        {!isSearching && query.length >= 2 && results.length === 0 && (
          <div className={styles.emptyState}>
            <p className={styles.emptyTitle}>{t('newGroup.noUsersFound')}</p>
            <p className={styles.emptySubtitle}>{t('newGroup.tryDifferent')}</p>
          </div>
        )}

        {results.length > 0 && (
          <ul className={styles.results} role="listbox">
            {results.map(user => (
              <li key={user.id} role="option" aria-selected={false}>
                <button
                  className={styles.resultItem}
                  onClick={() => addUser(user)}
                >
                  <Avatar name={user.username} size="sm" />
                  <span className={styles.username}>{user.username}</span>
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className={styles.footer}>
          <button className={styles.cancelButton} onClick={onClose}>
            {t('newGroup.cancel')}
          </button>
          <button
            className={styles.createButton}
            onClick={handleCreate}
            disabled={!canCreate || isCreating}
          >
            {t('newGroup.create')}
          </button>
        </div>
      </div>
    </div>
  );
}
