import { gsap } from 'gsap';
import { setupHomeTextReveal, SPLIT_SELECTOR } from '@/scripts/text-reveal';

/**
 * Transiciones entre páginas con GSAP sobre el <ClientRouter /> de Astro.
 *
 * 1. astro:before-preparation → animamos la salida mientras se descarga la página nueva.
 * 2. astro:before-swap        → la página nueva entra oculta (data-page-enter) y conserva el tema.
 * 3. astro:page-load          → entrada:
 *    - páginas con [data-split] (la portada): reveal de texto por líneas + scroll (text-reveal.ts).
 *    - el resto: los bloques [data-reveal] aparecen en cascada.
 */

const REVEAL = '[data-reveal]';
const ENTER_ATTR = 'data-page-enter';

/**
 * Tope de espera antes de animar la entrada. Si algo tarda más, entramos igual; queda por
 * debajo del respaldo de 3 s de global.css, que muestra el contenido si el JS no corre.
 */
const READY_TIMEOUT_MS = 2000;

const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function nextFrame() {
  return new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}

/**
 * Espera a que lo que se ve al entrar esté listo: la fuente y las imágenes en pantalla.
 * Si la animación arranca antes, la fuente llega a mitad (las líneas se re-dividen y saltan)
 * y las fotos aparecen de golpe cuando el resto ya entró.
 */
async function pageReady() {
  // fonts.ready solo cuenta las fuentes que ya empezaron a cargar; pedirla la fuerza.
  const font = document.fonts.load(`1em ${getComputedStyle(document.body).fontFamily}`);
  const images = [...document.images].filter(
    // Las de un <dialog> cerrado no se ven, y las lazy fuera de pantalla nunca cargarían.
    (img) => !img.closest('dialog') && img.getBoundingClientRect().top < window.innerHeight,
  );
  const ready = Promise.all([
    font.then(() => document.fonts.ready),
    ...images.map((img) => img.decode().catch(() => {})),
  ]).catch(() => {});

  await Promise.race([ready, new Promise((resolve) => setTimeout(resolve, READY_TIMEOUT_MS))]);
  // Dos frames: el layout con la fuente real ya está asentado antes del primer cuadro animado.
  await nextFrame();
  await nextFrame();
}

/** Sube en cada salida; sirve para que cada página entre una sola vez y descartar entradas viejas. */
let navigation = 0;
let enteredNavigation = -1;
let cleanupPage: (() => void) | null = null;

function leave() {
  navigation++;
  cleanupPage?.();
  cleanupPage = null;

  const targets = gsap.utils.toArray<HTMLElement>(REVEAL);
  if (!targets.length || prefersReducedMotion()) return Promise.resolve();

  return new Promise<void>((resolve) => {
    gsap.to(targets, {
      autoAlpha: 0,
      y: -12,
      duration: 0.32,
      ease: 'power2.in',
      stagger: 0.025,
      overwrite: true,
      onComplete: resolve,
    });
  });
}

function revealBlocks() {
  const targets = gsap.utils.toArray<HTMLElement>(REVEAL);
  // Fijamos el estado inicial en línea antes de quitar el atributo que oculta por CSS: sin parpadeo.
  gsap.set(targets, { autoAlpha: 0, y: 18 });
  document.documentElement.removeAttribute(ENTER_ATTR);

  gsap.to(targets, {
    autoAlpha: 1,
    y: 0,
    duration: 0.8,
    ease: 'power3.out',
    stagger: 0.07,
    overwrite: true,
    clearProps: 'opacity,visibility,transform',
  });
}

async function enter() {
  const root = document.documentElement;
  if (enteredNavigation === navigation || !root.hasAttribute(ENTER_ATTR)) return;
  enteredNavigation = navigation;
  const current = navigation;

  await pageReady();
  // Si mientras esperábamos ya se navegó a otra página, descartamos esta entrada.
  if (current !== navigation) return;

  if (!document.querySelector(SPLIT_SELECTOR)) return revealBlocks();

  const cleanup = await setupHomeTextReveal();
  if (current !== navigation) return cleanup();

  cleanupPage = cleanup;
  // Las líneas ya están ocultas tras sus máscaras: podemos mostrar los bloques.
  root.removeAttribute(ENTER_ATTR);
}

document.addEventListener('astro:before-preparation', (event) => {
  const load = event.loader;
  event.loader = async () => {
    await Promise.all([leave(), load()]);
  };
});

document.addEventListener('astro:before-swap', (event) => {
  const nextRoot = event.newDocument.documentElement;
  const theme = document.documentElement.dataset.theme;
  if (theme) nextRoot.dataset.theme = theme;
  if (!prefersReducedMotion()) nextRoot.setAttribute(ENTER_ATTR, '');
});

// Primera carga: el módulo corre al terminar de parsear, sin esperar a `load` (que es cuando
// Astro dispara el primer astro:page-load; esa llamada se ignora gracias a enteredNavigation).
enter();
document.addEventListener('astro:page-load', enter);
