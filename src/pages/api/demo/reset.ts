import type { APIRoute } from 'astro';

export const prerender = false;

/** La demo conserva fixtures de solo lectura y no tiene reset de servidor. */
export const POST: APIRoute = async () => {
  return Response.json(
    { error: 'El reset de servidor está deshabilitado; solo se puede reiniciar el recorrido local del navegador.' },
    { status: 410 },
  );
};
