import type { APIRoute } from 'astro';
import { z } from 'zod';
import { createBundleOperations } from '../../../../composition/bundle-operations';
import { runtimePlatform } from '../../../../composition/runtime-platform';

export const prerender = false;

const component = z.object({
  productId: z.number().int().positive(),
  quantity: z.number().int().min(1).max(99),
}).strict();
const option = component.extend({ isDefault: z.boolean() }).strict();
const group = z.object({
  id: z.string().trim().regex(/^[a-z0-9](?:[a-z0-9-]{0,98}[a-z0-9])?$/),
  label: z.string().trim().min(2).max(120),
  minimumSelections: z.number().int().min(0).max(20),
  maximumSelections: z.number().int().min(1).max(20),
  options: z.array(option).min(1).max(100),
}).strict();
const common = {
  label: z.string().trim().min(2).max(120),
  state: z.enum(['active', 'disabled']),
  productId: z.number().int().positive(),
};
const schema = z.discriminatedUnion('kind', [
  z.object({ ...common, kind: z.literal('fixed'), components: z.array(component).min(1).max(100),
    groups: z.array(z.never()).max(0) }).strict(),
  z.object({ ...common, kind: z.literal('configurable'), components: z.array(z.never()).max(0),
    groups: z.array(group).min(1).max(20) }).strict(),
]);

export const GET: APIRoute = async ({ locals }) => {
  if (!runtimePlatform.hasCapabilityFlag('PRC-012', 'routes')) {
    return Response.json({ error: 'Bundles no habilitados.' }, { status: 403 });
  }
  return Response.json({ bundles: await createBundleOperations(locals.runtime.env.DB).list() });
};

export const POST: APIRoute = async ({ request, locals }) => {
  if (locals.runtime.env.DEMO_MODE === 'true') {
    return Response.json({ error: 'El panel público es una muestra de solo lectura.' }, { status: 403 });
  }
  if (!runtimePlatform.hasCapabilityFlag('PRC-012', 'sideEffects')) {
    return Response.json({ error: 'Bundles no habilitados.' }, { status: 403 });
  }
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'Datos inválidos', details: parsed.error.flatten() }, { status: 400 });
  try {
    const result = await createBundleOperations(locals.runtime.env.DB).create(parsed.data);
    if (result.outcome === 'product-not-found') return Response.json({ error: 'Hay productos inexistentes.' }, { status: 422 });
    if (result.outcome === 'conflict') return Response.json({ error: 'Ya existe un bundle para ese producto.' }, { status: 409 });
    return Response.json({ ok: true, bundle_id: result.bundleId }, { status: 201 });
  } catch (error) {
    if (error instanceof RangeError) return Response.json({ error: error.message }, { status: 422 });
    throw error;
  }
};
