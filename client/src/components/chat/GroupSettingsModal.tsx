import { useState, useEffect, useRef } from 'react';
import { useChat } from '../../contexts/ChatContext';
import { useAuth } from '../../contexts/AuthContext';
import { useTranslation } from '../../lib/i18n';
import { apiFetch, uploadFile } from '../../lib/api';
import { Avatar } from '../common/Avatar';
import { UploadStrip } from './UploadStrip';
import type { Conversation, UploadState } from '../../types/chat';
import styles from './GroupSettingsModal.module.css';

interface UserResult {
  id: string;
  username: string;
  email: string;
  avatar_url: string | null;
}

interface GroupSettingsModalProps {
  conversation: Conversation;
  onClose: () => void;
}

export function GroupSettingsModal({ conversation, onClose }: GroupSettingsModalProps) {
  const { dispatch } = useChat();
  const { user } = useAuth();
  const { t } = useTranslation();
  const currentUserId = user?.id ?? '';

  const currentUserParticipant = conversation.participants.find(p => p.user_id === currentUserId);
  const isAdmin = currentUserParticipant?.is_admin ?? false;

  // Rename state
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(conversation.name ?? '');
  const [isSavingRename, setIsSavingRename] = useState(false);
  const [renameError, setRenameError] = useState('');
  const renameInputRef = useRef<HTMLInputElement>(null);

  // Add members state
  const [showAddMembers, setShowAddMembers] = useState(false);
  const [addQuery, setAddQuery] = useState('');
  const [addResults, setAddResults] = useState<UserResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [addError, setAddError] = useState('');

  // Remove member state
  const [removingUserId, setRemovingUserId] = useState<string | null>(null);
  const [removeErrors, setRemoveErrors] = useState<Record<string, string>>({});

  // Permission toggle state
  const [permErrors, setPermErrors] = useState<Record<string, string>>({});

  // Leave group state
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);
  const [leaveError, setLeaveError] = useState('');

  // Avatar upload state
  const [avatarUploadState, setAvatarUploadState] = useState<UploadState>({ status: 'idle' });
  const [localAvatarUrl, setLocalAvatarUrl] = useState<string | null>(conversation.avatar_url ?? null);
  const avatarFileInputRef = useRef<HTMLInputElement>(null);

  // Focus rename input when editing starts
  useEffect(() => {
    if (isRenaming) {
      renameInputRef.current?.focus();
    }
  }, [isRenaming]);

  // Escape closes modal (unless renaming — Escape cancels rename instead)
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        if (isRenaming) {
          setIsRenaming(false);
          setRenameValue(conversation.name ?? '');
          setRenameError('');
        } else {
          onClose();
        }
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose, isRenaming, conversation.name]);

  // Sync rename value when conversation updates from WS
  useEffect(() => {
    if (!isRenaming) {
      setRenameValue(conversation.name ?? '');
    }
  }, [conversation.name, isRenaming]);

  // Sync localAvatarUrl when conversation updates from WS
  useEffect(() => {
    setLocalAvatarUrl(conversation.avatar_url ?? null);
  }, [conversation.avatar_url]);

  // Debounced user search for add members
  useEffect(() => {
    if (!showAddMembers || addQuery.length < 2) {
      setAddResults([]);
      return;
    }
    setIsSearching(true);
    const timer = setTimeout(() => {
      const existingIds = new Set(conversation.participants.map(p => p.user_id));
      apiFetch(`/api/users?q=${encodeURIComponent(addQuery)}&limit=20`)
        .then(res => res.ok ? res.json() : { users: [] })
        .then((data: { users: UserResult[] }) => {
          setAddResults((data.users ?? []).filter((u: UserResult) => !existingIds.has(u.id)));
        })
        .catch(() => setAddResults([]))
        .finally(() => setIsSearching(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [addQuery, showAddMembers, conversation.participants]);

  function handleOverlayClick(e: React.MouseEvent) {
    if (e.target === e.currentTarget) onClose();
  }

  // Focus trap
  function handleKeyDownTrap(e: React.KeyboardEvent) {
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

  const handleAvatarFileSelect = (file: File) => {
    if (file.size > 25 * 1024 * 1024) {
      setAvatarUploadState({ status: 'error', file, message: t('file.tooLarge') });
      return;
    }

    const abortController = new AbortController();
    setAvatarUploadState({ status: 'uploading', file, progress: 0, abortController });

    uploadFile(
      file,
      (progress) => setAvatarUploadState(prev =>
        prev.status === 'uploading' ? { ...prev, progress } : prev
      ),
      abortController.signal,
    ).then(async (result) => {
      const avatarUrl = `/api/files/${result.id}`;
      // PATCH the conversation — endpoint already exists from Phase 4
      const patchRes = await apiFetch(`/api/conversations/${conversation.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ avatar_url: avatarUrl }),
      });
      if (!patchRes.ok) throw new Error('Failed to update avatar');

      // Optimistic update of local display
      setLocalAvatarUrl(avatarUrl);
      setAvatarUploadState({ status: 'idle' });
      // WS conversation:updated broadcast will update ChatContext state
    }).catch((err: Error) => {
      if (err.name === 'AbortError') {
        setAvatarUploadState({ status: 'idle' });
        return;
      }
      setAvatarUploadState({ status: 'error', file, message: t('file.avatarUploadFailed') });
    });
  };

  async function handleRenameSubmit() {
    const trimmed = renameValue.trim();
    if (!trimmed || trimmed === conversation.name) {
      setIsRenaming(false);
      return;
    }
    setIsSavingRename(true);
    setRenameError('');
    try {
      const res = await apiFetch(`/api/conversations/${conversation.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: trimmed }),
      });
      if (res.ok) {
        setIsRenaming(false);
        // CONVERSATION_UPDATED WS event will refresh the modal automatically
      } else {
        const err = await res.json().catch(() => ({}));
        setRenameError((err as { error?: string }).error ?? t('group.failedToRename'));
      }
    } catch {
      setRenameError(t('group.networkError'));
    } finally {
      setIsSavingRename(false);
    }
  }

  function handleRenameKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleRenameSubmit();
    }
    // Escape handled by document listener
  }

  async function handleAddMember(memberUser: UserResult) {
    setAddError('');
    try {
      const res = await apiFetch(`/api/conversations/${conversation.id}/participants`, {
        method: 'POST',
        body: JSON.stringify({ user_ids: [memberUser.id] }),
      });
      if (res.ok) {
        setAddQuery('');
        setAddResults([]);
        // CONVERSATION_UPDATED WS event will refresh state
      } else {
        const err = await res.json().catch(() => ({}));
        setAddError((err as { error?: string }).error ?? t('group.failedToAdd'));
      }
    } catch {
      setAddError(t('group.networkError'));
    }
  }

  async function handleRemoveMember(userId: string) {
    setRemovingUserId(userId);
    setRemoveErrors(prev => ({ ...prev, [userId]: '' }));
    try {
      const res = await apiFetch(`/api/conversations/${conversation.id}/participants/${userId}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setRemoveErrors(prev => ({ ...prev, [userId]: (err as { error?: string }).error ?? t('group.failedToRemove') }));
      }
      // On success, CONVERSATION_UPDATED WS event refreshes the list
    } catch {
      setRemoveErrors(prev => ({ ...prev, [userId]: t('group.networkError') }));
    } finally {
      setRemovingUserId(null);
    }
  }

  async function handleToggleCanEdit(userId: string, currentValue: boolean) {
    setPermErrors(prev => ({ ...prev, [userId]: '' }));
    try {
      const res = await apiFetch(`/api/conversations/${conversation.id}/participants/${userId}`, {
        method: 'PATCH',
        body: JSON.stringify({ can_edit_messages: !currentValue }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setPermErrors(prev => ({ ...prev, [userId]: (err as { error?: string }).error ?? t('group.failedToUpdate') }));
      }
      // On success, CONVERSATION_UPDATED WS event refreshes the member list
    } catch {
      setPermErrors(prev => ({ ...prev, [userId]: t('group.networkError') }));
    }
  }

  async function handleLeaveGroup() {
    setIsLeaving(true);
    setLeaveError('');
    try {
      const res = await apiFetch(`/api/conversations/${conversation.id}/me`, {
        method: 'DELETE',
      });
      if (res.ok || res.status === 204) {
        dispatch({ type: 'SET_ACTIVE_CONVERSATION', conversationId: null });
        onClose();
      } else {
        const err = await res.json().catch(() => ({}));
        setLeaveError((err as { error?: string }).error ?? t('group.failedToLeave'));
      }
    } catch {
      setLeaveError(t('group.networkError'));
    } finally {
      setIsLeaving(false);
    }
  }

  const groupDisplayName = conversation.name ?? t('chat.groupChat');

  return (
    <div className={styles.overlay} onClick={handleOverlayClick}>
      <div
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby="group-settings-title"
        onKeyDown={handleKeyDownTrap}
      >
        {/* Header */}
        <div className={styles.modalHeader}>
          <h2 id="group-settings-title" className={styles.title}>{t('group.settings')}</h2>
          <button className={styles.closeButton} onClick={onClose} aria-label={t('group.closeSettings')}>
            ×
          </button>
        </div>

        {/* About section */}
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>{t('group.about')}</h3>

          {/* Avatar upload area */}
          <div
            className={styles.avatarWrapper}
            onClick={isAdmin ? () => avatarFileInputRef.current?.click() : undefined}
          >
            <Avatar
              name={groupDisplayName}
              size="lg"
              avatarUrl={localAvatarUrl}
            />

            {/* Hidden file input — images only */}
            {isAdmin && (
              <input
                ref={avatarFileInputRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                aria-label={t('group.changeAvatar')}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleAvatarFileSelect(file);
                  e.target.value = '';
                }}
              />
            )}

            {/* Hover overlay for admin */}
            {isAdmin && (
              <div className={`${styles.avatarOverlay} ${!localAvatarUrl ? styles.avatarOverlayVisible : ''}`}>
                {t('group.change')}
              </div>
            )}
          </div>

          {/* Avatar upload progress strip */}
          {avatarUploadState.status !== 'idle' && (
            <UploadStrip
              uploadState={avatarUploadState as Exclude<UploadState, { status: 'idle' }>}
              onCancel={() => {
                if (avatarUploadState.status === 'uploading') avatarUploadState.abortController.abort();
                setAvatarUploadState({ status: 'idle' });
              }}
              onRetry={() => {
                if (avatarUploadState.status === 'error') handleAvatarFileSelect(avatarUploadState.file);
              }}
            />
          )}

          <div className={styles.aboutRow}>
            {isAdmin && !isRenaming ? (
              <button
                className={styles.groupNameButton}
                onClick={() => { setIsRenaming(true); setRenameValue(conversation.name ?? ''); }}
                aria-label={t('group.renameGroup')}
                title={t('group.clickToRename')}
              >
                {groupDisplayName}
                <span className={styles.editHint}>{t('chat.edit')}</span>
              </button>
            ) : isAdmin && isRenaming ? (
              <div className={styles.renameRow}>
                <input
                  ref={renameInputRef}
                  className={styles.renameInput}
                  type="text"
                  value={renameValue}
                  onChange={e => setRenameValue(e.target.value.slice(0, 100))}
                  onKeyDown={handleRenameKeyDown}
                  disabled={isSavingRename}
                  maxLength={100}
                  aria-label={t('group.groupName')}
                />
                <button
                  className={styles.saveButton}
                  onClick={handleRenameSubmit}
                  disabled={isSavingRename || !renameValue.trim()}
                >
                  {t('group.save')}
                </button>
                <button
                  className={styles.cancelRenameButton}
                  onClick={() => { setIsRenaming(false); setRenameValue(conversation.name ?? ''); setRenameError(''); }}
                  disabled={isSavingRename}
                >
                  {t('group.cancel')}
                </button>
              </div>
            ) : (
              <span className={styles.groupNameReadOnly}>{groupDisplayName}</span>
            )}
          </div>
          {renameError && <p className={styles.errorText}>{renameError}</p>}
          <p className={styles.participantCount}>
            {t('group.membersCount', { count: String(conversation.participants.length) })}
          </p>
        </section>

        {/* Members section */}
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>{t('group.members')}</h3>
          <ul className={styles.memberList} role="list">
            {conversation.participants.map(participant => (
              <li key={participant.user_id} className={styles.memberRow}>
                <Avatar name={participant.username} size="sm" />
                <span className={styles.memberUsername}>{participant.username}</span>
                {participant.is_admin && (
                  <span className={styles.adminBadge}>{t('group.admin')}</span>
                )}
                {isAdmin && (
                  <label className={styles.checkboxLabel} title={t('group.canEditMessages')}>
                    <input
                      type="checkbox"
                      checked={participant.can_edit_messages}
                      disabled={participant.user_id === currentUserId}
                      onChange={() => handleToggleCanEdit(participant.user_id, participant.can_edit_messages)}
                      aria-label={t('group.allowEditMessages', { name: participant.username })}
                    />
                    <span className={styles.checkboxLabelText}>{t('group.editPermission')}</span>
                  </label>
                )}
                {isAdmin && participant.user_id !== currentUserId && (
                  <button
                    className={styles.removeButton}
                    onClick={() => handleRemoveMember(participant.user_id)}
                    disabled={removingUserId === participant.user_id}
                    aria-label={t('group.removeMember', { name: participant.username })}
                  >
                    {t('group.remove')}
                  </button>
                )}
                {removeErrors[participant.user_id] && (
                  <span className={styles.inlineError}>{removeErrors[participant.user_id]}</span>
                )}
                {permErrors[participant.user_id] && (
                  <span className={styles.inlineError}>{permErrors[participant.user_id]}</span>
                )}
              </li>
            ))}
          </ul>
        </section>

        {/* Add members (admin only) */}
        {isAdmin && (
          <section className={styles.section}>
            {!showAddMembers ? (
              <button
                className={styles.addMembersButton}
                onClick={() => { setShowAddMembers(true); setAddQuery(''); setAddResults([]); setAddError(''); }}
              >
                {t('group.addMembers')}
              </button>
            ) : (
              <div className={styles.addMembersPanel}>
                <input
                  className={styles.searchInput}
                  type="text"
                  placeholder={t('group.searchUsersToAdd')}
                  value={addQuery}
                  onChange={e => setAddQuery(e.target.value)}
                  autoFocus
                  aria-label={t('group.searchUsersToAdd')}
                />
                {isSearching && <p className={styles.statusText}>{t('group.searching')}</p>}
                {!isSearching && addQuery.length >= 2 && addResults.length === 0 && (
                  <p className={styles.statusText}>{t('group.noUsersFound')}</p>
                )}
                {addResults.length > 0 && (
                  <ul className={styles.searchResults} role="listbox">
                    {addResults.map(u => (
                      <li key={u.id} role="option" aria-selected={false}>
                        <button
                          className={styles.searchResultItem}
                          onClick={() => handleAddMember(u)}
                        >
                          <Avatar name={u.username} size="sm" />
                          <span>{u.username}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {addError && <p className={styles.errorText}>{addError}</p>}
                <button
                  className={styles.cancelRenameButton}
                  onClick={() => { setShowAddMembers(false); setAddQuery(''); setAddResults([]); setAddError(''); }}
                >
                  {t('group.cancel')}
                </button>
              </div>
            )}
          </section>
        )}

        {/* Leave group (non-admin only) */}
        {!isAdmin && (
          <section className={styles.section}>
            {!showLeaveConfirm ? (
              <button
                className={styles.leaveButton}
                onClick={() => setShowLeaveConfirm(true)}
              >
                {t('group.leaveGroup')}
              </button>
            ) : (
              <div className={styles.leaveConfirm}>
                <p className={styles.leaveConfirmText}>{t('group.leaveConfirm')}</p>
                <div className={styles.leaveConfirmActions}>
                  <button
                    className={styles.cancelRenameButton}
                    onClick={() => { setShowLeaveConfirm(false); setLeaveError(''); }}
                    disabled={isLeaving}
                  >
                    {t('group.cancel')}
                  </button>
                  <button
                    className={styles.leaveButton}
                    onClick={handleLeaveGroup}
                    disabled={isLeaving}
                  >
                    {isLeaving ? t('group.leaving') : t('group.confirmLeave')}
                  </button>
                </div>
                {leaveError && <p className={styles.errorText}>{leaveError}</p>}
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
