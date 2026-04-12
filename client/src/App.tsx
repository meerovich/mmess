import { BrowserRouter, Routes, Route, Outlet } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { ChatProvider } from './contexts/ChatContext';
import { WebSocketProvider } from './providers/WebSocketProvider';
import { ProtectedRoute } from './components/ProtectedRoute';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { SessionsPage } from './pages/SessionsPage';
import { ChatLayout } from './components/chat/ChatLayout';

// Layout route that keeps ChatProvider + WebSocketProvider mounted across
// / and /chat/:conversationId. The <Outlet> renders ChatLayout for both
// child routes, so navigating between them does NOT unmount/remount the
// provider tree — state is preserved, no jitter, back/forward works.
function ChatShell() {
  return (
    <ChatProvider>
      <WebSocketProvider>
        <Outlet />
      </WebSocketProvider>
    </ChatProvider>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route element={<ProtectedRoute />}>
            <Route element={<ChatShell />}>
              <Route path="/" element={<ChatLayout />} />
              <Route path="/chat/:conversationId" element={<ChatLayout />} />
            </Route>
            <Route path="/settings/sessions" element={<SessionsPage />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
