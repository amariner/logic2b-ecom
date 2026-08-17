import type { APIRoute } from 'astro';
import { z } from 'zod';
import { createStoredValueOperations } from '../../../../composition/stored-value-operations';
import { runtimePlatform } from '../../../../composition/runtime-platform';

export const prerender = false;

const policy = z.object({
  legalReviewReference: z.string().trim().min(3).max(200),
  funding: z.enum(['purchased', 'promotional', 'refund', 'manual']),
  expiry: z.enum(['none', 'fixed']),
  transferability: z.enum(['not_enabled', 'project_defined']),
  cashOut: z.enum(['not_enabled', 'project_defined']),
}).strict();

const schema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('gift_card'), label: z.string().trim().min(2).max(120),
    currency: z.string().trim().length(3), amountCents: z.number().int().positive(),
    expiresAt: z.string().datetime({ offset: false }).nullable(), policy,
    idempotencyKey: z.string().regex(/^[a-zA-Z0-9_-]{8,100}$/),
  }).strict(),
  z.object({
    kind: z.literal('store_credit'), label: z.string().trim().min(2).max(120),
    currency: z.string().trim().length(3), amountCents: z.number().int().positive(),
    ownerKeyHash: z.string().regex(/^[a-fA-F0-9]{64}$/),
    expiresAt: z.string().datetime({ offset: false }).nullable(), policy,
    idempotencyKey: z.string().regex(/^[a-zA-Z0-9_-]{8,100}$/),
  }).strict(),
]);

function enabled(flag: 'routes' | 'sideEffects'): boolean {
  return runtimePlatform.hasCapabilityFlag('PRC-010', flag) ||
    runtimePlatform.hasCapabilityFlag('PRC-011', flag);
}

export const GET: APIRoute = async ({ locals }) => {
  if (!enabled('routes')) return Response.json({ error: 'Valor almacenado no habilitado.' }, { status: 403 });
  return Response.json({ accounts: await createStoredValueOperations(locals.runtime.env.DB).list() }, {
    headers: { 'cache-control': 'no-store' },
  });
};

export const POST: APIRoute = async ({ request, locals }) => {
  if (locals.runtime.env.DEMO_MODE === 'true') {
    return Response.json({ error: 'El panel público es una muestra de solo lectura.' }, { status: 403 });
  }
  if (!enabled('sideEffects')) return Response.json({ error: 'Valor almacenado no habilitado.' }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'Datos inválidos', details: parsed.error.flatten() }, { status: 400 });
  try {
    const result = await createStoredValueOperations(locals.runtime.env.DB).issue(parsed.data);
    if (result.outcome === 'conflict') {
      return Response.json({ error: 'La emisión ya existe o el saldo cambió.' }, { status: 409 });
    }
    return Response.json({ ok: true, account_id: result.accountId,
      ...(result.giftCardCode === undefined ? {} : { gift_card_code: result.giftCardCode }) },
    { status: 201, headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    if (error instanceof RangeError) return Response.json({ error: error.message }, { status: 422 });
    throw error;
  }
};
