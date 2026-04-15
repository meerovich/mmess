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

const CROP_FRAME_SIZE = 220;

function clampCropOffset(
  imageWidth: number,
  imageHeight: number,
  zoom: number,
  offset: { x: number; y: number },
) {
  const baseScale = Math.max(CROP_FRAME_SIZE / imageWidth, CROP_FRAME_SIZE / imageHeight);
  const scaledWidth = imageWidth * baseScale * zoom;
  const scaledHeight = imageHeight * baseScale * zoom;
  const maxX = Math.max(0, (scaledWidth - CROP_FRAME_SIZE) / 2);
  const maxY = Math.max(0, (scaledHeight - CROP_FRAME_SIZE) / 2);

  return {
    x: Math.min(maxX, Math.max(-maxX, offset.x)),
    y: Math.min(maxY, Math.max(-maxY, offset.y)),
  };
}

async function loadImage(file: File): Promise<HTMLImageElement> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('Failed to load image'));
      image.src = objectUrl;
    });
    return image;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function renderCroppedAvatar(
  file: File,
  zoom: number,
  offset: { x: number; y: number },
): Promise<File> {
  const image = await loadImage(file);
  const canvas = document.createElement('canvas');
  const outputSize = 512;
  canvas.width = outputSize;
  canvas.height = outputSize;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is not available');

  const clampedOffset = clampCropOffset(image.width, image.height, zoom, offset);
  const baseScale = Math.max(CROP_FRAME_SIZE / image.width, CROP_FRAME_SIZE / image.height);
  const ratio = outputSize / CROP_FRAME_SIZE;

  ctx.translate(outputSize / 2 + clampedOffset.x * ratio, outputSize / 2 + clampedOffset.y * ratio);
  ctx.scale(baseScale * zoom * ratio, baseScale * zoom * ratio);
  ctx.drawImage(image, -image.width / 2, -image.height / 2);

  const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.92));
  if (!blob) throw new Error('Avatar crop failed');
  return new File([blob], `avatar-${Date.now()}.jpg`, { type: 'image/jpeg' });
}

export function ProfileModal({ onClose }: ProfileModalProps) {
  const { user, updateProfile } = useAuth();
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState(user?.profile_status ?? '');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(user?.avatar_url ?? null);
  const [uploadState, setUploadState] = useState<UploadState>({ status: 'idle' });
  const [saving, setSaving] = useState(false);
  const [cropSource, setCropSource] = useState<{ file: File; url: string; width: number; height: number } | null>(null);
  const [cropZoom, setCropZoom] = useState(1);
  const [cropOffset, setCropOffset] = useState({ x: 0, y: 0 });
  const [isCropping, setIsCropping] = useState(false);
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

  const handleAvatarFileSelect = async (file: File) => {
    if (file.size > 25 * 1024 * 1024) {
      setUploadState({ status: 'error', file, message: t('file.tooLarge') });
      return;
    }
    const image = await loadImage(file);
    const previewUrl = URL.createObjectURL(file);
    setCropZoom(1);
    setCropOffset({ x: 0, y: 0 });
    setCropSource({ file, url: previewUrl, width: image.width, height: image.height });
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

  useEffect(() => {
    if (!dragStateRef.current || !cropSource) return;

    const handlePointerMove = (event: PointerEvent) => {
      const drag = dragStateRef.current;
      if (!drag) return;
      setCropOffset(clampCropOffset(
        cropSource.width,
        cropSource.height,
        cropZoom,
        {
          x: drag.originX + event.clientX - drag.startX,
          y: drag.originY + event.clientY - drag.startY,
        },
      ));
    };

    const stopDragging = () => {
      dragStateRef.current = null;
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', stopDragging);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', stopDragging);
    };
  }, [cropSource, cropZoom]);

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
          <div className={styles.avatarButton}>
            <Avatar name={user.username} avatarUrl={avatarUrl} size="lg" />
          </div>
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
              onPointerDown={(event) => {
                dragStateRef.current = {
                  startX: event.clientX,
                  startY: event.clientY,
                  originX: cropOffset.x,
                  originY: cropOffset.y,
                };
              }}
            >
              <img
                src={cropSource.url}
                alt={t('profile.cropAvatar')}
                className={styles.cropImage}
                style={{
                  transform: `translate(${cropOffset.x}px, ${cropOffset.y}px) scale(${cropZoom})`,
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
          <div className={styles.footerActions}>
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
    </div>
  );
}
