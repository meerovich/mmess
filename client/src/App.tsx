import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { ChatProvider } from './contexts/ChatContext';
import { WebSocketProvider } from './providers/WebSocketProvider';
import { ProtectedRoute } from './components/ProtectedRoute';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { SessionsPage } from './pages/SessionsPage';
import { ChatPage } from './pages/ChatPage';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route element={<ProtectedRoute />}>
            <Route
              path="/"
              element={
                <ChatProvider>
                  <WebSocketProvider>
                    <ChatPage />
                  </WebSocketProvider>
                </ChatProvider>
              }
            />
            <Route
              path="/chat/:conversationId"
              element={
                <ChatProvider>
                  <WebSocketProvider>
                    <ChatPage />
                  </WebSocketProvider>
                </ChatProvider>
              }
            />
            <Route path="/settings/sessions" element={<SessionsPage />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
