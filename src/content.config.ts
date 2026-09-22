import { defineCollection } from 'astro:content';
import { z } from 'astro/zod';
import { readingTime } from '@/lib/reading-time';
import { supabaseLoader } from '@/lib/supabase-loader';

/**
 * El contenido vive en Supabase y se escribe desde /admin. Estas colecciones lo traen
 * durante el build (ver src/lib/supabase-loader.ts); el resto del sitio las consume
 * igual que cuando eran archivos Markdown.
 *
 * Los nombres de campo siguen siendo los de antes (readingTime, order, image) para que
 * las páginas y los componentes no tengan que saber cómo se llaman las columnas.
 */

const articulos = defineCollection({
  loader: supabaseLoader<{
    slug: string;
    title: string;
    excerpt: string;
    year: number;
    body: string | null;
    sort_order: number;
    draft: boolean;
    updated_at: string;
  }>({
    table: 'posts',
    toData: (row) => ({
      title: row.title,
      excerpt: row.excerpt,
      year: row.year,
      // Derivado del texto, no un campo que haya que mantener a mano.
      readingTime: readingTime(row.body ?? ''),
      order: row.sort_order,
      draft: row.draft,
    }),
  }),
  schema: z.object({
    title: z.string(),
    excerpt: z.string(),
    year: z.number().int(),
    readingTime: z.string(),
    /** Posición en la portada (menor = más arriba). */
    order: z.number().int(),
    draft: z.boolean().default(false),
  }),
});

const proyectos = defineCollection({
  loader: supabaseLoader<{
    slug: string;
    name: string;
    year: number;
    description: string;
    stack: string;
    status: string;
    role: string;
    href: string;
    image_url: string | null;
    body: string | null;
    sort_order: number;
    draft: boolean;
    updated_at: string;
  }>({
    table: 'projects',
    toData: (row) => ({
      name: row.name,
      year: row.year,
      description: row.description,
      stack: row.stack,
      status: row.status,
      role: row.role,
      href: row.href,
      image: row.image_url ?? undefined,
      order: row.sort_order,
      draft: row.draft,
    }),
  }),
  schema: z.object({
    name: z.string(),
    year: z.number().int(),
    description: z.string(),
    stack: z.string(),
    status: z.string(),
    role: z.string(),
    href: z.string().default('#'),
    /**
     * URL pública en Supabase Storage. Antes era una ruta a src/assets; ahora es remota,
     * y Astro la sigue optimizando gracias a image.domains en astro.config.mjs.
     */
    image: z.url().optional(),
    order: z.number().int(),
    draft: z.boolean().default(false),
  }),
});

export const collections = { articulos, proyectos };
