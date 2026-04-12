import type { FastifyInstance } from 'fastify';
import sharp from 'sharp';

// Deterministic HSL color from string (same algorithm as client Avatar component)
function hashColor(name: string): { h: number; s: number; l: number } {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const h = Math.abs(hash) % 360;
  return { h, s: 55, l: 45 };
}

function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
  s /= 100; l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
  };
  return { r: Math.round(f(0) * 255), g: Math.round(f(8) * 255), b: Math.round(f(4) * 255) };
}

/**
 * GET /avatar/:name.png — generates a colored circle with initial as PNG.
 * PNG is used for Web Push notification icons (SVG not supported on iOS).
 */
export default async function avatarRoutes(fastify: FastifyInstance): Promise<void> {
  // Also keep SVG endpoint for backwards compatibility
  fastify.get('/avatar/:name.svg', {
    schema: { params: { type: 'object', required: ['name'], properties: { name: { type: 'string' } } } },
  }, async (request, reply) => {
    const { name } = request.params as { name: string };
    const initial = name.charAt(0).toUpperCase();
    const { h, s, l } = hashColor(name);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96">
  <circle cx="48" cy="48" r="48" fill="hsl(${h}, ${s}%, ${l}%)"/>
  <text x="48" y="48" dy=".35em" text-anchor="middle" font-family="Arial,sans-serif" font-size="44" font-weight="600" fill="white">${initial}</text>
</svg>`;
    return reply.header('Content-Type', 'image/svg+xml').header('Cache-Control', 'public, max-age=86400').send(svg);
  });

  // PNG endpoint — for push notification icons
  fastify.get('/avatar/:name.png', {
    schema: { params: { type: 'object', required: ['name'], properties: { name: { type: 'string' } } } },
  }, async (request, reply) => {
    const { name } = request.params as { name: string };
    const initial = name.charAt(0).toUpperCase();
    const { h, s, l } = hashColor(name);
    const { r, g, b } = hslToRgb(h, s, l);

    const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96">
  <circle cx="48" cy="48" r="48" fill="rgb(${r},${g},${b})"/>
  <text x="48" y="48" dy=".35em" text-anchor="middle" font-family="Arial,sans-serif" font-size="44" font-weight="600" fill="white">${initial}</text>
</svg>`);

    const png = await sharp(svg).png().toBuffer();
    return reply.header('Content-Type', 'image/png').header('Cache-Control', 'public, max-age=86400').send(png);
  });
}
