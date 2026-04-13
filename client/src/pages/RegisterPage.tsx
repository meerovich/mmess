import { useState, useEffect, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useTranslation } from '../lib/i18n';
import { apiFetch } from '../lib/api';
import styles from './AuthForm.module.css';

type RegMode = 'open' | 'invite-only' | 'closed';

export function RegisterPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [inviteToken, setInviteToken] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [mode, setMode] = useState<RegMode | null>(null);

  useEffect(() => {
    apiFetch('/api/auth/registration-mode')
      .then(r => r.json())
      .then((d: { mode: RegMode }) => setMode(d.mode))
      .catch(() => setMode('open'));
  }, []);

  const pwChecks = useMemo(() => ({
    length: password.length >= 8,
    letter: /[a-zA-Zа-яА-ЯёЁ]/.test(password),
    digit: /\d/.test(password),
  }), [password]);

  const pwValid = pwChecks.length && pwChecks.letter && pwChecks.digit;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!pwValid) return;
    setSubmitting(true);
    try {
      const body: Record<string, string> = { email, username, password };
      if (inviteToken.trim()) {
        body.inviteToken = inviteToken.trim();
      }
      const res = await apiFetch('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string; message?: string }).error ?? (err as { message?: string }).message ?? t('auth.registerFailed'));
      }
      navigate('/login', { state: { message: t('auth.registerSuccess') } });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('auth.registerFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  if (mode === null) {
    return <div className={styles.page}><div className={styles.card} style={{ textAlign: 'center' }}>...</div></div>;
  }

  if (mode === 'closed') {
    return (
      <div className={styles.page}>
        <div className={styles.card}>
          <h1 className={styles.logo}>mmess</h1>
          <p style={{ textAlign: 'center', color: 'var(--color-text-secondary)' }}>{t('auth.registrationClosed')}</p>
          <p className={styles.link}><Link to="/login">{t('auth.alreadyHaveAccount')}</Link></p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <h1 className={styles.logo}>mmess</h1>
        <form onSubmit={handleSubmit}>
          <div className={styles.field}>
            <label className={styles.label}>{t('auth.email')}</label>
            <input
              className={styles.input}
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>{t('auth.username')}</label>
            <input
              className={styles.input}
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              required
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>{t('auth.password')}</label>
            <input
              className={styles.input}
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              minLength={8}
            />
            {password.length > 0 && (
              <div className={styles.pwChecks}>
                <div className={pwChecks.length ? styles.pwCheckOk : styles.pwCheck}>
                  {pwChecks.length ? '\u2713' : '\u25CB'} {t('auth.pwMinLength')}
                </div>
                <div className={pwChecks.letter ? styles.pwCheckOk : styles.pwCheck}>
                  {pwChecks.letter ? '\u2713' : '\u25CB'} {t('auth.pwLetter')}
                </div>
                <div className={pwChecks.digit ? styles.pwCheckOk : styles.pwCheck}>
                  {pwChecks.digit ? '\u2713' : '\u25CB'} {t('auth.pwDigit')}
                </div>
              </div>
            )}
          </div>
          {mode === 'invite-only' && (
            <div className={styles.field}>
              <label className={styles.label}>{t('auth.inviteToken')}</label>
              <input
                className={styles.input}
                type="text"
                value={inviteToken}
                onChange={e => setInviteToken(e.target.value)}
                required
              />
              <span className={styles.hint}>{t('auth.inviteHint')}</span>
            </div>
          )}
          {error && <p className={styles.error}>{error}</p>}
          <button className={styles.button} type="submit" disabled={submitting || !pwValid}>
            {submitting ? t('auth.registering') : t('auth.register')}
          </button>
        </form>
        <p className={styles.link}>
          <Link to="/login">{t('auth.alreadyHaveAccount')}</Link>
        </p>
      </div>
    </div>
  );
}
