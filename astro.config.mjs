// @ts-check
import { defineConfig } from 'astro/config';

// https://docs.astro.build/en/reference/configuration-reference/
export default defineConfig({
  image: {
    // Las capturas de proyecto viven en Supabase Storage. Sin este permiso Astro
    // no optimiza imágenes remotas: las serviría tal cual las subiste.
    domains: ['gsfnqihfthshajlenrhd.supabase.co'],
  },
});
