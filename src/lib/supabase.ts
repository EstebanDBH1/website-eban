import { createClient } from '@supabase/supabase-js';

/**
 * Cliente de Supabase para el navegador (lo usa el panel de /admin).
 *
 * La clave publishable es pública a propósito: no es un secreto y no protege nada por sí
 * misma. Quien decide qué se puede leer y escribir es RLS — ver las políticas del proyecto
 * eban-db: el público solo ve filas con draft = false y escribir exige estar en admin_emails.
 */

export const SUPABASE_URL = import.meta.env.PUBLIC_SUPABASE_URL;
export const SUPABASE_ANON_KEY = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  // El fallo aparece en `astro sync`, antes de generar nada, porque content.config.ts
  // carga el loader y el loader carga este módulo. El mensaje cubre los dos entornos:
  // fallar solo con "copia el .env" despista cuando quien falla es el build del hosting.
  throw new Error(
    'Faltan PUBLIC_SUPABASE_URL y PUBLIC_SUPABASE_ANON_KEY.\n' +
      '· En local: copia .env.example a .env y rellénalas.\n' +
      '· En Netlify: Site configuration → Environment variables, con el scope «Builds» marcado.',
  );
}

/**
 * Cliente del navegador: guarda la sesión para que el panel no te eche al recargar.
 * El build usa el suyo propio, sin sesión (ver src/lib/supabase-loader.ts).
 */
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/** Bucket de las capturas de proyecto. Público en lectura, escritura solo admin. */
export const IMAGE_BUCKET = 'project-images';

/** Columnas comunes a las dos tablas. */
interface BaseRow {
  id: string;
  slug: string;
  year: number;
  body: string;
  sort_order: number;
  draft: boolean;
  created_at: string;
  updated_at: string;
}

export interface Post extends BaseRow {
  title: string;
  excerpt: string;
  reading_time: string;
}

export interface Project extends BaseRow {
  name: string;
  description: string;
  stack: string;
  status: string;
  role: string;
  href: string;
  image_url: string | null;
}

export type Row = Post | Project;
