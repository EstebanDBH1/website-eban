/**
 * Tiempo de lectura a partir del texto, no de un campo que haya que mantener a mano.
 *
 * Lo usan los dos lados: la colección viva (src/live.config.ts), que es la fuente de verdad,
 * y el panel, que lo muestra mientras escribes. Al derivarse del cuerpo nunca se queda
 * desfasado: si editas el post, el tiempo se recalcula solo.
 */

/** Palabras por minuto de un lector medio en español. */
const WORDS_PER_MINUTE = 200;

/**
 * Deja solo el texto que de verdad se lee. Sin esto, una URL larga dentro de un enlace
 * contaría como palabras y un bloque de código inflaría el cálculo.
 */
function toPlainText(markdown: string) {
  return markdown
    .replace(/```[\s\S]*?```/g, ' ') // bloques de código
    .replace(/`[^`]*`/g, ' ') // código en línea
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ') // imágenes
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // enlaces: se queda el texto, no la URL
    .replace(/^#{1,6}\s+/gm, ' ') // títulos
    .replace(/^\s*>\s?/gm, ' ') // citas
    .replace(/^\s*[-+*]\s+/gm, ' ') // viñetas
    .replace(/^\s*\d+\.\s+/gm, ' ') // listas numeradas
    .replace(/[*_~]/g, ' '); // énfasis
}

export function countWords(markdown: string) {
  const text = toPlainText(markdown).trim();
  return text ? text.split(/\s+/).length : 0;
}

/** Devuelve algo como "5 min". Nunca baja de 1: "0 min de lectura" queda raro. */
export function readingTime(markdown: string) {
  return `${Math.max(1, Math.round(countWords(markdown) / WORDS_PER_MINUTE))} min`;
}
