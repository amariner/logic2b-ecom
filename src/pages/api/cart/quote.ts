import type { APIRoute } from 'astro';
import { quoteCart, quoteRequestSchema } from '../../../lib/quote';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  if (locals.runtime.env.DEMO_MODE === 'true') {
    return Response.json(
      { error: 'La demo pública calcula el carrito localmente y no expone cotización remota.' },
      { status: 410 },
    );
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'JSON inválido' }, { status: 400 });
  }

  const parsed = quoteRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: 'Payload inválido', details: parsed.error.flatten() }, { status: 400 });
  }

  const result = await quoteCart(locals.runtime.env.DB, parsed.data);
  return Response.json(result);
};
