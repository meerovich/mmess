import type { WebSocket } from 'ws';

const registry = new Map<string, Set<WebSocket>>();

export function register(userId: string, socket: WebSocket): void {
  if (!registry.has(userId)) registry.set(userId, new Set());
  registry.get(userId)!.add(socket);
}

export function unregister(userId: string, socket: WebSocket): void {
  registry.get(userId)?.delete(socket);
  if (registry.get(userId)?.size === 0) registry.delete(userId);
}

export function send(userId: string, data: unknown): void {
  const sockets = registry.get(userId);
  if (!sockets) return;
  const json = JSON.stringify(data);
  for (const socket of sockets) {
    if (socket.readyState === 1 /* OPEN */) socket.send(json);
  }
}

export function broadcast(userIds: string[], data: unknown, excludeUserId?: string): void {
  for (const uid of userIds) {
    if (uid !== excludeUserId) send(uid, data);
  }
}

export function isOnline(userId: string): boolean {
  const sockets = registry.get(userId);
  return sockets !== undefined && sockets.size > 0;
}
