import { describe, expect, it } from 'vitest';
import { createSubscriptionOperations } from '../src/composition/subscription-operations';
import { SqliteD1 } from './sqlite-d1';

const PERIOD_START = '2026-08-17T00:00:00.000Z';
const PERIOD_END = '2026-09-17T00:00:00.000Z';

function database(): SqliteD1 {
  const db = new SqliteD1();
  db.sqlite.exec(`
    INSERT INTO products (id, slug, name, price_cents, stock, category)
    VALUES (1, 'subscription-product', 'Subscription product', 1200, 10, 'test');
    INSERT INTO product_variants (id, product_id, sku, title, price_cents, status, is_default, option_signature)
    VALUES (1, 1, 'SUB-1', '', 1200, 'active', 1, NULL);
  `);
  return db;
}

async function setup(db: SqliteD1) {
  const operations = createSubscriptionOperations(db.asD1());
  const plan = await operations.createPlan({
    variantId: 1, state: 'active', label: 'Plan configured by project',
    amountCents: 1200, currency: 'EUR', intervalUnit: 'month', intervalCount: 1,
    providerAdapter: 'simulated-subscriptions', providerPlanReference: null,
  });
  if (plan.outcome !== 'applied') throw new Error('Plan setup failed.');
  const created = await operations.create({
    planId: plan.planId, contactEmail: 'buyer@example.test', quantity: 2,
    idempotencyKey: 'subscription-create-01',
  });
  if (created.outcome !== 'applied') throw new Error('Subscription setup failed.');
  return { operations, planId: plan.planId, subscriptionId: created.subscriptionId };
}

describe('runtime R4.10 de suscripciones', () => {
  it('crea y activa por adaptador sin guardar datos de tarjeta', async () => {
    const db = database();
    const { operations, subscriptionId } = await setup(db);
    expect(db.query(`SELECT status, quantity, failed_payment_count, version
      FROM subscriptions`)).toEqual([{ status: 'pending', quantity: 2,
      failed_payment_count: 0, version: 1 }]);
    expect(await operations.command({
      subscriptionId, expectedVersion: 1, action: 'activate',
      idempotencyKey: 'subscription-activate-01',
      periodStartsAt: PERIOD_START, periodEndsAt: PERIOD_END,
    })).toBe('applied');
    expect(db.query(`SELECT status, current_period_starts_at, current_period_ends_at, version
      FROM subscriptions`)).toEqual([{ status: 'active', current_period_starts_at: PERIOD_START,
      current_period_ends_at: PERIOD_END, version: 2 }]);
    const columns = db.query<{ name: string }>('PRAGMA table_info(subscriptions)').map((row) => row.name);
    expect(columns.some((name) => /card|pan|cvc/i.test(name))).toBe(false);
    expect(db.query(`SELECT event_type FROM event_outbox_events
      WHERE event_type LIKE 'subscriptions.%' ORDER BY created_at, event_id`))
      .toEqual(expect.arrayContaining([
        { event_type: 'subscriptions.subscription_created' },
        { event_type: 'subscriptions.subscription_activated' },
      ]));
  });

  it('registra impago, reintento y recuperación idempotentes por ciclo', async () => {
    const db = database();
    const { operations, subscriptionId } = await setup(db);
    await operations.command({
      subscriptionId, expectedVersion: 1, action: 'activate',
      idempotencyKey: 'subscription-activate-02',
      periodStartsAt: PERIOD_START, periodEndsAt: PERIOD_END,
    });
    const failed = {
      subscriptionId, expectedVersion: 2, action: 'payment_failed' as const,
      idempotencyKey: 'subscription-cycle-failed-01', cycleReference: 'invoice-cycle-01',
      attemptCount: 1, failureCode: 'insufficient_funds',
      periodStartsAt: PERIOD_START, periodEndsAt: PERIOD_END,
    };
    expect(await operations.command(failed)).toBe('applied');
    expect(await operations.command(failed)).toBe('duplicate');
    expect(db.query(`SELECT status, failed_payment_count, version FROM subscriptions`))
      .toEqual([{ status: 'past_due', failed_payment_count: 1, version: 3 }]);
    expect(await operations.command({
      subscriptionId, expectedVersion: 3, action: 'payment_succeeded',
      idempotencyKey: 'subscription-cycle-paid-02', cycleReference: 'invoice-cycle-01',
      attemptCount: 2, periodStartsAt: PERIOD_START, periodEndsAt: PERIOD_END,
    })).toBe('applied');
    expect(db.query(`SELECT status, attempt_count, failure_code, amount_cents, currency
      FROM subscription_cycles`)).toEqual([{
      status: 'paid', attempt_count: 2, failure_code: null, amount_cents: 2400, currency: 'EUR',
    }]);
    expect(db.query(`SELECT status, failed_payment_count, version FROM subscriptions`))
      .toEqual([{ status: 'active', failed_payment_count: 0, version: 4 }]);
    expect(db.query('PRAGMA foreign_key_check')).toEqual([]);
  });

  it('cambia plan, pausa, reanuda, cancela y crea portal efímero', async () => {
    const db = database();
    const { operations, subscriptionId } = await setup(db);
    await operations.command({ subscriptionId, expectedVersion: 1, action: 'activate',
      idempotencyKey: 'subscription-activate-03' });
    const nextPlan = await operations.createPlan({
      variantId: 1, state: 'active', label: 'Second project plan', amountCents: 1800,
      currency: 'EUR', intervalUnit: 'week', intervalCount: 2,
      providerAdapter: 'simulated-subscriptions', providerPlanReference: null,
    });
    if (nextPlan.outcome !== 'applied') throw new Error('Next plan setup failed.');
    expect(await operations.command({
      subscriptionId, expectedVersion: 2, action: 'change_plan', nextPlanId: nextPlan.planId,
      idempotencyKey: 'subscription-change-plan-01',
    })).toBe('applied');
    expect(await operations.command({
      subscriptionId, expectedVersion: 3, action: 'pause', idempotencyKey: 'subscription-pause-01',
    })).toBe('applied');
    expect(await operations.command({
      subscriptionId, expectedVersion: 4, action: 'resume', idempotencyKey: 'subscription-resume-01',
    })).toBe('applied');
    const portal = await operations.portal({ subscriptionId, returnUrl: 'https://example.test/account' });
    expect(portal).toMatchObject({ outcome: 'created', url: expect.stringMatching(/^https:\/\/subscriptions\.invalid/) });
    expect(db.value(`SELECT count(*) AS value FROM sqlite_master
      WHERE type='table' AND name LIKE '%portal%'`)).toBe(0);
    expect(await operations.command({
      subscriptionId, expectedVersion: 5, action: 'cancel_at_period_end',
      idempotencyKey: 'subscription-cancel-later-01',
    })).toBe('applied');
    expect(await operations.command({
      subscriptionId, expectedVersion: 6, action: 'cancel_now',
      idempotencyKey: 'subscription-cancel-now-01',
    })).toBe('applied');
    expect(db.query(`SELECT status, cancel_at_period_end, cancelled_at, version FROM subscriptions`))
      .toEqual([{ status: 'cancelled', cancel_at_period_end: 0,
        cancelled_at: expect.any(String), version: 7 }]);
  });
});
