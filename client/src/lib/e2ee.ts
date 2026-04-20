import { apiFetch } from './api';
import type { Conversation } from '../types/chat';

const IDENTITY_PRIVATE_KEY = 'mmess:e2ee:identity:private';
const IDENTITY_PUBLIC_KEY = 'mmess:e2ee:identity:public';
const CONVERSATION_KEY_PREFIX = 'mmess:e2ee:conversation:';

export interface E2eeFileMeta {
  name: string;
  mime: string;
  size: number;
  iv: string;
}

export interface E2eePlainPayload {
  text: string | null;
  file?: E2eeFileMeta;
}

interface E2eeCipherPayload {
  v: 1;
  type: 'mmess-e2ee';
  alg: 'AES-GCM';
  iv: string;
  ct: string;
}

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();
const conversationKeyCache = new Map<string, CryptoKey>();
const rawConversationKeyCache = new Map<string, Uint8Array>();

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  bytes.forEach(byte => { binary += String.fromCharCode(byte); });
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function storageConversationKey(conversationId: string): string {
  return `${CONVERSATION_KEY_PREFIX}${conversationId}`;
}

export function isEncryptedPayload(content: string | null | undefined): boolean {
  if (!content?.startsWith('{')) return false;
  try {
    return (JSON.parse(content) as { type?: unknown }).type === 'mmess-e2ee';
  } catch {
    return false;
  }
}

async function importAesKey(raw: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', toArrayBuffer(raw), { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

async function ensureIdentityKey(): Promise<{ publicJwk: JsonWebKey; privateKey: CryptoKey }> {
  const storedPrivate = localStorage.getItem(IDENTITY_PRIVATE_KEY);
  const storedPublic = localStorage.getItem(IDENTITY_PUBLIC_KEY);

  if (storedPrivate && storedPublic) {
    const privateKey = await crypto.subtle.importKey(
      'jwk',
      JSON.parse(storedPrivate) as JsonWebKey,
      { name: 'RSA-OAEP', hash: 'SHA-256' },
      true,
      ['decrypt']
    );
    const publicJwk = JSON.parse(storedPublic) as JsonWebKey;
    await publishOwnPublicKey(publicJwk);
    return { publicJwk, privateKey };
  }

  const keyPair = await crypto.subtle.generateKey(
    {
      name: 'RSA-OAEP',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['encrypt', 'decrypt']
  );
  const publicJwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey);
  const privateJwk = await crypto.subtle.exportKey('jwk', keyPair.privateKey);

  localStorage.setItem(IDENTITY_PUBLIC_KEY, JSON.stringify(publicJwk));
  localStorage.setItem(IDENTITY_PRIVATE_KEY, JSON.stringify(privateJwk));
  await publishOwnPublicKey(publicJwk);
  return { publicJwk, privateKey: keyPair.privateKey };
}

export async function ensureE2eeIdentity(): Promise<void> {
  await ensureIdentityKey();
}

async function publishOwnPublicKey(publicJwk: JsonWebKey): Promise<void> {
  await apiFetch('/api/e2ee/me-key', {
    method: 'POST',
    body: JSON.stringify({ public_key_jwk: JSON.stringify(publicJwk) }),
  }).catch(() => {
    // Sending should still work locally; missing shares will self-heal later.
  });
}

async function fetchPublicKeys(userIds: string[]): Promise<Map<string, JsonWebKey>> {
  const uniqueIds = [...new Set(userIds)];
  if (uniqueIds.length === 0) return new Map();
  const res = await apiFetch(`/api/e2ee/public-keys?ids=${encodeURIComponent(uniqueIds.join(','))}`);
  if (!res.ok) return new Map();
  const data = await res.json() as { keys?: Array<{ user_id: string; public_key_jwk: string }> };
  return new Map(
    (data.keys ?? []).map(row => [row.user_id, JSON.parse(row.public_key_jwk) as JsonWebKey])
  );
}

async function publishConversationKeyShares(
  conversation: Conversation,
  userId: string,
  rawKey: Uint8Array,
): Promise<void> {
  const participantIds = conversation.participants
    .filter(participant => participant.status !== 'declined')
    .map(participant => participant.user_id);
  const publicKeys = await fetchPublicKeys(participantIds);

  const shares = await Promise.all(
    participantIds.map(async (participantId) => {
      const jwk = publicKeys.get(participantId);
      if (!jwk) return null;
      const publicKey = await crypto.subtle.importKey(
        'jwk',
        jwk,
        { name: 'RSA-OAEP', hash: 'SHA-256' },
        false,
        ['encrypt']
      );
      const wrapped = await crypto.subtle.encrypt({ name: 'RSA-OAEP' }, publicKey, toArrayBuffer(rawKey));
      return {
        user_id: participantId,
        wrapped_key: bytesToBase64(new Uint8Array(wrapped)),
        key_version: 1,
      };
    })
  );

  const compactShares = shares.filter((share): share is NonNullable<typeof share> => share !== null);
  if (compactShares.length === 0) return;

  await apiFetch(`/api/e2ee/conversations/${conversation.id}/key-shares`, {
    method: 'POST',
    body: JSON.stringify({ shares: compactShares }),
  }).catch(() => {
    // Best effort: current sender still has the key locally.
  });

  // Keep TypeScript honest that userId is intentionally part of the trust boundary.
  void userId;
}

async function unwrapConversationKey(conversationId: string, privateKey: CryptoKey): Promise<Uint8Array | null> {
  const res = await apiFetch(`/api/e2ee/conversations/${conversationId}/key-shares`);
  if (!res.ok) return null;
  const data = await res.json() as { shares?: Array<{ wrapped_key: string }> };

  for (const share of data.shares ?? []) {
    try {
      const raw = await crypto.subtle.decrypt(
        { name: 'RSA-OAEP' },
        privateKey,
        toArrayBuffer(base64ToBytes(share.wrapped_key))
      );
      return new Uint8Array(raw);
    } catch {
      // Try the next share if key rotation ever creates more than one.
    }
  }

  return null;
}

export async function ensureConversationKey(
  conversation: Conversation,
  userId: string,
  options: { createIfMissing?: boolean } = {},
): Promise<CryptoKey> {
  const createIfMissing = options.createIfMissing ?? true;
  const cached = conversationKeyCache.get(conversation.id);
  if (cached) return cached;

  const stored = localStorage.getItem(storageConversationKey(conversation.id));
  if (stored) {
    const raw = base64ToBytes(stored);
    rawConversationKeyCache.set(conversation.id, raw);
    const key = await importAesKey(raw);
    conversationKeyCache.set(conversation.id, key);
    void publishConversationKeyShares(conversation, userId, raw);
    return key;
  }

  const { privateKey } = await ensureIdentityKey();
  const unwrapped = await unwrapConversationKey(conversation.id, privateKey);
  if (unwrapped) {
    localStorage.setItem(storageConversationKey(conversation.id), bytesToBase64(unwrapped));
    rawConversationKeyCache.set(conversation.id, unwrapped);
    const key = await importAesKey(unwrapped);
    conversationKeyCache.set(conversation.id, key);
    void publishConversationKeyShares(conversation, userId, unwrapped);
    return key;
  }

  if (!createIfMissing) {
    throw new Error('No conversation key share available');
  }

  const raw = crypto.getRandomValues(new Uint8Array(32));
  localStorage.setItem(storageConversationKey(conversation.id), bytesToBase64(raw));
  rawConversationKeyCache.set(conversation.id, raw);
  const key = await importAesKey(raw);
  conversationKeyCache.set(conversation.id, key);
  await publishConversationKeyShares(conversation, userId, raw);
  return key;
}

export async function encryptMessagePayload(
  conversation: Conversation,
  userId: string,
  payload: E2eePlainPayload,
): Promise<string> {
  const key = await ensureConversationKey(conversation, userId, { createIfMissing: true });
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = textEncoder.encode(JSON.stringify(payload));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: toArrayBuffer(iv) }, key, toArrayBuffer(plaintext));
  const envelope: E2eeCipherPayload = {
    v: 1,
    type: 'mmess-e2ee',
    alg: 'AES-GCM',
    iv: bytesToBase64(iv),
    ct: bytesToBase64(new Uint8Array(ciphertext)),
  };
  return JSON.stringify(envelope);
}

export async function decryptMessagePayload(
  conversation: Conversation,
  userId: string,
  content: string | null | undefined,
): Promise<E2eePlainPayload | null> {
  if (!content) return null;
  if (!isEncryptedPayload(content)) return { text: content };

  const envelope = JSON.parse(content) as E2eeCipherPayload;
  const key = await ensureConversationKey(conversation, userId, { createIfMissing: false });
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: toArrayBuffer(base64ToBytes(envelope.iv)) },
    key,
    toArrayBuffer(base64ToBytes(envelope.ct))
  );
  return JSON.parse(textDecoder.decode(plaintext)) as E2eePlainPayload;
}

export async function encryptFileForConversation(
  conversation: Conversation,
  userId: string,
  file: File,
): Promise<{ encryptedFile: File; meta: E2eeFileMeta }> {
  const key = await ensureConversationKey(conversation, userId, { createIfMissing: true });
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new Uint8Array(await file.arrayBuffer());
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: toArrayBuffer(iv) }, key, toArrayBuffer(plaintext));
  const encryptedFile = new File(
    [encrypted],
    `${file.name}.mmessenc`,
    { type: 'application/octet-stream' }
  );

  return {
    encryptedFile,
    meta: {
      name: file.name,
      mime: file.type || 'application/octet-stream',
      size: file.size,
      iv: bytesToBase64(iv),
    },
  };
}

export async function decryptFileBlob(
  conversation: Conversation,
  userId: string,
  fileId: string,
  meta: E2eeFileMeta,
): Promise<Blob> {
  const key = await ensureConversationKey(conversation, userId, { createIfMissing: false });
  const res = await apiFetch(`/api/files/${fileId}`);
  if (!res.ok) throw new Error('Failed to load encrypted file');
  const encrypted = new Uint8Array(await res.arrayBuffer());
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: toArrayBuffer(base64ToBytes(meta.iv)) },
    key,
    toArrayBuffer(encrypted)
  );
  return new Blob([plaintext], { type: meta.mime });
}
