import { describe, expect, it } from 'vitest';
import migration34 from '../migrations/0034_provider_subscriptions.sql?raw';
import { SqliteD1 } from './sqlite-d1';

const AT = '2026-08-17T12:00:00.000Z';

function beforeMigration(): SqliteD1 {
  return new SqliteD1(true, true, true, true, true, true, true, true, true, true, false);
}

function database(): SqliteD1 {
  const db = beforeMigration();
  db.sqlite.exec(migration34);
  db.sqlite.exec(`
    INSERT INTO products (id, slug, name, price_cents, stock, category)
    VALUES (1, 'subscription-product', 'Subscription product', 1200, 10, 'test');
    INSERT INTO product_variants (id, product_id, sku, title, price_cents, status, is_default, option_signature)
    VALUES (1, 1, 'SUB-1', '', 1200, 'active', 1, NULL);
    INSERT INTO subscription_plans (
      id, variant_id, state, label, amount_cents, currency, interval_unit,
      interval_count, provider_adapter, version, created_at, updated_at
    ) VALUES ('plan-test-01', 1, 'active', 'Configured plan', 1200, 'EUR', 'month',
      1, 'simulated-subscriptions', 1, '${AT}', '${AT}');
  `);
  return db;
}

const snapshot = JSON.stringify({
  schema: 1, plan_id: 'plan-test-01', plan_version: 1, variant_id: 1,
  amount_cents: 1200, currency: 'EUR', interval_unit: 'month', interval_count: 1,
});

function insertSubscription(db: SqliteD1, value = snapshot): void {
  db.sqlite.prepare(`INSERT INTO subscriptions (
    id, plan_id, plan_version, variant_id, provider_adapter,
    provider_subscription_reference, provider_customer_reference, contact_email,
    quantity, status, plan_snapshot_json, version, created_at, updated_at
  ) VALUES ('subscription-test-01', 'plan-test-01', 1, 1, 'simulated-subscriptions',
    'provider-sub-01', 'provider-customer-01', 'buyer@example.test', 2, 'active', ?, 1, ?, ?)`)
    .run(value, AT, AT);
}

describe('migración 0034 de suscripciones', () => {
  it('es expand-only, vacía y conserva las claves foráneas', () => {
    const db = beforeMigration();
    const before = db.query<{ name: string }>("SELECT name FROM sqlite_master WHERE type='table'").length;
    db.sqlite.exec(migration34);
    expect(db.query<{ name: string }>("SELECT name FROM sqlite_master WHERE type='table'").length)
      .toBe(before + 5);
    expect(db.value('SELECT count(*) AS value FROM subscription_plans')).toBe(0);
    expect(db.value('SELECT count(*) AS value FROM subscriptions')).toBe(0);
    expect(db.query('PRAGMA foreign_key_check')).toEqual([]);
  });

  it('rechaza snapshots manipulados y referencias de plan incoherentes', () => {
    const db = database();
    expect(() => insertSubscription(db, JSON.stringify({
      ...JSON.parse(snapshot), amount_cents: 1,
    }))).toThrow(/subscription_insert_conflict/);
    expect(() => insertSubscription(db, JSON.stringify({
      ...JSON.parse(snapshot), plan_version: 99,
    }))).toThrow(/subscription_insert_conflict/);
  });

  it('serializa versiones e impide ciclos sin un hecho de pago verificado', () => {
    const db = database();
    insertSubscription(db);
    db.sqlite.exec(`INSERT INTO subscription_provider_events (
      provider_adapter, provider_event_reference, provider_subscription_reference,
      event_type, payload_sha256, occurred_at, processed_at
    ) VALUES ('simulated-subscriptions', 'evt-failed-01', 'provider-sub-01',
      'payment_failed', '${'a'.repeat(64)}', '${AT}', '${AT}');`);
    const providerEventId = Number(db.value(`SELECT id AS value FROM subscription_provider_events`));
    db.sqlite.exec(`INSERT INTO subscription_events (
      subscription_id, provider_event_id, transition, from_status, to_status,
      plan_id_after, plan_version_after, failed_payment_count_after, version_after, occurred_at
    ) VALUES ('subscription-test-01', ${providerEventId}, 'payment_failed', 'active', 'past_due',
      'plan-test-01', 1, 1, 2, '${AT}');`);
    expect(() => db.sqlite.exec(`INSERT INTO subscription_events (
      subscription_id, provider_event_id, transition, from_status, to_status,
      plan_id_after, plan_version_after, failed_payment_count_after, version_after, occurred_at
    ) VALUES ('subscription-test-01', ${providerEventId}, 'payment_failed', 'active', 'past_due',
      'plan-test-01', 1, 1, 2, '${AT}')`)).toThrow(/UNIQUE|conflict/);
    expect(() => db.sqlite.exec(`INSERT INTO subscription_cycles (
      id, subscription_id, provider_cycle_reference, status, amount_cents, currency,
      attempt_count, failure_code, period_starts_at, period_ends_at,
      provider_event_id, created_at, updated_at
    ) VALUES ('cycle-invalid-01', 'subscription-test-01', 'cycle-01', 'paid', 2400, 'EUR',
      1, NULL, '${AT}', '${AT}', ${providerEventId}, '${AT}', '${AT}')`))
      .toThrow(/subscription_cycle_conflict/);
  });
});
