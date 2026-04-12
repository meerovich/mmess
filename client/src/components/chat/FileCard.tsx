import { useTranslation } from '../../lib/i18n';
import styles from './FileCard.module.css';
import { FileIcon } from '../common/FileIcon';

interface FileCardProps {
  fileId: string;
  fileName: string;
  fileSize: number;    // bytes
  mimeType: string;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function FileCard({ fileId, fileName, fileSize, mimeType }: FileCardProps) {
  const { t } = useTranslation();

  const handleDownload = () => {
    window.location.href = `/api/files/${fileId}`;
  };

  return (
    <div
      className={styles.card}
      onClick={handleDownload}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleDownload(); }}
    >
      <FileIcon mimeType={mimeType} />
      <div className={styles.info}>
        <span className={styles.name} title={fileName}>
          {fileName || t('file.unnamedFile')}
        </span>
        <span className={styles.size}>{formatSize(fileSize)}</span>
      </div>
      <button
        className={styles.downloadBtn}
        onClick={(e) => { e.stopPropagation(); handleDownload(); }}
        aria-label={t('file.download', { name: fileName || t('file.unnamedFile') })}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M8 2v8M5 7l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M2 12h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      </button>
    </div>
  );
}
