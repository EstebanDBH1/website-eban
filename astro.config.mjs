// @ts-check
import netlify from '@astrojs/netlify';
import { defineConfig } from 'astro/config';

// https://docs.astro.build/en/reference/configuration-reference/
export default defineConfig({
  /*
    El sitio sigue siendo estático por defecto: /admin y cualquier página futura se generan
    en el build. Solo la portada y los artículos llevan `prerender = false`, porque necesitan
    leer Supabase en cada visita — es lo que hace que publicar se vea al recargar, sin deploy.
  */
  output: 'static',
  adapter: netlify(),
});
