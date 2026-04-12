import { createContext, useContext } from 'react';

export type Locale = 'ru' | 'en';

const translations: Record<Locale, Record<string, string>> = {
  ru: {
    'app.name': 'mmess',
    'sidebar.newChat': 'Новый чат',
    'sidebar.newGroup': 'Новая группа',
    'sidebar.search': 'Поиск чатов…',
    'sidebar.noMessages': 'Нет сообщений',
    'sidebar.draft': 'Черновик: ',
    'chat.selectConversation': 'Выберите чат',
    'chat.message': 'Сообщение',
    'chat.reconnecting': 'Подключение…',
    'chat.unreadMessages': 'Непрочитанные сообщения',
    'chat.loadingOlder': 'Загрузка сообщений…',
    'chat.reply': 'Ответить',
    'chat.edit': 'Редактировать',
    'chat.delete': 'Удалить',
    'chat.deleteConfirm': 'Удалить сообщение?',
    'chat.keep': 'Оставить',
    'chat.deleted': 'Сообщение удалено',
    'chat.edited': '(ред.)',
    'chat.back': '← Назад',
    'chat.members': 'участников',
    'chat.sentFile': 'Отправил файл',
    'menu.logout': 'Выйти',
    'menu.language': 'Язык',
    'menu.theme': 'Тема',
    'menu.profile': 'Профиль',
    'typing.one': '{name} печатает…',
    'typing.two': '{name1} и {name2} печатают…',
    'typing.many': 'Несколько человек печатают…',
    'time.online': 'В сети',
    'time.offline': 'Не в сети',
    'time.lastSeen': 'Был(а) {time}',
    'update.available': 'Доступно обновление — нажмите для перезагрузки',
    'notification.newMessage': 'Новое сообщение',
  },
  en: {
    'app.name': 'mmess',
    'sidebar.newChat': 'New chat',
    'sidebar.newGroup': 'New group',
    'sidebar.search': 'Search conversations…',
    'sidebar.noMessages': 'No messages yet',
    'sidebar.draft': 'Draft: ',
    'chat.selectConversation': 'Select a conversation',
    'chat.message': 'Message',
    'chat.reconnecting': 'Reconnecting…',
    'chat.unreadMessages': 'Unread messages',
    'chat.loadingOlder': 'Loading older messages…',
    'chat.reply': 'Reply',
    'chat.edit': 'Edit',
    'chat.delete': 'Delete',
    'chat.deleteConfirm': 'Delete this message?',
    'chat.keep': 'Keep message',
    'chat.deleted': 'Message deleted',
    'chat.edited': '(edited)',
    'chat.back': '← Back',
    'chat.members': 'members',
    'chat.sentFile': 'Sent a file',
    'menu.logout': 'Log out',
    'menu.language': 'Language',
    'menu.theme': 'Theme',
    'menu.profile': 'Profile',
    'typing.one': '{name} is typing…',
    'typing.two': '{name1} and {name2} are typing…',
    'typing.many': 'Several people are typing…',
    'time.online': 'Online',
    'time.offline': 'Offline',
    'time.lastSeen': 'Last seen {time}',
    'update.available': 'Update available — tap to reload',
    'notification.newMessage': 'New message',
  },
};

function getDefaultLocale(): Locale {
  const stored = localStorage.getItem('mmess-locale');
  if (stored === 'en' || stored === 'ru') return stored;
  const nav = navigator.language?.slice(0, 2);
  return nav === 'en' ? 'en' : 'ru'; // default Russian
}

let currentLocale: Locale = getDefaultLocale();
let listeners: Array<() => void> = [];

export function getLocale(): Locale {
  return currentLocale;
}

export function setLocale(locale: Locale): void {
  currentLocale = locale;
  localStorage.setItem('mmess-locale', locale);
  listeners.forEach(fn => fn());
}

export function t(key: string, params?: Record<string, string>): string {
  let text = translations[currentLocale][key] ?? translations.en[key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      text = text.replace(`{${k}}`, v);
    }
  }
  return text;
}

export function onLocaleChange(fn: () => void): () => void {
  listeners.push(fn);
  return () => { listeners = listeners.filter(l => l !== fn); };
}

// React hook
export function useLocale(): { locale: Locale; setLocale: (l: Locale) => void; t: typeof t } {
  // This is a simple approach — for React re-renders on locale change,
  // components should call this hook and the parent should force re-render.
  return { locale: currentLocale, setLocale, t };
}

// Context for triggering re-renders
export const LocaleContext = createContext<{ locale: Locale; forceUpdate: () => void }>({
  locale: 'ru',
  forceUpdate: () => {},
});

export function useTranslation() {
  const ctx = useContext(LocaleContext);
  return { locale: ctx.locale, t, setLocale: (l: Locale) => { setLocale(l); ctx.forceUpdate(); } };
}
