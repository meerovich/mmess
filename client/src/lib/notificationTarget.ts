export const NOTIFICATION_NAV_KEY = 'mmess:notification-target';
export const NOTIFICATION_CONVERSATION_PARAM = 'mmessPushConversation';
export const NOTIFICATION_MESSAGE_PARAM = 'mmessPushMessage';
export const NOTIFICATION_TARGET_ENDPOINT = '/__mmess_notification_target';

export interface NotificationTarget {
  path: string;
  conversationId?: string;
  messageId?: string;
  replace?: boolean;
}

function normalizeNotificationTarget(target: NotificationTarget): NotificationTarget {
  if (target.conversationId && !target.path.startsWith('/chat/')) {
    return { ...target, path: `/chat/${target.conversationId}` };
  }
  return target;
}

export function readNotificationTarget(): NotificationTarget | null {
  if (typeof window === 'undefined') return null;
  const raw = sessionStorage.getItem(NOTIFICATION_NAV_KEY);
  if (!raw) return null;
  try {
    return normalizeNotificationTarget(JSON.parse(raw) as NotificationTarget);
  } catch {
    sessionStorage.removeItem(NOTIFICATION_NAV_KEY);
    return null;
  }
}

export function parseNotificationTargetUrl(rawUrl: string): NotificationTarget | null {
  if (typeof window === 'undefined') return null;

  let url: URL;
  try {
    url = new URL(rawUrl, window.location.origin);
  } catch {
    return null;
  }

  const conversationId = url.searchParams.get(NOTIFICATION_CONVERSATION_PARAM) ?? undefined;
  const messageId = url.searchParams.get(NOTIFICATION_MESSAGE_PARAM) ?? undefined;

  url.searchParams.delete(NOTIFICATION_CONVERSATION_PARAM);
  url.searchParams.delete(NOTIFICATION_MESSAGE_PARAM);

  return normalizeNotificationTarget({
    path: `${url.pathname}${url.search}${url.hash}`,
    conversationId,
    messageId,
    replace: true,
  });
}

export function writeNotificationTarget(target: NotificationTarget): void {
  if (typeof window === 'undefined') return;
  sessionStorage.setItem(NOTIFICATION_NAV_KEY, JSON.stringify(normalizeNotificationTarget(target)));
}

export function clearNotificationTarget(): void {
  if (typeof window === 'undefined') return;
  sessionStorage.removeItem(NOTIFICATION_NAV_KEY);

  const clearMessage = { type: 'mmess:clear-notification-target' };
  navigator.serviceWorker?.controller?.postMessage(clearMessage);
  navigator.serviceWorker?.ready
    .then(registration => registration.active?.postMessage(clearMessage))
    .catch(() => {});
}

export async function readServiceWorkerNotificationTarget(): Promise<NotificationTarget | null> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return null;

  try {
    const res = await fetch(NOTIFICATION_TARGET_ENDPOINT, { cache: 'no-store' });
    if (!res.ok || res.status === 204) return null;
    const contentType = res.headers.get('content-type') ?? '';
    if (!contentType.includes('application/json')) return null;
    const target = normalizeNotificationTarget(await res.json() as NotificationTarget);
    writeNotificationTarget(target);
    return target;
  } catch {
    return null;
  }
}

export async function readServerNotificationTarget(): Promise<NotificationTarget | null> {
  if (typeof window === 'undefined') return null;

  try {
    const res = await fetch('/api/push/open-target', {
      credentials: 'include',
      cache: 'no-store',
    });
    if (!res.ok || res.status === 204) return null;
    const contentType = res.headers.get('content-type') ?? '';
    if (!contentType.includes('application/json')) return null;
    const target = normalizeNotificationTarget(await res.json() as NotificationTarget);
    writeNotificationTarget(target);
    return target;
  } catch {
    return null;
  }
}
