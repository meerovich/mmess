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

/**
 * Broadcast to every socket of every listed user, **except** the given source
 * socket. Unlike `broadcast(userIds, data, excludeUserId)` which drops an
 * entire user from the fan-out, this variant delivers the event to every
 * other session of the sender — used for message:new, reaction:added and
 * similar events where the sender's OTHER devices must stay in sync.
 *
 * The source socket still receives its own `ack` frame separately from the
 * caller (via `socket.send(...)`).
 */
export function broadcastExcludeSocket(
  userIds: string[],
  data: unknown,
  excludeSocket: WebSocket
): void {
  const json = JSON.stringify(data);
  for (const uid of userIds) {
    const sockets = registry.get(uid);
    if (!sockets) continue;
    for (const socket of sockets) {
      if (socket === excludeSocket) continue;
      if (socket.readyState === 1 /* OPEN */) socket.send(json);
    }
  }
}

export function isOnline(userId: string): boolean {
  const sockets = registry.get(userId);
  return sockets !== undefined && sockets.size > 0;
}
