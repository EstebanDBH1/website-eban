import type { APIRoute } from 'astro';
import { SITE } from '@/config/site';
import { getPost } from '@/lib/content';
import { renderCard } from '@/lib/og';

/**
 * Imagen de compartir de cada post: /og/<slug>.png
 *
 * El slug "home" devuelve la tarjeta del sitio, que usan la portada y el 404.
 * Se sirve por petición y se cachea un día en el CDN: quien la pide son los rastreadores
 * de WhatsApp, X y compañía, no los visitantes.
 */

export const prerender = false;

export const GET: APIRoute = async ({ params, request }) => {
  const { origin, host } = new URL(request.url);
  const slug = params.slug ?? 'home';

  let title = SITE.name;
  let meta = SITE.description;

  if (slug !== 'home') {
    // Una tarjeta rota no debe tumbar el enlace: si el post no está, cae a la del sitio.
    const post = await getPost(slug).catch(() => null);
    if (post) {
      title = post.data.title;
      meta = `${post.data.year} · ${post.data.readingTime} de lectura`;
    }
  }

  const png = await renderCard({ title, meta, origin, host });

  return new Response(new Uint8Array(png), {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
    },
  });
};
