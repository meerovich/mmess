import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { uploadFile } from '../../lib/api';
import {
  AVATAR_CROP_FRAME_SIZE,
  clampCropOffset,
  createAvatarCropSource,
  renderCroppedAvatar,
  type AvatarCropSource,
} from '../../lib/avatarCrop';
import { useTranslation } from '../../lib/i18n';
import { Avatar } from '../common/Avatar';
import { AvatarFullscreenPreview } from './AvatarFullscreenPreview';
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
  const [cropSource, setCropSource] = useState<AvatarCropSource | null>(null);
  const [cropZoom, setCropZoom] = useState(1);
  const [cropOffset, setCropOffset] = useState({ x: 0, y: 0 });
  const [isCropping, setIsCropping] = useState(false);
  const [showAvatarPreview, setShowAvatarPreview] = useState(false);
  const dragStateRef = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null);

  useEffect(() => {
    if (!user) return;
    setStatus(user.profile_status ?? '');
    setAvatarUrl(user.avatar_url ?? null);
  }, [user]);

  useEffect(() => {
    return () => {
      if (cropSource?.url) URL.revokeObjectURL(cropSource.url);
    };
  }, [cropSource?.url]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  if (!user) return null;

  const cropPreviewScale = cropSource
    ? Math.max(AVATAR_CROP_FRAME_SIZE / cropSource.width, AVATAR_CROP_FRAME_SIZE / cropSource.height) * cropZoom
    : 1;

  const handleAvatarFileSelect = async (file: File) => {
    if (file.size > 25 * 1024 * 1024) {
      setUploadState({ status: 'error', file, message: t('file.tooLarge') });
      return;
    }
    try {
      const nextCropSource = await createAvatarCropSource(file);
      setCropZoom(1);
      setCropOffset({ x: 0, y: 0 });
      setCropSource(nextCropSource);
    } catch {
      setUploadState({ status: 'error', file, message: t('file.avatarUploadFailed') });
    }
  };

  const uploadAvatarFile = async (file: File) => {
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

  useEffect(() => () => {
    dragStateRef.current = null;
  }, []);

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
          <button
            type="button"
            className={styles.avatarButton}
            onClick={() => setShowAvatarPreview(true)}
            aria-label={t('chat.openAvatar')}
          >
            <Avatar name={user.username} avatarUrl={avatarUrl} size="lg" />
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
                className={styles.secondaryButton}
                onClick={() => {
                  URL.revokeObjectURL(cropSource.url);
                  setCropSource(null);
                }}
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                className={styles.primaryButton}
                disabled={isCropping}
                onClick={async () => {
                  setIsCropping(true);
                  try {
                    const croppedFile = await renderCroppedAvatar(cropSource.file, cropZoom, cropOffset);
                    URL.revokeObjectURL(cropSource.url);
                    setCropSource(null);
                    await uploadAvatarFile(croppedFile);
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
          <div className={`${styles.footerActions} ${styles.avatarActions}`}>
            <button type="button" className={styles.ghostButton} onClick={() => fileInputRef.current?.click()}>
              {t('profile.changeAvatar')}
            </button>
            <button type="button" className={styles.ghostButton} onClick={() => setAvatarUrl(null)}>
              {t('profile.removeAvatar')}
            </button>
          </div>
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
      {showAvatarPreview && (
        <AvatarFullscreenPreview
          name={user.username}
          avatarUrl={avatarUrl}
          subtitle={user.email}
          onClose={() => setShowAvatarPreview(false)}
        />
      )}
    </div>
  );
}
