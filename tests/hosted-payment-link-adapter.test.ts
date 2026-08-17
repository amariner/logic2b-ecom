import { describe, expect, it } from 'vitest';
import {
  createSimulatedHostedPaymentAdapter,
  planHostedPaymentLink,
} from '../src/modules/checkout';
import {
  approvePreliminaryOrder,
  createPreliminaryOrderDraft,
  issuePreliminaryOrder,
} from '../src/modules/orders';

const order = approvePreliminaryOrder(issuePreliminaryOrder(createPreliminaryOrderDraft({
  id: 'quote-adapter-01', currency: 'EUR', totalCents: 5000, depositCents: 1000,
  conversionGate: 'deposit', expiresAt: '2026-08-24T12:00:00.000Z',
}), '2026-08-17T10:00:00.000Z'), '2026-08-17T11:00:00.000Z');

describe('adaptador alojado simulado R4.11', () => {
  it('crea una sesión determinista sin red y confirma un hecho interno tipado', async () => {
    const adapter = createSimulatedHostedPaymentAdapter();
    const plan = planHostedPaymentLink({
      order, providerAdapter: adapter.id, idempotencyKey: 'quote-adapter-01:deposit',
      createdAt: '2026-08-17T12:00:00.000Z', expiresAt: '2026-08-18T12:00:00.000Z',
    });
    const first = await adapter.createSession(plan);
    const replay = await adapter.createSession(plan);
    expect(replay).toEqual(first);
    expect(first.url).toMatch(/^https:\/\/payments\.example\.test\/session\//);
    const event = await adapter.confirmInternally({
      plan, session: first, occurredAt: '2026-08-17T12:30:00.000Z',
    });
    expect(event).toMatchObject({
      verified: true,
      providerAdapter: adapter.id,
      payment: { confirmed: true, stage: 'deposit', amountCents: 1000, currency: 'EUR' },
    });
  });

  it('rechaza webhooks públicos y confirmación tras caducidad', async () => {
    const adapter = createSimulatedHostedPaymentAdapter();
    await expect(adapter.verifyEvent({ payload: '{}', signature: 'none' })).rejects.toThrow(/no acepta/);
    const plan = planHostedPaymentLink({
      order, providerAdapter: adapter.id, idempotencyKey: 'quote-adapter-01:expired',
      createdAt: '2026-08-17T12:00:00.000Z', expiresAt: '2026-08-18T12:00:00.000Z',
    });
    const session = await adapter.createSession(plan);
    await expect(adapter.confirmInternally({
      plan, session, occurredAt: '2026-08-18T12:00:00.000Z',
    })).rejects.toThrow(/caducado/);
  });
});
