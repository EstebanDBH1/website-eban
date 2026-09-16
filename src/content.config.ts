import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const articulos = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/articulos' }),
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
  loader: glob({ pattern: '**/*.md', base: './src/content/proyectos' }),
  schema: ({ image }) =>
    z.object({
      name: z.string(),
      year: z.number().int(),
      description: z.string(),
      stack: z.string(),
      status: z.string(),
      role: z.string(),
      href: z.string().default('#'),
      image: image().optional(),
      order: z.number().int(),
    }),
});

export const collections = { articulos, proyectos };
