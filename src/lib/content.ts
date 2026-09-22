import { getLiveCollection, getLiveEntry } from 'astro:content';

/**
 * Acceso al contenido. Único sitio por el que deben pasar las páginas, para que el orden y
 * el manejo de errores sean iguales en todas.
 *
 * Las colecciones son *vivas* (src/live.config.ts): se consultan en cada petición, no en el
 * build. Por eso las páginas que llaman a esto llevan `prerender = false`.
 *
 * Si Supabase falla, lanzamos: mejor una página de error que una portada vacía que parezca
 * que no has escrito nada.
 */

export async function getPosts() {
  const { entries, error } = await getLiveCollection('posts');
  if (error) throw error;
  return (entries ?? []).sort((a, b) => a.data.order - b.data.order);
}

export async function getProjects() {
  const { entries, error } = await getLiveCollection('proyectos');
  if (error) throw error;
  return (entries ?? []).sort((a, b) => a.data.order - b.data.order);
}

/** Devuelve null si no existe, para que la página pueda responder 404. */
export async function getPost(slug: string) {
  const { entry, error } = await getLiveEntry('posts', slug);

  // getLiveEntry señala "no existe" con un error, no con entry vacío. Se distingue por el
  // nombre porque astro:content no expone la clase; un fallo real sí debe propagarse.
  if (error?.name === 'LiveEntryNotFoundError') return null;
  if (error) throw error;

  return entry ?? null;
}

export type Post = Awaited<ReturnType<typeof getPosts>>[number];
export type Project = Awaited<ReturnType<typeof getProjects>>[number];
