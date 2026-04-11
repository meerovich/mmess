import { useState, useEffect } from 'react';
import styles from './ThemeToggle.module.css';

type Theme = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'mmess.theme';

function resolveTheme(t: Theme): 'light' | 'dark' {
  if (t === 'system') {
    return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return t;
}

function applyTheme(t: Theme): void {
  document.documentElement.dataset.theme = resolveTheme(t);
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(
    () => (localStorage.getItem(STORAGE_KEY) as Theme) ?? 'system'
  );

  // System mode: listen for OS preference changes
  useEffect(() => {
    if (theme !== 'system') return;
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const handler = () => applyTheme('system');
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [theme]);

  function select(t: Theme) {
    setTheme(t);
    localStorage.setItem(STORAGE_KEY, t);
    applyTheme(t);
  }

  const buttons: { value: Theme; label: string; icon: React.ReactNode }[] = [
    {
      value: 'light',
      label: 'Light theme',
      icon: (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
          <circle cx="8" cy="8" r="3"/>
          <line x1="8" y1="1" x2="8" y2="2.5"/>
          <line x1="8" y1="13.5" x2="8" y2="15"/>
          <line x1="1" y1="8" x2="2.5" y2="8"/>
          <line x1="13.5" y1="8" x2="15" y2="8"/>
          <line x1="3.05" y1="3.05" x2="4.1" y2="4.1"/>
          <line x1="11.9" y1="11.9" x2="12.95" y2="12.95"/>
          <line x1="12.95" y1="3.05" x2="11.9" y2="4.1"/>
          <line x1="4.1" y1="11.9" x2="3.05" y2="12.95"/>
        </svg>
      ),
    },
    {
      value: 'dark',
      label: 'Dark theme',
      icon: (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M13.5 9.5A6 6 0 0 1 6.5 2.5a6 6 0 1 0 7 7z"/>
        </svg>
      ),
    },
    {
      value: 'system',
      label: 'System theme',
      icon: (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="1" y="2" width="14" height="10" rx="1.5"/>
          <line x1="5" y1="14" x2="11" y2="14"/>
          <line x1="8" y1="12" x2="8" y2="14"/>
        </svg>
      ),
    },
  ];

  return (
    <div className={styles.group} role="group" aria-label="Color theme">
      {buttons.map(({ value, label, icon }) => (
        <button
          key={value}
          type="button"
          className={`${styles.btn} ${theme === value ? styles.active : ''}`}
          aria-label={label}
          aria-pressed={theme === value}
          onClick={() => select(value)}
        >
          {icon}
        </button>
      ))}
    </div>
  );
}
