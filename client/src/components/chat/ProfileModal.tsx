import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { uploadFile } from '../../lib/api';
import { useTranslation } from '../../lib/i18n';
import { Avatar } from '../common/Avatar';
import { UploadStrip } from './UploadStrip';
import styles from './ProfileModal.module.css';
import type { UploadState } from '../../types/chat';

interface ProfileModalProps {
  onClose: () => void;
}

export function ProfileModal({ onClose }: ProfileModalProps) {
  const { user, updateProfile } = useAuth();
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState(user?.profile_status ?? '');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(user?.avatar_url ?? null);
  const [uploadState, setUploadState] = useState<UploadState>({ status: 'idle' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    setStatus(user.profile_status ?? '');
    setAvatarUrl(user.avatar_url ?? null);
  }, [user]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  if (!user) return null;

  const handleAvatarFileSelect = async (file: File) => {
    if (file.size > 25 * 1024 * 1024) {
      setUploadState({ status: 'error', file, message: t('file.tooLarge') });
      return;
    }

    const abortController = new AbortController();
    setUploadState({ status: 'uploading', file, progress: 0, abortController });

    try {
      const result = await uploadFile(
        file,
        (progress) => {
          setUploadState(prev =>
            prev.status === 'uploading' ? { ...prev, progress } : prev
          );
        },
        abortController.signal,
      );
      const nextAvatarUrl = `/api/files/${result.id}`;
      setAvatarUrl(nextAvatarUrl);
      setUploadState({ status: 'ready', file, fileId: result.id, thumbnailUrl: result.thumbnail_url ?? undefined });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        setUploadState({ status: 'idle' });
        return;
      }
      setUploadState({
        status: 'error',
        file,
        message: error instanceof Error ? error.message : t('file.avatarUploadFailed'),
      });
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateProfile({
        avatar_url: avatarUrl,
        profile_status: status.trim() || null,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={styles.overlay} onClick={(event) => event.target === event.currentTarget && onClose()}>
      <div className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="profile-modal-title">
        <div className={styles.header}>
          <div>
            <h2 id="profile-modal-title" className={styles.title}>{t('profile.title')}</h2>
            <p className={styles.subtitle}>{t('profile.subtitle')}</p>
          </div>
          <button type="button" className={styles.closeButton} onClick={onClose} aria-label={t('common.cancel')}>
            ×
          </button>
        </div>

        <div className={styles.hero}>
          <button type="button" className={styles.avatarButton} onClick={() => fileInputRef.current?.click()}>
            <Avatar name={user.username} avatarUrl={avatarUrl} size="lg" />
            <span className={styles.avatarOverlay}>{t('profile.changeAvatar')}</span>
          </button>
          <div className={styles.identity}>
            <strong className={styles.username}>{user.username}</strong>
            <span className={styles.email}>{user.email}</span>
          </div>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void handleAvatarFileSelect(file);
            event.currentTarget.value = '';
          }}
        />

        {uploadState.status !== 'idle' && (
          <UploadStrip
            uploadState={uploadState}
            onCancel={() => {
              if (uploadState.status === 'uploading') {
                uploadState.abortController.abort();
              }
              setUploadState({ status: 'idle' });
            }}
            onRetry={() => {
              if (uploadState.status === 'error') {
                void handleAvatarFileSelect(uploadState.file);
              }
            }}
          />
        )}

        <label className={styles.field}>
          <span className={styles.label}>{t('profile.status')}</span>
          <textarea
            className={styles.textarea}
            value={status}
            onChange={(event) => setStatus(event.target.value.slice(0, 140))}
            rows={3}
            placeholder={t('profile.statusPlaceholder')}
          />
        </label>

        <div className={styles.footer}>
          <button type="button" className={styles.ghostButton} onClick={() => setAvatarUrl(null)}>
            {t('profile.removeAvatar')}
          </button>
          <div className={styles.footerActions}>
            <button type="button" className={styles.secondaryButton} onClick={onClose}>
              {t('common.cancel')}
            </button>
            <button
              type="button"
              className={styles.primaryButton}
              onClick={() => void handleSave()}
              disabled={saving || uploadState.status === 'uploading'}
            >
              {saving ? t('profile.saving') : t('common.save')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
