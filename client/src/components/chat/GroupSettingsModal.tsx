import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useChat } from '../../contexts/ChatContext';
import { useAuth } from '../../contexts/AuthContext';
import { useTranslation } from '../../lib/i18n';
import { apiFetch, uploadFile } from '../../lib/api';
import {
  AVATAR_CROP_FRAME_SIZE,
  clampCropOffset,
  createAvatarCropSource,
  renderCroppedAvatar,
  type AvatarCropSource,
} from '../../lib/avatarCrop';
import { Avatar } from '../common/Avatar';
import { AvatarFullscreenPreview } from './AvatarFullscreenPreview';
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
  const [cropSource, setCropSource] = useState<AvatarCropSource | null>(null);
  const [cropZoom, setCropZoom] = useState(1);
  const [cropOffset, setCropOffset] = useState({ x: 0, y: 0 });
  const [isCropping, setIsCropping] = useState(false);
  const [showAvatarPreview, setShowAvatarPreview] = useState(false);
  const avatarFileInputRef = useRef<HTMLInputElement>(null);
  const dragStateRef = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null);

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

  useEffect(() => {
    return () => {
      if (cropSource?.url) URL.revokeObjectURL(cropSource.url);
    };
  }, [cropSource?.url]);

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

  const handleAvatarFileSelect = async (file: File) => {
    if (file.size > 25 * 1024 * 1024) {
      setAvatarUploadState({ status: 'error', file, message: t('file.tooLarge') });
      return;
    }

    try {
      const nextCropSource = await createAvatarCropSource(file);
      setCropZoom(1);
      setCropOffset({ x: 0, y: 0 });
      setCropSource(nextCropSource);
    } catch {
      setAvatarUploadState({ status: 'error', file, message: t('file.avatarUploadFailed') });
    }
  };

  const uploadGroupAvatarFile = async (file: File) => {
    const abortController = new AbortController();
    setAvatarUploadState({ status: 'uploading', file, progress: 0, abortController });

    try {
      const result = await uploadFile(
        file,
        (progress) => setAvatarUploadState(prev =>
          prev.status === 'uploading' ? { ...prev, progress } : prev
        ),
        abortController.signal,
      );
      const avatarUrl = `/api/files/${result.id}`;
      const patchRes = await apiFetch(`/api/conversations/${conversation.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ avatar_url: avatarUrl }),
      });
      if (!patchRes.ok) throw new Error('Failed to update avatar');

      const updatedConversation = await patchRes.json() as Conversation;
      // Optimistic update of local display
      setLocalAvatarUrl(avatarUrl);
      dispatch({ type: 'CONVERSATION_UPDATED', conversation: updatedConversation });
      setAvatarUploadState({ status: 'idle' });
      // WS conversation:updated broadcast will update ChatContext state
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        setAvatarUploadState({ status: 'idle' });
        return;
      }
      setAvatarUploadState({ status: 'error', file, message: t('file.avatarUploadFailed') });
    }
  };

  const handleCropPointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!cropSource) return;

    event.currentTarget.setPointerCapture?.(event.pointerId);
    dragStateRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      originX: cropOffset.x,
      originY: cropOffset.y,
    };

    const imageWidth = cropSource.width;
    const imageHeight = cropSource.height;
    const zoom = cropZoom;

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const drag = dragStateRef.current;
      if (!drag) return;
      setCropOffset(clampCropOffset(
        imageWidth,
        imageHeight,
        zoom,
        {
          x: drag.originX + moveEvent.clientX - drag.startX,
          y: drag.originY + moveEvent.clientY - drag.startY,
        },
      ));
    };

    const stopDragging = () => {
      dragStateRef.current = null;
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', stopDragging);
      window.removeEventListener('pointercancel', stopDragging);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', stopDragging, { once: true });
    window.addEventListener('pointercancel', stopDragging, { once: true });
  }, [cropOffset.x, cropOffset.y, cropSource, cropZoom]);

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
        const updatedConversation = await res.json() as Conversation;
        dispatch({ type: 'CONVERSATION_UPDATED', conversation: updatedConversation });
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
        const updatedConversation = await res.json() as Conversation;
        dispatch({ type: 'CONVERSATION_UPDATED', conversation: updatedConversation });
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
        dispatch({ type: 'CONVERSATION_REMOVED', conversationId: conversation.id });
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
  const cropPreviewScale = cropSource
    ? Math.max(AVATAR_CROP_FRAME_SIZE / cropSource.width, AVATAR_CROP_FRAME_SIZE / cropSource.height) * cropZoom
    : 1;
  const sortedParticipants = useMemo(
    () => [...conversation.participants].sort((a, b) => {
      if (a.is_admin !== b.is_admin) return a.is_admin ? -1 : 1;
      if (a.user_id === currentUserId && b.user_id !== currentUserId) return -1;
      if (b.user_id === currentUserId && a.user_id !== currentUserId) return 1;
      const byName = a.username.localeCompare(b.username, undefined, { sensitivity: 'base' });
      return byName || a.user_id.localeCompare(b.user_id);
    }),
    [conversation.participants, currentUserId]
  );

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
          <button
            type="button"
            className={styles.avatarWrapper}
            onClick={() => setShowAvatarPreview(true)}
            aria-label={t('chat.openAvatar')}
          >
            <Avatar
              name={groupDisplayName}
              size="lg"
              avatarUrl={localAvatarUrl}
              kind="group"
            />
          </button>

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
                if (file) void handleAvatarFileSelect(file);
                e.target.value = '';
              }}
            />
          )}

          {isAdmin && (
            <button
              type="button"
              className={styles.avatarChangeButton}
              onClick={() => avatarFileInputRef.current?.click()}
            >
              {t('group.changeAvatar')}
            </button>
          )}

          {/* Avatar upload progress strip */}
          {avatarUploadState.status !== 'idle' && (
            <UploadStrip
              uploadState={avatarUploadState as Exclude<UploadState, { status: 'idle' }>}
              onCancel={() => {
                if (avatarUploadState.status === 'uploading') avatarUploadState.abortController.abort();
                setAvatarUploadState({ status: 'idle' });
              }}
              onRetry={() => {
                if (avatarUploadState.status === 'error') void handleAvatarFileSelect(avatarUploadState.file);
              }}
            />
          )}

          {cropSource && (
            <div className={styles.cropCard}>
              <div className={styles.cropHeader}>
                <strong>{t('profile.cropAvatar')}</strong>
              </div>
              <div
                className={styles.cropViewport}
                onPointerDown={handleCropPointerDown}
              >
                <img
                  src={cropSource.url}
                  alt={t('profile.cropAvatar')}
                  className={styles.cropImage}
                  style={{
                    width: cropSource.width,
                    height: cropSource.height,
                    transform: `translate(-50%, -50%) translate(${cropOffset.x}px, ${cropOffset.y}px) scale(${cropPreviewScale})`,
                  }}
                  draggable={false}
                />
              </div>
              <label className={styles.zoomField}>
                <span>{t('profile.zoom')}</span>
                <input
                  type="range"
                  min="1"
                  max="3"
                  step="0.01"
                  value={cropZoom}
                  onChange={(event) => {
                    const nextZoom = Number(event.target.value);
                    setCropZoom(nextZoom);
                    setCropOffset(current => clampCropOffset(cropSource.width, cropSource.height, nextZoom, current));
                  }}
                />
              </label>
              <div className={styles.cropActions}>
                <button
                  type="button"
                  className={styles.cancelRenameButton}
                  onClick={() => {
                    URL.revokeObjectURL(cropSource.url);
                    setCropSource(null);
                  }}
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="button"
                  className={styles.saveButton}
                  disabled={isCropping}
                  onClick={async () => {
                    setIsCropping(true);
                    try {
                      const croppedFile = await renderCroppedAvatar(cropSource.file, cropZoom, cropOffset);
                      URL.revokeObjectURL(cropSource.url);
                      setCropSource(null);
                      await uploadGroupAvatarFile(croppedFile);
                    } finally {
                      setIsCropping(false);
                    }
                  }}
                >
                  {isCropping ? t('profile.saving') : t('profile.applyCrop')}
                </button>
              </div>
            </div>
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
            {sortedParticipants.map(participant => (
              <li key={participant.user_id} className={styles.memberRow}>
                <Avatar name={participant.username} avatarUrl={participant.avatar_url} size="sm" />
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

        {/* Leave group */}
        {currentUserParticipant && (
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
      {showAvatarPreview && (
        <AvatarFullscreenPreview
          name={groupDisplayName}
          avatarUrl={localAvatarUrl}
          kind="group"
          subtitle={t('chat.groupChat')}
          onClose={() => setShowAvatarPreview(false)}
        />
      )}
    </div>
  );
}
