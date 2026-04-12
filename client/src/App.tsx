import { useState, useCallback } from 'react';
import { BrowserRouter, Routes, Route, Outlet } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { ChatProvider } from './contexts/ChatContext';
import { WebSocketProvider } from './providers/WebSocketProvider';
import { ProtectedRoute } from './components/ProtectedRoute';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { SessionsPage } from './pages/SessionsPage';
import { ChatLayout } from './components/chat/ChatLayout';
import { LocaleContext, getLocale } from './lib/i18n';

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
  const [locale, setLocaleState] = useState(getLocale());
  const forceUpdate = useCallback(() => setLocaleState(getLocale()), []);

  return (
    <LocaleContext.Provider value={{ locale, forceUpdate }}>
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
    </LocaleContext.Provider>
  );
}
