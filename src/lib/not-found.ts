/** Respuesta 404 con la página propia (dist/404.html servida por ASSETS). */
export async function notFoundResponse(env: Env, url: URL): Promise<Response> {
  const fallback = await env.ASSETS?.fetch(new URL('/404.html', url).href);
  return new Response(fallback?.ok ? fallback.body : 'Página no encontrada', {
    status: 404,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
}
