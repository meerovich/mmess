import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useTranslation } from '../lib/i18n';

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await login(email, password);
      navigate('/');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('auth.loginFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ maxWidth: 400, margin: '80px auto', padding: '0 16px' }}>
      <h1>mmess</h1>
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
            {t('auth.password')}
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              style={{ display: 'block', marginTop: 4, width: '100%' }}
            />
          </label>
        </div>
        {error && <p style={{ color: 'red' }}>{error}</p>}
        <button type="submit" disabled={submitting} style={{ marginTop: 16 }}>
          {submitting ? t('auth.loggingIn') : t('auth.login')}
        </button>
      </form>
      <p>
        <Link to="/register">{t('auth.register')}</Link>
      </p>
    </div>
  );
}
