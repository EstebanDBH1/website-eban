import { createClient } from '@supabase/supabase-js';
import type { Loader } from 'astro/loaders';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '@/lib/supabase';

/**
 * Loader del Content Layer que trae el contenido de Supabase durante el build.
 *
 * La gracia de hacerlo como loader y no como una consulta suelta en cada página es que todo
 * lo de arriba sigue igual: getCollection, render(), <Content /> y <Image /> no se enteran
 * de que el origen dejó de ser Markdown. El cuerpo se pasa por renderMarkdown() del propio
 * Astro, así que se procesa con la misma configuración que tenían los .md.
 *
 * Lee con la clave anon, que por RLS solo ve las filas con draft = false: los borradores no
 * llegan al build ni por accidente.
 */

const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  // En el build no hay navegador ni sesión que mantener.
  auth: { persistSession: false, autoRefreshToken: false },
});

/** Columnas que tienen las dos tablas y que el loader necesita sí o sí. */
interface BaseRow {
  slug: string;
  body: string | null;
  sort_order: number;
  updated_at: string;
}

interface Options<TRow extends BaseRow> {
  table: 'posts' | 'projects';
  /** Traduce una fila de Postgres a los campos que esperan los componentes. */
  toData: (row: TRow) => Record<string, unknown>;
}

export function supabaseLoader<TRow extends BaseRow>({ table, toData }: Options<TRow>): Loader {
  return {
    name: `supabase:${table}`,

    async load({ store, parseData, renderMarkdown, generateDigest, logger }) {
      const { data, error } = await db
        .from(table)
        .select('*')
        .order('sort_order', { ascending: true });

      if (error) {
        // Romper el build es mejor que publicar un sitio vacío sin que nadie se entere.
        throw new Error(
          `No se pudo leer «${table}» de Supabase: ${error.message}\n` +
            'Si el proyecto está pausado por inactividad, reactívalo desde el panel de Supabase.',
        );
      }

      const rows = (data ?? []) as TRow[];
      store.clear();

      for (const row of rows) {
        store.set({
          id: row.slug,
          data: await parseData({ id: row.slug, data: toData(row) }),
          body: row.body ?? '',
          rendered: await renderMarkdown(row.body ?? ''),
          // updated_at cambia en cada edición (lo pone un trigger), así que basta como huella.
          digest: generateDigest(row.updated_at),
        });
      }

      logger.info(`${rows.length} de ${table}`);
    },
  };
}
