import type { APIRoute } from 'astro';
import { getPosts } from '@/lib/content';

/**
 * Sitemap generado por petición.
 *
 * No sirve la integración @astrojs/sitemap: recorre las rutas del build, y aquí los posts
 * no existen hasta que alguien los pide. Este los saca de la base, así que un post nuevo
 * está en el sitemap en cuanto lo publicas.
 */

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  const { origin } = new URL(request.url);
  const posts = await getPosts().catch(() => []);

  const urls = [
    { loc: `${origin}/`, priority: '1.0' },
    ...posts.map((post) => ({ loc: `${origin}/posts/${post.id}/`, priority: '0.8' })),
  ];

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls.map(({ loc, priority }) => `  <url><loc>${loc}</loc><priority>${priority}</priority></url>`),
    '</urlset>',
  ].join('\n');

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
};
