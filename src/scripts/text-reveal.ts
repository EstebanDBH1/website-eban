import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';

gsap.registerPlugin(ScrollTrigger, SplitText);

/**
 * Reveal de texto: cada elemento se divide en líneas y cada línea sube desde detrás de una
 * máscara, como si el texto saliera de la nada. Lo usan la portada y el modal de proyectos.
 *
 * - Todo pasa por una cola: aunque entren varios elementos a la vez (scroll rápido), cada uno
 *   espera su turno y arranca cuando empieza la última línea del anterior. Nunca se pisan.
 * - data-split="hero" (nombre e intro) va más lento; data-split, más ágil.
 * - data-split-group divide a sus hijos directos: para HTML que no podemos anotar, como el
 *   Markdown de los proyectos.
 *
 * El split NUNCA se revierte: el navegador puede cortar las líneas distinto que SplitText
 * (p. ej. por text-wrap: pretty) y al restaurar el HTML original las palabras saltarían de
 * renglón. En su lugar, al terminar se quita el recorte de las máscaras, que no afecta el layout.
 */

export const SPLIT_SELECTOR = '[data-split], [data-split-group] > *';

// Los saltos de línea dependen de la fuente: esperamos a Newsreader, pero sin bloquear de más.
const FONT_TIMEOUT_MS = 1000;
const HIDDEN = { yPercent: 105 };
const CLIPPED = { overflow: 'clip' };
// overflow: clip no crea contexto de formato, así que pasar a visible no mueve nada;
// solo evita recortar descendentes (g, p, j) y subrayados una vez revelado el texto.
const UNCLIPPED = { overflow: 'visible' };
// Tope del relevo entre elementos: con textos largos la cola avanzaría demasiado lento.
const MAX_HANDOFF = 0.6;
const HERO = { duration: 1.2, stagger: 0.09 };
const NORMAL = { duration: 1, stagger: 0.06 };

function fontsReady() {
  return Promise.race([
    document.fonts.ready,
    new Promise((resolve) => setTimeout(resolve, FONT_TIMEOUT_MS)),
  ]);
}

function byDocumentOrder(a: Element, b: Element) {
  return a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
}

export interface TextReveal {
  /** Los elementos divididos, en orden del documento. */
  elements: HTMLElement[];
  /** Encola elementos para revelarlos en cascada, uno tras otro. */
  reveal(elements: Element[], options?: { delay?: number }): void;
  /** Los deja visibles sin animar (p. ej. lo que quedó por encima de la pantalla). */
  showNow(elements: Element[]): void;
  /** Vuelve a ocultar todo y descarta la cola (para cuando el modal se reabre). */
  hideAll(): void;
  /** Mata animaciones y listeners. No revierte el split. */
  destroy(): void;
}

/**
 * Divide el texto de `root` (o de toda la página) y deja las líneas ocultas.
 *
 * El texto dentro de un <dialog> solo se divide cuando ese diálogo es el `root`: en uno cerrado
 * no hay medidas de línea, así que la portada no debe tocar el texto de los modales.
 */
export async function createTextReveal(root?: Element): Promise<TextReveal> {
  await fontsReady();

  const dialog = root instanceof HTMLDialogElement ? root : null;
  const elements = gsap.utils
    .toArray<HTMLElement>(SPLIT_SELECTOR, root)
    .filter((el) => el.closest('dialog') === dialog);

  const splits = new Map<Element, SplitText>();
  const state = new Map<Element, 'hidden' | 'queued' | 'done'>();
  const animations: gsap.core.Animation[] = [];
  let queue: Promise<void> = Promise.resolve();
  /** Sube con hideAll(): invalida lo que quedó en cola de una apertura anterior. */
  let generation = 0;
  let destroyed = false;

  const hideSplit = (split: SplitText) => {
    gsap.set(split.masks, CLIPPED);
    gsap.set(split.lines, HIDDEN);
  };

  const finishSplit = (split: SplitText) => {
    gsap.set(split.lines, { clearProps: 'transform' });
    gsap.set(split.masks, UNCLIPPED);
  };

  for (const el of elements) {
    state.set(el, 'hidden');
    splits.set(
      el,
      SplitText.create(el, {
        type: 'lines',
        mask: 'lines',
        aria: 'none',
        // Si cambia el ancho, se re-divide con los saltos de línea correctos.
        autoSplit: true,
        onSplit: (self) => (state.get(el) === 'done' ? finishSplit(self) : hideSplit(self)),
      }),
    );
  }

  /** Anima un elemento y resuelve cuando le toca el turno al siguiente (no cuando termina). */
  const revealElement = (el: HTMLElement, generationAtQueue: number) =>
    new Promise<void>((next) => {
      const split = splits.get(el);
      const lines = split?.lines ?? [];
      if (destroyed || generationAtQueue !== generation || !lines.length) return next();

      // Marcamos 'done' al arrancar: si se re-divide a mitad de la animación, sale ya visible.
      state.set(el, 'done');
      const { duration, stagger } = el.dataset.split === 'hero' ? HERO : NORMAL;

      animations.push(
        gsap.to(lines, {
          yPercent: 0,
          duration,
          ease: 'expo.out',
          stagger,
          clearProps: 'transform',
          onComplete: () => split && finishSplit(split),
        }),
        // El relevo es cuando arranca la última línea de este elemento: cascada continua.
        gsap.delayedCall(Math.min(lines.length * stagger, MAX_HANDOFF), next),
      );
    });

  return {
    elements,

    reveal(batch, options = {}) {
      const pending = [...batch].filter((el) => state.get(el) === 'hidden').sort(byDocumentOrder);
      if (!pending.length) return;

      const generationAtQueue = generation;

      if (options.delay) {
        queue = queue.then(
          () => new Promise<void>((next) => animations.push(gsap.delayedCall(options.delay!, next))),
        );
      }

      for (const el of pending) {
        state.set(el, 'queued');
        queue = queue.then(() => revealElement(el as HTMLElement, generationAtQueue));
      }
    },

    showNow(batch) {
      for (const el of batch) {
        const split = splits.get(el);
        if (!split) continue;
        state.set(el, 'done');
        finishSplit(split);
      }
    },

    hideAll() {
      generation++;
      queue = Promise.resolve();
      animations.forEach((animation) => animation.kill());
      animations.length = 0;

      for (const el of elements) {
        state.set(el, 'hidden');
        const split = splits.get(el);
        if (split) hideSplit(split);
      }
    },

    destroy() {
      destroyed = true;
      animations.forEach((animation) => animation.kill());
      // Solo apagamos autoSplit; sin revert (ver nota arriba).
      splits.forEach((split) => split.kill());
    },
  };
}

/**
 * Portada: lo que está en pantalla entra de una y el resto se revela al hacer scroll.
 * Devuelve la limpieza para llamar antes de salir de la página.
 */
export async function setupHomeTextReveal() {
  const reveal = await createTextReveal();

  // Al volver con "atrás" el scroll puede quedar abajo: lo que ya pasó se muestra sin animar.
  reveal.showNow(reveal.elements.filter((el) => el.getBoundingClientRect().bottom < 0));

  const triggers = ScrollTrigger.batch(reveal.elements, {
    start: 'top 92%',
    once: true,
    interval: 0.08,
    onEnter: (batch) => reveal.reveal(batch),
  });

  const toggle = gsap.from('[data-theme-toggle]', {
    autoAlpha: 0,
    duration: 0.8,
    delay: 0.3,
    ease: 'power2.out',
    clearProps: 'all',
  });

  return () => {
    triggers.forEach((trigger) => trigger.kill());
    toggle.kill();
    reveal.destroy();
  };
}
