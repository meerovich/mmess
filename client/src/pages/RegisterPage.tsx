import { useState, useEffect, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useTranslation } from '../lib/i18n';
import { apiFetch } from '../lib/api';

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

  // Fetch registration mode on mount
  useEffect(() => {
    apiFetch('/api/auth/registration-mode')
      .then(r => r.json())
      .then((d: { mode: RegMode }) => setMode(d.mode))
      .catch(() => setMode('open'));
  }, []);

  // Password policy checks
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
    return <div style={{ maxWidth: 400, margin: '80px auto', padding: '0 16px', textAlign: 'center' }}>…</div>;
  }

  if (mode === 'closed') {
    return (
      <div style={{ maxWidth: 400, margin: '80px auto', padding: '0 16px' }}>
        <h1>{t('auth.registerTitle')}</h1>
        <p>{t('auth.registrationClosed')}</p>
        <p><Link to="/login">{t('auth.alreadyHaveAccount')}</Link></p>
      </div>
    );
  }

  const checkStyle = (ok: boolean): React.CSSProperties => ({
    color: ok ? '#22c55e' : '#999',
    fontSize: 13,
  });

  return (
    <div style={{ maxWidth: 400, margin: '80px auto', padding: '0 16px' }}>
      <h1>{t('auth.registerTitle')}</h1>
      <form onSubmit={handleSubmit}>
        <div>
          <label>
            {t('auth.email')}
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              style={{ display: 'block', marginTop: 4, width: '100%' }}
            />
          </label>
        </div>
        <div style={{ marginTop: 12 }}>
          <label>
            {t('auth.username')}
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              required
              style={{ display: 'block', marginTop: 4, width: '100%' }}
            />
          </label>
        </div>
        <div style={{ marginTop: 12 }}>
          <label>
            {t('auth.password')}
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              minLength={8}
              style={{ display: 'block', marginTop: 4, width: '100%' }}
            />
          </label>
          {password.length > 0 && (
            <div style={{ marginTop: 4 }}>
              <div style={checkStyle(pwChecks.length)}>{pwChecks.length ? '✓' : '○'} {t('auth.pwMinLength')}</div>
              <div style={checkStyle(pwChecks.letter)}>{pwChecks.letter ? '✓' : '○'} {t('auth.pwLetter')}</div>
              <div style={checkStyle(pwChecks.digit)}>{pwChecks.digit ? '✓' : '○'} {t('auth.pwDigit')}</div>
            </div>
          )}
        </div>
        {mode === 'invite-only' && (
          <div style={{ marginTop: 12 }}>
            <label>
              {t('auth.inviteToken')}
              <input
                type="text"
                value={inviteToken}
                onChange={e => setInviteToken(e.target.value)}
                required
                style={{ display: 'block', marginTop: 4, width: '100%' }}
              />
            </label>
            <small style={{ color: '#666' }}>{t('auth.inviteHint')}</small>
          </div>
        )}
        {error && <p style={{ color: 'red' }}>{error}</p>}
        <button type="submit" disabled={submitting || !pwValid} style={{ marginTop: 16 }}>
          {submitting ? t('auth.registering') : t('auth.register')}
        </button>
      </form>
      <p>
        <Link to="/login">{t('auth.alreadyHaveAccount')}</Link>
      </p>
    </div>
  );
}
