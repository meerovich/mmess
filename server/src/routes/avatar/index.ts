import type { FastifyInstance } from 'fastify';

// Deterministic HSL color from string (same algorithm as client Avatar component)
function hashColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 55%, 45%)`;
}

/**
 * GET /avatar/:name.svg — generates a colored circle with initials.
 * Used as the `icon` field in Web Push notifications.
 */
export default async function avatarRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/avatar/:name.svg', {
    schema: {
      params: {
        type: 'object',
        required: ['name'],
        properties: { name: { type: 'string' } },
      },
    },
  }, async (request, reply) => {
    const { name } = request.params as { name: string };
    const initial = name.charAt(0).toUpperCase();
    const color = hashColor(name);

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96">
  <circle cx="48" cy="48" r="48" fill="${color}"/>
  <text x="48" y="48" dy=".35em" text-anchor="middle"
    font-family="Arial,sans-serif" font-size="44" font-weight="600" fill="white">
    ${initial}
  </text>
</svg>`;

    return reply
      .header('Content-Type', 'image/svg+xml')
      .header('Cache-Control', 'public, max-age=86400')
      .send(svg);
  });
}
