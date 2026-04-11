import { open } from 'fs/promises';
import { fileTypeFromBuffer } from 'file-type';

// D-03: blocked extensions
export const BLOCKED_EXTENSIONS = new Set([
  'exe', 'bat', 'sh', 'cmd', 'ps1', 'msi', 'app', 'jar', 'scr', 'com', 'vbs',
]);

// D-03: blocked MIME types (from magic bytes)
export const BLOCKED_MIMES = new Set([
  'application/x-msdownload',
  'application/x-sh',
  'application/x-msdos-program',
  'application/java-archive',
  'application/vnd.microsoft.portable-executable',
  'application/x-dosexec',
]);

export interface MimeValidationResult {
  detectedMime: string;
  isImage: boolean;
}

/**
 * Validate file MIME type via magic bytes (D-02).
 * Reads first 4100 bytes from the already-written file.
 * Returns detectedMime and isImage flag.
 * Throws 400 if extension or detected MIME is blocked.
 */
export async function validateMime(
  filePath: string,
  originalName: string,
): Promise<MimeValidationResult> {
  // Check extension blocklist first (fast path)
  const ext = originalName.split('.').pop()?.toLowerCase() ?? '';
  if (BLOCKED_EXTENSIONS.has(ext)) {
    throw Object.assign(new Error('File type not allowed'), { statusCode: 400 });
  }

  // Read magic bytes from file
  const head = Buffer.alloc(4100);
  const fd = await open(filePath, 'r');
  try {
    await fd.read(head, 0, 4100, 0);
  } finally {
    await fd.close();
  }

  const detected = await fileTypeFromBuffer(head);
  const detectedMime = detected?.mime ?? 'application/octet-stream';

  if (BLOCKED_MIMES.has(detectedMime)) {
    throw Object.assign(new Error('File type not allowed'), { statusCode: 400 });
  }

  return {
    detectedMime,
    isImage: detectedMime.startsWith('image/'),
  };
}
