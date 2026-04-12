import { useState, useEffect } from 'react';
import { useTranslation } from '../../lib/i18n';
import type { UploadState } from '../../types/chat';
import { FileIcon } from '../common/FileIcon';
import styles from './UploadStrip.module.css';

interface UploadStripProps {
  uploadState: Exclude<UploadState, { status: 'idle' }>;
  onCancel: () => void;
  onRetry: () => void;
}

export function UploadStrip({ uploadState, onCancel, onRetry }: UploadStripProps) {
  const { t } = useTranslation();
  const { file } = uploadState;
  const isImage = file.type.startsWith('image/');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // Generate local preview URL for images
  useEffect(() => {
    if (!isImage) return;
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file, isImage]);

  return (
    <div className={styles.strip}>
      <div className={styles.row}>
        {/* Thumbnail or file icon */}
        <div className={styles.thumb}>
          {isImage && previewUrl ? (
            <img src={previewUrl} alt={file.name} className={styles.thumbImg} />
          ) : (
            <FileIcon mimeType={file.type} />
          )}
        </div>

        {/* File info */}
        <div className={styles.info}>
          <span className={styles.name}>{file.name}</span>
          <span className={styles.size}>{formatSizeForStrip(file.size)}</span>
        </div>

        {/* Cancel / remove button */}
        <button
          className={styles.cancelBtn}
          onClick={onCancel}
          aria-label={uploadState.status === 'uploading' ? t('file.cancelUpload') : t('file.removeAttachment')}
        >
          &#215;
        </button>
      </div>

      {/* Progress bar (uploading state) */}
      {uploadState.status === 'uploading' && (
        <div className={styles.progressRow}>
          <div className={styles.progressTrack}>
            <div
              className={styles.progressFill}
              style={{ width: `${uploadState.progress}%` }}
            />
          </div>
          <span className={styles.progressPct} role="status" aria-live="polite">
            {uploadState.progress}%
          </span>
        </div>
      )}

      {/* Ready state — green checkmark */}
      {uploadState.status === 'ready' && (
        <div className={styles.readyRow}>
          <span className={styles.checkmark} aria-label={t('file.uploadComplete')}>&#10003;</span>
        </div>
      )}

      {/* Error state */}
      {uploadState.status === 'error' && (
        <div className={styles.errorRow}>
          <span className={styles.errorText}>{t('file.uploadFailed', { message: uploadState.message })}</span>
          <button className={styles.retryBtn} onClick={onRetry}>{t('file.retry')}</button>
        </div>
      )}
    </div>
  );
}

function formatSizeForStrip(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
