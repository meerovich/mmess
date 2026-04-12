import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useTranslation } from '../lib/i18n';
import { apiFetch } from '../lib/api';

export function RegisterPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [inviteToken, setInviteToken] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
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
      // Registration successful — redirect to login with success message
      navigate('/login', { state: { message: t('auth.registerSuccess') } });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('auth.registerFailed'));
    } finally {
      setSubmitting(false);
    }
  };

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
        </div>
        <div style={{ marginTop: 12 }}>
          <label>
            {t('auth.inviteToken')}
            <input
              type="text"
              value={inviteToken}
              onChange={e => setInviteToken(e.target.value)}
              placeholder={t('auth.invitePlaceholder')}
              style={{ display: 'block', marginTop: 4, width: '100%' }}
            />
          </label>
          <small style={{ color: '#666' }}>
            {t('auth.inviteHint')}
          </small>
        </div>
        {error && <p style={{ color: 'red' }}>{error}</p>}
        <button type="submit" disabled={submitting} style={{ marginTop: 16 }}>
          {submitting ? t('auth.registering') : t('auth.register')}
        </button>
      </form>
      <p>
        <Link to="/login">{t('auth.alreadyHaveAccount')}</Link>
      </p>
    </div>
  );
}
