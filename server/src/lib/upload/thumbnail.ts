import sharp from 'sharp';
import { thumbnailPath } from './storage.js';

/**
 * Generate a 640x640 WebP thumbnail (best-effort — D-10).
 * Uses sharp's 'inside' fit to preserve aspect ratio without upscaling.
 * EXIF is stripped by default (sharp WebP output strips all metadata).
 * Returns thumbnail path on success, null on failure.
 */
export async function generateThumbnail(sourcePath: string): Promise<string | null> {
  const thumbPath = thumbnailPath(sourcePath);
  try {
    await sharp(sourcePath)
      .resize(640, 640, {
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: 85 })
      .toFile(thumbPath);
    return thumbPath;
  } catch {
    // D-10: thumbnail failure is non-fatal
    return null;
  }
}
