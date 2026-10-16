// @ts-check
import netlify from '@astrojs/netlify';
import { cacheNetlify } from '@astrojs/netlify/cache';
import { defineConfig, fontProviders } from 'astro/config';

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
  /*
    edgeFunctions: false solo apaga la emulación en `astro dev`. El sitio no tiene Edge
    Functions, y emularlas arranca Deno: si falta o es viejo, cada carga en local sale con un
    overlay de error encima de la página que bloquea los clics.
  */
  adapter: netlify({ devFeatures: { images: true, environmentVariables: false, edgeFunctions: false } }),

  /*
    Las páginas por petición se guardan en el CDN de Netlify (ver src/lib/cache.ts), así la
    mayoría de visitas no despiertan la función ni consultan Supabase. Al guardar en /admin
    se purga la caché (src/pages/api/purge.ts), de modo que publicar sigue siendo inmediato.
  */
  cache: { provider: cacheNetlify() },

  /*
    Solo afecta a `astro dev`. Vite no ve los plugins de GSAP hasta que la página los pide, y
    entonces re-empaqueta las dependencias en caliente; en Windows ese renombrado de carpeta
    falla (EPERM) y todos los scripts responden 504: ni tema, ni GSAP, ni transiciones.
    Declararlos aquí los empaqueta al arrancar.
  */
  vite: {
    optimizeDeps: {
      include: [
        'gsap',
        'gsap/ScrollTrigger',
        'gsap/SplitText',
        'gsap/CustomEase',
        'astro/virtual-modules/transitions-router.js',
        'astro/virtual-modules/transitions-events.js',
        'astro/virtual-modules/transitions-types.js',
        'astro/virtual-modules/transitions-swap-functions.js',
      ],
    },
  },

  /*
    PP Neue Montreal, servida desde el propio sitio. Solo tenemos el peso Medium, así que se
    declara como rango 400–700: el navegador usa ese archivo para todos los pesos en vez de
    inventar una negrita falsa. Si se añaden más pesos, cada uno va como su propia variante.
    Astro genera además una fuente de respaldo con las mismas métricas, para que el texto no
    salte al llegar la real.
  */
  fonts: [
    {
      provider: fontProviders.local(),
      name: 'PP Neue Montreal',
      cssVariable: '--font-montreal',
      fallbacks: ['Helvetica Neue', 'Arial', 'sans-serif'],
      options: {
        variants: [
          { src: ['./src/assets/fonts/PPNeueMontreal-Medium.woff2'], weight: '400 700', style: 'normal' },
        ],
      },
    },
  ],
});
