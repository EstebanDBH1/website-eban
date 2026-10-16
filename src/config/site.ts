export type Theme = 'dark' | 'light';

export const SITE = {
  name: 'Esteban Blanco',
  /**
   * Lo que acompaña al nombre en el título de la portada y en los datos estructurados.
   * Es lo primero que lee Google: las palabras por las que quieres que te encuentren van aquí.
   */
  tagline: 'Desarrollador web e IA',
  /** Descripción por defecto (portada y resultados de búsqueda). Ideal: 120–160 caracteres. */
  description:
    'Esteban Blanco, desarrollador web en Colombia. Escribo sobre desarrollo web, inteligencia artificial, vibe coding y automatización, y comparto lo que construyo.',
  lang: 'es',
  /** Para og:locale: español de Colombia. */
  locale: 'es_CO',
  /** Temas sobre los que escribes; van a los datos estructurados de la portada (knowsAbout). */
  topics: ['Desarrollo web', 'Inteligencia artificial', 'Vibe coding', 'Automatización', 'Diseño de interfaces'],
  /** Tema inicial si el visitante nunca ha elegido uno. */
  defaultTheme: 'dark' as Theme,
  /** Color de acento: enlaces en hover y selección. Opciones del diseño: #c9a06a, #9cb3a0, #c98f7a, #8fa3c9 */
  accent: '#c9a06a',
  /** Muestra el año junto a cada post en la portada. */
  showYears: true,
  footer: 'Escribiendo desde Colombia. Siempre abierto a hablar de modelos, de tipografía o de café.',
};

export const SOCIAL_LINKS = [
  { label: 'GitHub', href: '#' },
  { label: 'X', href: '#' },
  { label: 'LinkedIn', href: '#' },
  { label: 'Correo', href: '#' },
];
