export const AVATAR_CROP_FRAME_SIZE = 220;

export interface AvatarCropSource {
  file: File;
  url: string;
  width: number;
  height: number;
}

export function clampCropOffset(
  imageWidth: number,
  imageHeight: number,
  zoom: number,
  offset: { x: number; y: number },
) {
  const baseScale = Math.max(AVATAR_CROP_FRAME_SIZE / imageWidth, AVATAR_CROP_FRAME_SIZE / imageHeight);
  const scaledWidth = imageWidth * baseScale * zoom;
  const scaledHeight = imageHeight * baseScale * zoom;
  const maxX = Math.max(0, (scaledWidth - AVATAR_CROP_FRAME_SIZE) / 2);
  const maxY = Math.max(0, (scaledHeight - AVATAR_CROP_FRAME_SIZE) / 2);

  return {
    x: Math.min(maxX, Math.max(-maxX, offset.x)),
    y: Math.min(maxY, Math.max(-maxY, offset.y)),
  };
}

async function loadImageFromUrl(url: string): Promise<HTMLImageElement> {
  const image = new Image();
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error('Failed to load image'));
    image.src = url;
  });
  return image;
}

export async function loadImage(file: File): Promise<HTMLImageElement> {
  const objectUrl = URL.createObjectURL(file);
  try {
    return await loadImageFromUrl(objectUrl);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export async function createAvatarCropSource(file: File): Promise<AvatarCropSource> {
  const image = await loadImage(file);
  return {
    file,
    url: URL.createObjectURL(file),
    width: image.width,
    height: image.height,
  };
}

export async function renderCroppedAvatar(
  file: File,
  zoom: number,
  offset: { x: number; y: number },
): Promise<File> {
  const image = await loadImage(file);
  const canvas = document.createElement('canvas');
  const outputSize = 512;
  canvas.width = outputSize;
  canvas.height = outputSize;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is not available');

  const clampedOffset = clampCropOffset(image.width, image.height, zoom, offset);
  const baseScale = Math.max(AVATAR_CROP_FRAME_SIZE / image.width, AVATAR_CROP_FRAME_SIZE / image.height);
  const ratio = outputSize / AVATAR_CROP_FRAME_SIZE;

  ctx.translate(outputSize / 2 + clampedOffset.x * ratio, outputSize / 2 + clampedOffset.y * ratio);
  ctx.scale(baseScale * zoom * ratio, baseScale * zoom * ratio);
  ctx.drawImage(image, -image.width / 2, -image.height / 2);

  const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.92));
  if (!blob) throw new Error('Avatar crop failed');
  return new File([blob], `avatar-${Date.now()}.jpg`, { type: 'image/jpeg' });
}
