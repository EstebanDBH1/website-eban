import { createClient } from '@supabase/supabase-js';
import { defineLiveCollection } from 'astro:content';
import type { LiveLoader } from 'astro/loaders';
import { marked } from 'marked';
import { readingTime } from '@/lib/reading-time';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '@/lib/supabase';

/**
 * Colecciones vivas: el contenido se consulta en cada petición, no en el build.
 *
 * Es lo que hace que publicar desde /admin se vea al recargar, sin reconstruir el sitio.
 * Las páginas que las usan llevan `prerender = false` y las sirve una función de Netlify.
 *
 * Diferencia con un loader de build: aquí no existe el renderMarkdown() de Astro, así que
 * el Markdown se convierte con `marked`. Se le añaden los id a los encabezados a mano para
 * no perder los anclajes que Astro generaba antes.
 *
 * Los borradores no hacen falta filtrarlos: se lee con la clave anon y RLS solo deja pasar
 * las filas con draft = false.
 */

const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/** "Un Subtítulo" → "un-subtitulo", igual que hacía Astro con los .md. */
function slugifyHeading(text: string) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/<[^>]*>/g, '')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

marked.use({
  renderer: {
    heading({ tokens, depth }) {
      const text = this.parser.parseInline(tokens);
      return `<h${depth} id="${slugifyHeading(text)}">${text}</h${depth}>\n`;
    },
  },
});

const render = (markdown: string | null) => marked.parse(markdown ?? '', { async: false });

interface PostRow {
  slug: string;
  title: string;
  excerpt: string;
  year: number;
  body: string | null;
  sort_order: number;
  updated_at: string;
}

interface ProjectRow {
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
  updated_at: string;
}

/** La fecha más reciente de la tanda, para que Netlify sepa cuándo cambió algo. */
const lastModified = (rows: Array<{ updated_at: string }>) =>
  rows.length ? new Date(Math.max(...rows.map((r) => Date.parse(r.updated_at)))) : undefined;

const postData = (row: PostRow) => ({
  title: row.title,
  excerpt: row.excerpt,
  year: row.year,
  readingTime: readingTime(row.body ?? ''),
  order: row.sort_order,
});

const projectData = (row: ProjectRow) => ({
  name: row.name,
  year: row.year,
  description: row.description,
  stack: row.stack,
  status: row.status,
  role: row.role,
  href: row.href,
  image: row.image_url ?? undefined,
  order: row.sort_order,
});

const postsLoader: LiveLoader<ReturnType<typeof postData>, { id: string }> = {
  name: 'supabase-live:posts',

  async loadCollection() {
    const { data, error } = await db
      .from('posts')
      .select('*')
      .order('sort_order', { ascending: true });

    if (error) return { error: new Error(error.message) };

    const rows = (data ?? []) as PostRow[];
    return {
      entries: rows.map((row) => ({
        id: row.slug,
        data: postData(row),
        rendered: { html: render(row.body) },
        cacheHint: { lastModified: new Date(row.updated_at), tags: [`post:${row.slug}`] },
      })),
      cacheHint: { lastModified: lastModified(rows), tags: ['posts'] },
    };
  },

  async loadEntry({ filter }) {
    const { data, error } = await db.from('posts').select('*').eq('slug', filter.id).maybeSingle();

    if (error) return { error: new Error(error.message) };
    if (!data) return undefined;

    const row = data as PostRow;
    return {
      id: row.slug,
      data: postData(row),
      rendered: { html: render(row.body) },
      cacheHint: { lastModified: new Date(row.updated_at), tags: [`post:${row.slug}`] },
    };
  },
};

const projectsLoader: LiveLoader<ReturnType<typeof projectData>, { id: string }> = {
  name: 'supabase-live:projects',

  async loadCollection() {
    const { data, error } = await db
      .from('projects')
      .select('*')
      .order('sort_order', { ascending: true });

    if (error) return { error: new Error(error.message) };

    const rows = (data ?? []) as ProjectRow[];
    return {
      entries: rows.map((row) => ({
        id: row.slug,
        data: projectData(row),
        rendered: { html: render(row.body) },
        cacheHint: { lastModified: new Date(row.updated_at), tags: [`project:${row.slug}`] },
      })),
      cacheHint: { lastModified: lastModified(rows), tags: ['projects'] },
    };
  },

  async loadEntry({ filter }) {
    const { data, error } = await db
      .from('projects')
      .select('*')
      .eq('slug', filter.id)
      .maybeSingle();

    if (error) return { error: new Error(error.message) };
    if (!data) return undefined;

    const row = data as ProjectRow;
    return {
      id: row.slug,
      data: projectData(row),
      rendered: { html: render(row.body) },
      cacheHint: { lastModified: new Date(row.updated_at), tags: [`project:${row.slug}`] },
    };
  },
};

export const collections = {
  articulos: defineLiveCollection({ loader: postsLoader }),
  proyectos: defineLiveCollection({ loader: projectsLoader }),
};
