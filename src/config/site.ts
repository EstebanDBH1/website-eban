export type Theme = 'dark' | 'light';

export const SITE = {
  name: 'Esteban Blanco',
  description: 'Construyo cosas para la web y exploro dónde la IA se vuelve herramienta.',
  lang: 'es',
  /** Tema inicial si el visitante nunca ha elegido uno. */
  defaultTheme: 'dark' as Theme,
  /** Color de acento: enlaces en hover y selección. Opciones del diseño: #c9a06a, #9cb3a0, #c98f7a, #8fa3c9 */
  accent: '#c9a06a',
  /** Muestra el año junto a cada artículo en la portada. */
  showYears: true,
  footer: 'Escribiendo desde Colombia. Siempre abierto a hablar de modelos, de tipografía o de café.',
};

export const SOCIAL_LINKS = [
  { label: 'GitHub', href: '#' },
  { label: 'X', href: '#' },
  { label: 'LinkedIn', href: '#' },
  { label: 'Correo', href: '#' },
];
