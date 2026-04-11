import styles from './FileIcon.module.css';

interface FileIconProps {
  mimeType: string;
}

export function FileIcon({ mimeType }: FileIconProps) {
  // PDF
  if (mimeType === 'application/pdf') {
    return (
      <svg className={styles.icon} viewBox="0 0 32 32" fill="none" aria-hidden="true">
        <rect x="4" y="2" width="18" height="24" rx="2" stroke="#c5221f" strokeWidth="1.5"/>
        <path d="M18 2v6h6" stroke="#c5221f" strokeWidth="1.5" strokeLinejoin="round"/>
        <text x="8" y="22" fontSize="7" fill="#c5221f" fontWeight="600" fontFamily="sans-serif">PDF</text>
      </svg>
    );
  }
  // Video
  if (mimeType.startsWith('video/')) {
    return (
      <svg className={styles.icon} viewBox="0 0 32 32" fill="none" aria-hidden="true">
        <rect x="2" y="6" width="22" height="20" rx="3" stroke="var(--color-text-secondary)" strokeWidth="1.5"/>
        <path d="M24 12l6-4v16l-6-4V12z" stroke="var(--color-text-secondary)" strokeWidth="1.5" strokeLinejoin="round"/>
        <path d="M10 13l8 3-8 3V13z" fill="var(--color-text-secondary)"/>
      </svg>
    );
  }
  // Audio
  if (mimeType.startsWith('audio/')) {
    return (
      <svg className={styles.icon} viewBox="0 0 32 32" fill="none" aria-hidden="true">
        <rect x="4" y="10" width="4" height="12" rx="1" stroke="var(--color-text-secondary)" strokeWidth="1.5"/>
        <rect x="10" y="7" width="4" height="18" rx="1" stroke="var(--color-text-secondary)" strokeWidth="1.5"/>
        <rect x="16" y="4" width="4" height="24" rx="1" stroke="var(--color-text-secondary)" strokeWidth="1.5"/>
        <rect x="22" y="10" width="4" height="12" rx="1" stroke="var(--color-text-secondary)" strokeWidth="1.5"/>
      </svg>
    );
  }
  // Archive (zip, rar, 7z)
  if (
    mimeType === 'application/zip' ||
    mimeType === 'application/x-rar-compressed' ||
    mimeType === 'application/x-7z-compressed' ||
    mimeType === 'application/x-zip-compressed'
  ) {
    return (
      <svg className={styles.icon} viewBox="0 0 32 32" fill="none" aria-hidden="true">
        <rect x="4" y="4" width="24" height="24" rx="3" stroke="var(--color-text-secondary)" strokeWidth="1.5"/>
        <path d="M14 4v24M14 10h4M14 16h4" stroke="var(--color-text-secondary)" strokeWidth="1.5"/>
        <path d="M16 22v4M14 26h4" stroke="var(--color-text-secondary)" strokeWidth="1.5"/>
      </svg>
    );
  }
  // Generic document
  return (
    <svg className={styles.icon} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <path d="M6 2h14l8 8v20a2 2 0 01-2 2H6a2 2 0 01-2-2V4a2 2 0 012-2z" stroke="var(--color-text-secondary)" strokeWidth="1.5"/>
      <path d="M20 2v8h8" stroke="var(--color-text-secondary)" strokeWidth="1.5" strokeLinejoin="round"/>
      <line x1="9" y1="16" x2="23" y2="16" stroke="var(--color-text-secondary)" strokeWidth="1.5"/>
      <line x1="9" y1="21" x2="19" y2="21" stroke="var(--color-text-secondary)" strokeWidth="1.5"/>
    </svg>
  );
}
