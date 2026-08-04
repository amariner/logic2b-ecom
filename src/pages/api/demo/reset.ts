import type { APIRoute } from 'astro';

export const prerender = false;

/** El reset público se retiró: el cron interno restaura los fixtures. */
export const POST: APIRoute = async () => {
  return Response.json(
    { error: 'El reset público está deshabilitado; los fixtures se restauran internamente.' },
    { status: 410 },
  );
};
