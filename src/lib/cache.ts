/**
 * Caché en el CDN de Netlify para las páginas que leen Supabase.
 *
 * Sin esto cada visita despierta la función y consulta la base: ~2,5 s de espera en frío.
 * Con esto el CDN responde con la copia guardada y la función solo corre cuando cambia algo.
 *
 * Publicar sigue siendo inmediato porque /admin llama a /api/purge después de cada cambio,
 * y esa ruta purga todo lo que lleva la etiqueta CONTENT_TAG. `maxAge` es solo la red de
 * seguridad por si una purga falla: en el peor caso, el cambio tarda eso en verse.
 * `swr` deja servir la copia vieja mientras se regenera la nueva en segundo plano, así que
 * nadie espera a la función ni siquiera cuando la copia caduca.
 */

/** Todas las páginas con contenido de Supabase la llevan; purgarla las renueva a la vez. */
export const CONTENT_TAG = 'content';

export const CONTENT_CACHE = {
  maxAge: 60 * 10,
  swr: 60 * 60 * 24 * 7,
  tags: [CONTENT_TAG],
};
