export interface AvatarPalette {
  avatarBg: string;
  accent: string;
  tint: string;
}

function getNameSeed(name: string): number {
  const chars = Array.from(name.trim() || '?');
  return chars.reduce((sum, char, index) => sum + char.charCodeAt(0) * (index + 1), 0);
}

export function getAvatarPalette(name: string): AvatarPalette {
  const hue = (getNameSeed(name) * 137) % 360;
  return {
    avatarBg: `hsl(${hue} 62% 62%)`,
    accent: `hsl(${hue} 72% 46%)`,
    tint: `hsla(${hue} 80% 92% / 0.72)`,
  };
}
