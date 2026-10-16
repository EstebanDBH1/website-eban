import { createClient } from '@supabase/supabase-js';
import type { APIRoute } from 'astro';
import { CONTENT_TAG } from '@/lib/cache';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '@/lib/supabase';

/**
 * Purga la caché del CDN para que lo guardado en /admin se vea al recargar.
 *
 * Solo el admin puede llamarla: el panel manda su token de sesión y aquí se pregunta a
 * Supabase por is_admin() con ese mismo token. Sin la comprobación, cualquiera podría
 * vaciar la caché en bucle y tumbar el sitio a base de peticiones a la función.
 */

export const prerender = false;

export const POST: APIRoute = async ({ request, cache }) => {
  const token = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return new Response(null, { status: 401 });

  const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: isAdmin, error } = await db.rpc('is_admin');
  if (error || !isAdmin) return new Response(null, { status: 403 });

  // En `astro dev` no hay caché que purgar.
  if (cache.enabled) await cache.invalidate({ tags: [CONTENT_TAG] });

  return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
};
