import { useState } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useTranslation } from '../lib/i18n';
import styles from './AuthForm.module.css';

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const successMessage = (location.state as { message?: string })?.message;

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
    <div className={styles.page}>
      <div className={styles.card}>
        <h1 className={styles.logo}>mmess</h1>
        {successMessage && (
          <div className={styles.successMessage}>{successMessage}</div>
        )}
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
            <label className={styles.label}>{t('auth.password')}</label>
            <input
              className={styles.input}
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
            />
          </div>
          {error && <p className={styles.error}>{error}</p>}
          <button className={styles.button} type="submit" disabled={submitting}>
            {submitting ? t('auth.loggingIn') : t('auth.login')}
          </button>
        </form>
        <p className={styles.link}>
          <Link to="/register">{t('auth.register')}</Link>
        </p>
      </div>
    </div>
  );
}
