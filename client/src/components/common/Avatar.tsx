import { useState } from 'react';
import { getAvatarPalette } from '../../lib/avatarColor';
import styles from './Avatar.module.css';

interface AvatarProps {
  name: string;
  size?: 'sm' | 'md' | 'lg';
  avatarUrl?: string | null;
}

export function Avatar({ name, size = 'md', avatarUrl }: AvatarProps) {
  const [imgError, setImgError] = useState(false);

  // Render image if avatarUrl is provided and hasn't errored
  if (avatarUrl && !imgError) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        className={`${styles.avatar} ${styles[size]}`}
        onError={() => setImgError(true)}
      />
    );
  }

  // Fallback: initials circle (unchanged behavior)
  const palette = getAvatarPalette(name);
  const initial = name.charAt(0).toUpperCase();

  return (
    <div
      className={`${styles.avatar} ${styles[size]}`}
      style={{ background: palette.avatarBg }}
      aria-hidden="true"
    >
      {initial}
    </div>
  );
}
