import type { APIRoute } from 'astro';

/** Temporal: dice cuál de los dos módulos revienta al cargarse dentro de la función. */
export const prerender = false;

export const GET: APIRoute = async () => {
  const lines: string[] = [];

  const probe = async (label: string, work: () => Promise<unknown>) => {
    const start = Date.now();
    try {
      await work();
      lines.push(`${label}: OK en ${Date.now() - start} ms`);
    } catch (error) {
      const e = error as Error;
      lines.push(`${label}: FALLÓ en ${Date.now() - start} ms — ${e.name}: ${e.message}`);
    }
  };

  await probe('import satori', () => import('satori'));
  await probe('import resvg-wasm', () => import('@resvg/resvg-wasm'));

  await probe('fetch fuente', async () => {
    const r = await fetch('https://eban-page.netlify.app/fonts/newsreader-600.woff');
    return r.arrayBuffer();
  });

  await probe('fetch wasm', async () => {
    const r = await fetch('https://eban-page.netlify.app/resvg.wasm');
    return r.arrayBuffer();
  });

  await probe('initWasm', async () => {
    const { initWasm } = await import('@resvg/resvg-wasm');
    const r = await fetch('https://eban-page.netlify.app/resvg.wasm');
    return initWasm(await r.arrayBuffer());
  });

  return new Response(lines.join('\n'), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
};
