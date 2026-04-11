import { mkdir } from 'fs/promises';
import { resolve } from 'path';
import { randomUUID } from 'crypto';

const UPLOAD_ROOT = process.env.UPLOAD_DIR ?? '/data/uploads';

/**
 * Generate safe upload path components (date-sharded, UUID filename).
 * D-04: /data/uploads/YYYY/MM/<uuid>.<ext>
 * D-42: Path traversal prevention via path.resolve + prefix check.
 */
export function getUploadPath(originalName: string): {
  year: string;
  month: string;
  filename: string;
  fullPath: string;
  relativePath: string; // stored in DB: "YYYY/MM/<uuid>.<ext>"
} {
  const now = new Date();
  const year = now.getUTCFullYear().toString();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const ext = (originalName.split('.').pop()?.toLowerCase() ?? 'bin').replace(/[^a-z0-9]/g, '');
  const uuid = randomUUID();
  const filename = `${uuid}.${ext}`;

  const uploadRootResolved = resolve(UPLOAD_ROOT);
  const candidate = resolve(uploadRootResolved, year, month, filename);

  if (!candidate.startsWith(uploadRootResolved + '/') && !candidate.startsWith(uploadRootResolved + '\\')) {
    throw new Error('Path traversal attempt detected');
  }

  return {
    year,
    month,
    filename,
    fullPath: candidate,
    relativePath: `${year}/${month}/${filename}`,
  };
}

/** Create date-sharded directory if it doesn't exist. */
export async function ensureUploadDir(year: string, month: string): Promise<void> {
  const dir = resolve(UPLOAD_ROOT, year, month);
  await mkdir(dir, { recursive: true });
}

/** Reconstruct absolute path from relative path stored in DB. */
export function absolutePath(relativePath: string): string {
  const uploadRootResolved = resolve(UPLOAD_ROOT);
  const candidate = resolve(uploadRootResolved, relativePath);
  if (!candidate.startsWith(uploadRootResolved + '/') && !candidate.startsWith(uploadRootResolved + '\\')) {
    throw new Error('Path traversal attempt detected');
  }
  return candidate;
}

/** Thumbnail path: same dir as original, suffix _thumb.webp. D-09 */
export function thumbnailPath(fullPath: string): string {
  return fullPath.replace(/\.[^.]+$/, '_thumb.webp');
}

/** Thumbnail relative path for DB storage. */
export function thumbnailRelativePath(relativePath: string): string {
  return relativePath.replace(/\.[^.]+$/, '_thumb.webp');
}
