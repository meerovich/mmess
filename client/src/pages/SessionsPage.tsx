import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import { useAuth } from '../hooks/useAuth';

interface Session {
  id: string;
  device_label: string;
  ip_address: string;
  created_at: string;
  last_seen_at: string;
  isCurrentDevice: boolean;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString();
}

export function SessionsPage() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [terminating, setTerminating] = useState<string | null>(null);

  const fetchSessions = async () => {
    try {
      const res = await apiFetch('/api/auth/sessions');
      if (!res.ok) throw new Error('Failed to load sessions');
      setSessions(await res.json());
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load sessions');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchSessions();
  }, []);

  const handleTerminate = async (sessionId: string) => {
    setTerminating(sessionId);
    try {
      const res = await apiFetch(`/api/auth/sessions/${sessionId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to terminate session');
      await fetchSessions();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to terminate session');
    } finally {
      setTerminating(null);
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div style={{ maxWidth: 700, margin: '40px auto', padding: '0 16px' }}>
      <h1>Active Sessions</h1>
      <button onClick={handleLogout} style={{ marginBottom: 24 }}>
        Log out
      </button>

      {loading && <p>Loading sessions...</p>}
      {error && <p style={{ color: 'red' }}>{error}</p>}

      {!loading && sessions.length === 0 && <p>No active sessions found.</p>}

      {sessions.map(session => (
        <div
          key={session.id}
          style={{
            border: '1px solid #ccc',
            borderRadius: 4,
            padding: 16,
            marginBottom: 12,
            background: session.isCurrentDevice ? '#f0f8ff' : undefined,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <strong>{session.device_label}</strong>
              {session.isCurrentDevice && (
                <span
                  style={{
                    marginLeft: 8,
                    background: '#0066cc',
                    color: '#fff',
                    padding: '2px 6px',
                    borderRadius: 3,
                    fontSize: 12,
                  }}
                >
                  This device
                </span>
              )}
              <div style={{ color: '#555', fontSize: 14, marginTop: 4 }}>
                IP: {session.ip_address}
              </div>
              <div style={{ color: '#555', fontSize: 14 }}>
                Created: {formatDate(session.created_at)}
              </div>
              <div style={{ color: '#555', fontSize: 14 }}>
                Last seen: {formatDate(session.last_seen_at)}
              </div>
            </div>
            {!session.isCurrentDevice && (
              <button
                onClick={() => handleTerminate(session.id)}
                disabled={terminating === session.id}
                style={{ color: 'red', marginLeft: 16 }}
              >
                {terminating === session.id ? 'Terminating...' : 'Terminate'}
              </button>
            )}
          </div>
        </div>
      ))}

      <p>
        <a href="/">Back to chat</a>
      </p>
    </div>
  );
}
