import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

export function ProtectedRoute() {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return null; // Prevent flash-redirect during initial session check
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  return <Outlet />;
}
