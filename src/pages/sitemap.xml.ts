import type { APIRoute } from 'astro';
import { CONTENT_CACHE } from '@/lib/cache';
import { getPosts } from '@/lib/content';

/**
 * Sitemap generado por petición.
 *
 * No sirve la integración @astrojs/sitemap: recorre las rutas del build, y aquí los posts
 * no existen hasta que alguien los pide. Este los saca de la base, así que un post nuevo
 * está en el sitemap en cuanto lo publicas.
 *
 * `lastmod` es lo que Google usa para decidir qué volver a rastrear; sale de updated_at.
 */

export const prerender = false;

export const GET: APIRoute = async ({ request, cache }) => {
  const { origin } = new URL(request.url);
  const posts = await getPosts().catch(() => []);

  // Si Supabase falló, no guardar en el CDN un sitemap sin posts.
  if (posts.length) cache.set(CONTENT_CACHE);

  const latest = posts.reduce<Date | undefined>(
    (max, post) => (!max || post.data.updated > max ? post.data.updated : max),
    undefined,
  );

  const urls = [
    { loc: `${origin}/`, lastmod: latest },
    ...posts.map((post) => ({ loc: `${origin}/posts/${post.id}/`, lastmod: post.data.updated })),
  ];

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls.map(
      ({ loc, lastmod }) =>
        `  <url><loc>${loc}</loc>${lastmod ? `<lastmod>${lastmod.toISOString()}</lastmod>` : ''}</url>`,
    ),
    '</urlset>',
  ].join('\n');

  return new Response(xml, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
};
