// @ts-check
import netlify from '@astrojs/netlify';
import { defineConfig } from 'astro/config';

// https://docs.astro.build/en/reference/configuration-reference/
export default defineConfig({
  /*
    El sitio sigue siendo estático por defecto: /admin y cualquier página futura se generan
    en el build. Solo la portada y los posts llevan `prerender = false`, porque necesitan
    leer Supabase en cada visita — es lo que hace que publicar se vea al recargar, sin deploy.
  */
  // Base de las URL canonicas y del sitemap. Cambiala si pones dominio propio.
  site: 'https://eban-page.netlify.app',
  output: 'static',
  adapter: netlify(),
});
