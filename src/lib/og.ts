import { initWasm, Resvg } from '@resvg/resvg-wasm';
import satori from 'satori';

/**
 * Tarjeta de 1200×630 que se ve al compartir un enlace en WhatsApp, X o LinkedIn.
 *
 * Se genera al vuelo con el título del post, así que cada uno tiene la suya aunque no
 * hayas subido ninguna imagen. Si el post sí tiene portada, la página usa esa en su lugar
 * y esto ni se llama.
 *
 * La fuente y el binario de resvg se piden al propio sitio (public/) en vez de importarlos:
 * así no dependemos de cómo empaquete el adaptador los archivos binarios. Ambos se guardan
 * en memoria tras la primera petición, de modo que solo cuestan en el arranque en frío.
 */

const WIDTH = 1200;
const HEIGHT = 630;

// Los mismos tokens que el tema oscuro de global.css.
const BG = '#1a1917';
const INK = '#ede6da';
const MUTED = '#989183';
const ACCENT = '#c9a06a';

let fontCache: Promise<ArrayBuffer> | null = null;
let wasmCache: Promise<unknown> | null = null;

function load(origin: string) {
  fontCache ??= fetch(`${origin}/fonts/newsreader-600.woff`).then((r) => r.arrayBuffer());
  // initWasm solo admite una llamada por proceso: cachear la promesa evita la segunda.
  wasmCache ??= initWasm(fetch(`${origin}/resvg.wasm`));
  return Promise.all([fontCache, wasmCache]);
}

/** Los títulos largos bajan de cuerpo para que siempre quepan sin cortarse. */
function titleSize(title: string) {
  if (title.length > 70) return 54;
  if (title.length > 45) return 64;
  return 74;
}

interface Card {
  title: string;
  /** Línea inferior izquierda: año y tiempo de lectura, o lo que aplique. */
  meta?: string;
  origin: string;
  host: string;
}

export async function renderCard({ title, meta, origin, host }: Card) {
  const [font] = await load(origin);

  const row = (children: unknown[], extra: Record<string, unknown> = {}) => ({
    type: 'div',
    props: {
      style: { display: 'flex', alignItems: 'center', ...extra },
      children,
    },
  });

  const text = (content: string, style: Record<string, unknown>) => ({
    type: 'div',
    props: { style: { display: 'flex', ...style }, children: content },
  });

  const svg = await satori(
    {
      type: 'div',
      props: {
        style: {
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          width: '100%',
          height: '100%',
          padding: '72px',
          backgroundColor: BG,
          fontFamily: 'Newsreader',
        },
        children: [
          row(
            [
              {
                type: 'div',
                props: {
                  style: {
                    width: '14px',
                    height: '14px',
                    borderRadius: '999px',
                    backgroundColor: ACCENT,
                  },
                },
              },
              text('Esteban Blanco', {
                fontSize: 24,
                color: MUTED,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
              }),
            ],
            { gap: '16px' },
          ),

          text(title, {
            fontSize: titleSize(title),
            color: INK,
            lineHeight: 1.14,
            letterSpacing: '-0.02em',
            // Sin esto, satori no reparte el texto en varias líneas.
            maxWidth: '100%',
          }),

          row(
            [
              text(meta ?? '', { fontSize: 24, color: MUTED }),
              text(host, { fontSize: 24, color: ACCENT }),
            ],
            { justifyContent: 'space-between' },
          ),
        ],
      },
    },
    {
      width: WIDTH,
      height: HEIGHT,
      fonts: [{ name: 'Newsreader', data: font, weight: 600, style: 'normal' }],
    },
  );

  return new Resvg(svg, { fitTo: { mode: 'width', value: WIDTH } }).render().asPng();
}
