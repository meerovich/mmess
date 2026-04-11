import { useState, useEffect, useRef } from 'react';
import { useChat } from '../../contexts/ChatContext';
import { apiFetch } from '../../lib/api';
import { Avatar } from '../common/Avatar';
import styles from './NewChatModal.module.css';

interface UserResult {
  id: string;
  username: string;
  email: string;
  avatar_url: string | null;
}

interface NewChatModalProps {
  onClose: () => void;
}

export function NewChatModal({ onClose }: NewChatModalProps) {
  const { dispatch } = useChat();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<UserResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Escape closes modal
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Debounced search — 300ms
  useEffect(() => {
    if (query.length < 2) {
      setResults([]);
      return;
    }
    setIsSearching(true);
    const timer = setTimeout(() => {
      apiFetch(`/api/users?q=${encodeURIComponent(query)}&limit=20`)
        .then(res => res.ok ? res.json() : { users: [] })
        .then((data: { users: UserResult[] }) => setResults(data.users ?? []))
        .catch(() => setResults([]))
        .finally(() => setIsSearching(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  async function handleSelectUser(user: UserResult) {
    if (isCreating) return;
    setIsCreating(true);
    try {
      const res = await apiFetch('/api/conversations', {
        method: 'POST',
        body: JSON.stringify({ type: 'direct', participant_ids: [user.id] }),
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
        aria-labelledby="new-chat-title"
        onKeyDown={handleKeyDown}
      >
        <h2 id="new-chat-title" className={styles.title}>New chat</h2>
        <input
          ref={inputRef}
          className={styles.searchInput}
          type="text"
          placeholder="Search by name or email..."
          value={query}
          onChange={e => setQuery(e.target.value)}
          aria-label="Search users"
        />

        {isSearching && <p className={styles.statusText}>Searching...</p>}

        {!isSearching && query.length >= 2 && results.length === 0 && (
          <div className={styles.emptyState}>
            <p className={styles.emptyTitle}>No users found</p>
            <p className={styles.emptySubtitle}>Try a different name or email.</p>
          </div>
        )}

        {results.length > 0 && (
          <ul className={styles.results} role="listbox">
            {results.map(user => (
              <li key={user.id} role="option" aria-selected={false}>
                <button
                  className={styles.resultItem}
                  onClick={() => handleSelectUser(user)}
                  disabled={isCreating}
                >
                  <Avatar name={user.username} size="sm" />
                  <span className={styles.username}>{user.username}</span>
                  <span className={styles.openChat}>Open chat</span>
                </button>
              </li>
            ))}
          </ul>
        )}

        <button className={styles.cancelButton} onClick={onClose}>
          Cancel
        </button>
      </div>
    </div>
  );
}
