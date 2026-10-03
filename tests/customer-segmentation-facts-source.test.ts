import { describe, expect, it } from 'vitest';
import { SqliteD1 } from './sqlite-d1';
import { createD1CustomerSegmentFactsSource } from '../src/composition/customer-segmentation-facts';
import { createPreliminaryOrderOperations } from '../src/composition/preliminary-order-operations';
import { createD1CustomerSegmentationRepository } from '../src/modules/customers/infrastructure/d1-customer-segmentation-repository';
import { CustomerSegmentationContractError, type CustomerSegmentTemplate } from '../src/modules/customers/domain/customer-segmentation';
import type { CustomerSegmentFactsPolicy } from '../src/modules/customers/application/customer-segmentation-facts';

const CREATED = '2026-09-01T10:00:00.000Z';
const ORDERED = '2026-09-10T10:00:00.000Z';
const CAPTURED = '2026-09-15T10:00:00.000Z';
const REQUESTED = '2026-09-18T10:00:00.000Z';
const now = () => Date.parse('2099-01-01T00:00:00.000Z');
const policy: CustomerSegmentFactsPolicy = {
  schemaVersion: 1, id: 'test.only', version: 1, population: 'active_profiles',
  orderStatuses: ['paid', 'shipped', 'delivered'], orderEligibility: 'successful_capture',
  activityBasis: 'last_successful_capture', amountBasis: 'captured_payments',
  refunds: 'subtract', storedValue: 'include', paymentAdjustments: 'reject',
  unsettledPayments: 'reject', missingPaymentEvidence: 'null', currency: 'EUR',
  foreignCurrency: 'exclude_orders', dayBoundary: 'elapsed_24h_floor',
};

function addProfile(db: SqliteD1, index = 1): string {
  const id = `profile:${String(index).padStart(3, '0')}`;
  db.sqlite.prepare(`INSERT INTO customer_profiles
    (id,primary_email,email_identity_hash,status,version,created_at,updated_at)
    VALUES (?,?,?,'active',1,?,?)`)
    .run(id, `private-${index}@example.test`, index.toString(16).padStart(64, '0'), CREATED, CREATED);
  return id;
}

function addOrder(db: SqliteD1, profileId: string | null, id = 1,
  options: { amount?: number; status?: string; currency?: string } = {}): number {
  const amount = options.amount ?? 1000;
  db.sqlite.prepare(`INSERT INTO orders
    (id,order_number,email,customer_name,address_json,subtotal_cents,shipping_cents,
     total_cents,status,currency,customer_profile_id,created_at,updated_at)
    VALUES (?,?,'buyer-private@example.test','Nombre privado','{"street":"Calle privada"}',?,0,?,?,?,?,?,?)`)
    .run(id, `ORDER-${id}`, amount, amount, options.status ?? 'paid', options.currency ?? 'EUR',
      profileId, ORDERED, ORDERED);
  return id;
}

function addPayment(db: SqliteD1, orderId: number, amount = 1000, storedValue = 0): number {
  const result = db.sqlite.prepare(`INSERT INTO payments
    (order_id,provider,currency,expected_amount_cents,stored_value_expected_cents,status,
     idempotency_key,created_at,updated_at)
    VALUES (?,'simulated','EUR',?,?,'captured',?,?,?)`)
    .run(orderId, amount, storedValue, `payment:${orderId}`, CAPTURED, CAPTURED);
  const paymentId = Number(result.lastInsertRowid);
  addTransaction(db, paymentId, 'capture', amount);
  return paymentId;
}

function addTransaction(db: SqliteD1, paymentId: number, type: string,
  amount: number, status = 'succeeded'): void {
  const suffix = db.value('SELECT count(*) AS value FROM payment_transactions');
  db.sqlite.prepare(`INSERT INTO payment_transactions
    (payment_id,type,amount_cents,currency,status,idempotency_key,occurred_at,created_at)
    VALUES (?,?,?,'EUR',?,?,?,?)`)
    .run(paymentId, type, amount, status, `transaction:${String(suffix)}`, CAPTURED, CAPTURED);
}

function fixture() {
  const db = new SqliteD1();
  const profileId = addProfile(db);
  const orderId = addOrder(db, profileId);
  const paymentId = addPayment(db, orderId);
  return { db, profileId, orderId, paymentId };
}

const source = (db: SqliteD1, selectedPolicy = policy) =>
  createD1CustomerSegmentFactsSource(db.asD1(), selectedPolicy, { now });

describe('captura D1 consistente de hechos de segmentación R5.6c.1', () => {
  it('recorre captura, inicio, lotes, cierre y publicación con hechos monetarios reales', async () => {
    const { db, profileId, paymentId } = fixture();
    const noOrders = addProfile(db, 2);
    addTransaction(db, paymentId, 'refund', 200);
    const snapshot = await source(db).capture();
    expect(snapshot.candidates.map((candidate) => candidate.customerProfileId)).toEqual([profileId, noOrders]);
    expect(snapshot.candidates[0]!.facts).toEqual({
      'customer.age_days': Math.floor((Date.parse(snapshot.capturedAt) - Date.parse(CREATED)) / 86_400_000),
      'orders.count': 1,
      'orders.days_since_last': Math.floor((Date.parse(snapshot.capturedAt) - Date.parse(CAPTURED)) / 86_400_000),
      'orders.total_spent_cents': 800,
    });
    expect(snapshot.candidates[1]!.facts).toMatchObject({
      'orders.count': 0, 'orders.days_since_last': null, 'orders.total_spent_cents': 0,
    });
    const repo = createD1CustomerSegmentationRepository(db.asD1(), { now });
    const context = (key: string, occurredAt = snapshot.capturedAt) => ({
      actorId: 'system:synthetic', idempotencyKey: `source-integration:${key}`, occurredAt,
    });
    const template: CustomerSegmentTemplate = {
      id: 'synthetic-spend', version: 1,
      parameters: [{ name: 'minimum', min: 0, max: 10000 }],
      conditions: [{ fact: 'orders.total_spent_cents', operator: 'gte', parameter: 'minimum' }],
    };
    await repo.appendDefinition({ ...context('definition', REQUESTED), segmentId: 'synthetic',
      expectedVersion: 0, template, parameters: { minimum: 750 } });
    const run = (await repo.requestRun({ ...context('request', REQUESTED),
      segmentId: 'synthetic', definitionVersion: 1 })).value;
    const started = (await repo.startRun({ ...context('start'), runId: run.runId,
      expectedRevision: 1, snapshot })).value;
    const first = (await repo.appendProgress({ ...context('first'), runId: run.runId,
      expectedRevision: started.revision, cursor: started.cursor!, limit: 1 })).value;
    await expect(repo.readMembership('synthetic', profileId)).resolves.toEqual({ state: 'unpublished' });
    const last = (await repo.appendProgress({ ...context('last'), runId: run.runId,
      expectedRevision: first.revision, cursor: first.cursor!, limit: 1 })).value;
    await repo.completeRun({ ...context('complete'), runId: run.runId, expectedRevision: last.revision });
    await repo.publish({ ...context('publish'), runId: run.runId,
      segmentId: 'synthetic', expectedPublicationVersion: 0 });
    await expect(repo.readMembership('synthetic', profileId)).resolves.toMatchObject({ state: 'evaluated', matches: true });
    await expect(repo.readMembership('synthetic', noOrders)).resolves.toMatchObject({ state: 'evaluated', matches: false });
    expect(db.query('PRAGMA foreign_key_check')).toEqual([]);
  });

  it('conserva la captura original cuando llegan pedidos y cambia la versión del perfil', async () => {
    const { db, profileId } = fixture();
    const original = await source(db).capture();
    const saved = JSON.stringify(original);
    addPayment(db, addOrder(db, profileId, 2, { amount: 500 }), 500);
    db.sqlite.prepare('UPDATE customer_profiles SET version=version+1 WHERE id=?').run(profileId);
    const next = await source(db).capture();
    expect(JSON.stringify(original)).toBe(saved);
    expect(Object.isFrozen(original)).toBe(true);
    expect(Object.isFrozen(original.candidates)).toBe(true);
    expect(Object.isFrozen(original.candidates[0]!.facts)).toBe(true);
    expect(next.candidates[0]).toMatchObject({ customerProfileVersion: 2,
      facts: { 'orders.count': 2, 'orders.total_spent_cents': 1500 } });
    expect(next.ref).not.toBe(original.ref);
  });

  it.each([0, 100])('captura la población completa de %i perfiles sin inventar pedidos', async (size) => {
    const db = new SqliteD1();
    for (let index = size; index > 0; index--) addProfile(db, index);
    const snapshot = await source(db).capture();
    expect(snapshot.candidates).toHaveLength(size);
    expect(snapshot.candidates.map((candidate) => candidate.customerProfileId))
      .toEqual([...snapshot.candidates.map((candidate) => candidate.customerProfileId)].sort());
    expect(snapshot.candidates.every((candidate) => candidate.facts['orders.count'] === 0)).toBe(true);
  });

  it('rechaza 101 perfiles sin devolver una población truncada ni escribir resultados', async () => {
    const db = new SqliteD1();
    for (let index = 1; index <= 101; index++) addProfile(db, index);
    await expect(source(db).capture()).rejects.toBeInstanceOf(CustomerSegmentationContractError);
    expect(db.value('SELECT count(*) AS value FROM customer_segment_results')).toBe(0);
  });

  it('rechaza el exceso de pedidos de un perfil aunque algunos no sean elegibles', async () => {
    const db = new SqliteD1();
    const profileId = addProfile(db);
    for (let index = 1; index <= 1001; index++) addOrder(db, profileId, index, { status: 'pending' });
    await expect(source(db).capture()).rejects.toBeInstanceOf(CustomerSegmentationContractError);
  });

  it('excluye perfiles fusionados y pedidos sin propietario sin exponer datos de contacto', async () => {
    const { db, profileId } = fixture();
    const merged = addProfile(db, 2);
    db.sqlite.prepare(`UPDATE customer_profiles SET status='merged',merged_into_profile_id=?,version=2 WHERE id=?`)
      .run(profileId, merged);
    addPayment(db, addOrder(db, merged, 2));
    addPayment(db, addOrder(db, null, 3));
    const snapshot = await source(db).capture();
    expect(snapshot.candidates).toHaveLength(1);
    expect(snapshot.candidates[0]!.facts['orders.count']).toBe(1);
    expect(JSON.stringify(snapshot)).not.toMatch(/@|Nombre privado|Calle privada|email_identity_hash|address_json/);
  });

  it('liga la referencia al contenido de la política aunque coincidan sus nombres y versiones', async () => {
    const { db, paymentId } = fixture();
    addTransaction(db, paymentId, 'refund', 200);
    const net = await source(db).capture();
    const gross = await source(db, { ...policy, refunds: 'ignore' }).capture();
    expect(net.ref).toMatch(/^source:[a-f0-9]{64}:[a-f0-9]{64}$/);
    expect(gross.ref.split(':')[1]).not.toBe(net.ref.split(':')[1]);
    expect(net.policyId).toBe(gross.policyId);
    expect(net.policyVersion).toBe(gross.policyVersion);
    expect(net.candidates[0]!.facts['orders.total_spent_cents']).toBe(800);
    expect(gross.candidates[0]!.facts['orders.total_spent_cents']).toBe(1000);
  });

  it('no convierte un pedido pagado sin ledger en un gasto conocido de cero', async () => {
    const db = new SqliteD1();
    addOrder(db, addProfile(db));
    const snapshot = await source(db).capture();
    expect(snapshot.candidates[0]!.facts['orders.total_spent_cents']).toBeNull();
  });

  it('un checkout pendiente con intención sin asientos no bloquea los pedidos pagados del perfil', async () => {
    const { db, profileId } = fixture();
    const pendingOrder = addOrder(db, profileId, 2, { status: 'pending' });
    db.sqlite.prepare(`INSERT INTO payments
      (order_id,provider,currency,expected_amount_cents,status,idempotency_key,created_at,updated_at)
      VALUES (?,'simulated','EUR',1000,'pending','source:pending-payment',?,?)`)
      .run(pendingOrder, ORDERED, ORDERED);
    const snapshot = await source(db).capture();
    expect(snapshot.candidates[0]!.facts).toMatchObject({ 'orders.count': 1, 'orders.total_spent_cents': 1000 });
  });

  it('conserva depósitos previos al pedido tras convertir un presupuesto cobrado en el runtime real', async () => {
    const db = new SqliteD1();
    const profileId = addProfile(db);
    db.sqlite.exec(`INSERT INTO products (id,slug,name,price_cents,stock,category)
      VALUES (1,'source-deposit','Producto de prueba',1000,3,'test');
      INSERT INTO product_variants (id,product_id,sku,title,price_cents,status,is_default,option_signature)
      VALUES (1,1,'SOURCE-DEPOSIT','',1000,'active',1,NULL);
      INSERT INTO inventory_balances (variant_id,on_hand,reserved,version,reservation_version)
      VALUES (1,3,0,1,1);
      INSERT INTO inventory_movements (variant_id,delta,reason,balance_after,version_after,
        actor_kind,actor_id,reference_type,reference_id,idempotency_key,correlation_id,occurred_at)
      VALUES (1,3,'legacy_opening_balance',3,1,'system','source-test','test','1',
        'source:inventory-opening','inventory:variant:1','2026-09-01T10:00:00.000Z');`);
    const operations = createPreliminaryOrderOperations(db.asD1());
    const created = await operations.create({ email: 'deposit-private@example.test', customerName: 'Cliente de prueba',
      addressJson: '{}', currency: 'EUR', shippingCents: 0, depositCents: 400,
      conversionGate: 'full_payment', expiresAt: '2099-01-01T00:00:00.000Z',
      lines: [{ variantId: 1, quantity: 1 }], idempotencyKey: 'source:quote-create' });
    if (!('id' in created)) throw new Error('No se creó el presupuesto sintético.');
    const id = created.id;
    expect(await operations.transition({ id, expectedVersion: 1, action: 'issue',
      idempotencyKey: 'source:quote-issue', at: ORDERED })).toBe('applied');
    expect(await operations.transition({ id, expectedVersion: 2, action: 'approve',
      idempotencyKey: 'source:quote-approve', at: '2026-09-10T10:01:00.000Z' })).toBe('applied');
    const deposit = await operations.createPaymentLink({ id, idempotencyKey: 'source:deposit-link',
      createdAt: '2026-09-11T10:00:00.000Z', expiresAt: '2026-09-20T10:00:00.000Z' });
    if (!('link' in deposit)) throw new Error('No se creó el enlace de depósito.');
    const depositAt = '2026-09-12T10:00:00.000Z';
    const balanceAt = '2026-09-13T10:00:00.000Z';
    expect(await operations.confirmSimulatedPayment({ linkId: deposit.link.id, occurredAt: depositAt })).toBe('applied');
    const balance = await operations.createPaymentLink({ id, idempotencyKey: 'source:balance-link',
      createdAt: '2026-09-12T11:00:00.000Z', expiresAt: '2026-09-20T10:00:00.000Z' });
    if (!('link' in balance)) throw new Error('No se creó el enlace de saldo.');
    expect(await operations.confirmSimulatedPayment({ linkId: balance.link.id, occurredAt: balanceAt })).toBe('applied');
    expect(await operations.convert({ id, expectedVersion: 5, idempotencyKey: 'source:quote-convert',
      convertedAt: '2026-09-14T10:00:00.000Z', reservationExpiresAt: '2099-01-01T00:00:00.000Z' })).toBe('applied');
    db.sqlite.prepare('UPDATE orders SET customer_profile_id=?').run(profileId);
    expect(db.value('SELECT status AS value FROM orders')).toBe('paid');
    expect(db.value(`SELECT count(*) AS value FROM payment_transactions t JOIN payments p ON p.id=t.payment_id
      JOIN orders o ON o.id=p.order_id WHERE julianday(t.occurred_at)<julianday(o.created_at)`)).toBe(2);
    const last = await source(db).capture();
    const first = await source(db, { ...policy, activityBasis: 'first_successful_capture' }).capture();
    expect(last.candidates[0]!.facts).toMatchObject({ 'orders.count': 1, 'orders.total_spent_cents': 1000,
      'orders.days_since_last': Math.floor((Date.parse(last.capturedAt) - Date.parse(balanceAt)) / 86_400_000) });
    expect(first.candidates[0]!.facts['orders.days_since_last']).toBe(
      Math.floor((Date.parse(first.capturedAt) - Date.parse(depositAt)) / 86_400_000),
    );
  });

  it('rechaza ajustes monetarios sin dirección en la política sintética estricta', async () => {
    const { db, paymentId } = fixture();
    addTransaction(db, paymentId, 'adjustment', 200);
    await expect(source(db).capture()).rejects.toBeInstanceOf(CustomerSegmentationContractError);
  });

  it('ignora autorizaciones y cobros fallidos cuando la política los excluye', async () => {
    const { db, paymentId } = fixture();
    addTransaction(db, paymentId, 'authorization', 1000);
    addTransaction(db, paymentId, 'capture', 500, 'failed');
    const snapshot = await source(db, { ...policy, unsettledPayments: 'exclude' }).capture();
    expect(snapshot.candidates[0]!.facts['orders.total_spent_cents']).toBe(1000);
    expect(snapshot.candidates[0]!.facts['orders.count']).toBe(1);
  });

  it('combina cobro externo y saldo, restando cada devolución una sola vez', async () => {
    const db = new SqliteD1();
    const orderId = addOrder(db, addProfile(db));
    const paymentId = addPayment(db, orderId, 600, 400);
    addTransaction(db, paymentId, 'refund', 200);
    const refundId = Number(db.sqlite.prepare(`INSERT INTO refunds
      (order_id,payment_id,status,reason,subtotal_cents,shipping_cents,total_cents,
       idempotency_key,created_at,updated_at)
      VALUES (?,?,'succeeded','Synthetic refund',300,0,300,'source:refund',?,?)`)
      .run(orderId, paymentId, CAPTURED, CAPTURED).lastInsertRowid);
    db.sqlite.prepare(`INSERT INTO stored_value_accounts
      (id,kind,state,currency,label,code_hash,balance_cents,reserved_cents,
       policy_json,version,created_at,updated_at)
      VALUES ('account:source','gift_card','active','EUR','Synthetic',?,1000,400,'{}',1,?,?)`)
      .run('f'.repeat(64), CREATED, CAPTURED);
    db.sqlite.prepare(`INSERT INTO stored_value_ledger_entries
      (id,account_id,type,balance_delta_cents,reserved_delta_cents,balance_after_cents,
       reserved_after_cents,version_after,order_id,refund_id,idempotency_key,metadata_json,occurred_at)
      VALUES ('ledger:capture','account:source','capture',-400,-400,600,0,2,?,NULL,'source:sv-capture','{}',?)`)
      .run(orderId, CAPTURED);
    db.sqlite.exec(`UPDATE stored_value_accounts SET balance_cents=600,reserved_cents=0,version=2
      WHERE id='account:source'`);
    db.sqlite.prepare(`INSERT INTO stored_value_ledger_entries
      (id,account_id,type,balance_delta_cents,reserved_delta_cents,balance_after_cents,
       reserved_after_cents,version_after,order_id,refund_id,idempotency_key,metadata_json,occurred_at)
      VALUES ('ledger:refund','account:source','refund',100,0,700,0,3,?,?,'source:sv-refund','{}',?)`)
      .run(orderId, refundId, CAPTURED);
    db.sqlite.exec(`UPDATE stored_value_accounts SET balance_cents=700,version=3 WHERE id='account:source'`);
    const included = await source(db).capture();
    const excluded = await source(db, { ...policy, storedValue: 'exclude' }).capture();
    expect(included.candidates[0]!.facts['orders.total_spent_cents']).toBe(700);
    expect(excluded.candidates[0]!.facts['orders.total_spent_cents']).toBe(400);
    expect(included.candidates[0]!.facts['orders.count']).toBe(1);
  });

  it('no suma pedidos de otra moneda y rechaza la moneda legacy ausente', async () => {
    const { db, profileId } = fixture();
    addOrder(db, profileId, 2, { currency: 'USD', amount: 500 });
    const excluded = await source(db).capture();
    expect(excluded.candidates[0]!.facts['orders.count']).toBe(1);
    expect(excluded.candidates[0]!.facts['orders.total_spent_cents']).toBe(1000);
    await expect(source(db, { ...policy, foreignCurrency: 'reject' }).capture())
      .rejects.toBeInstanceOf(CustomerSegmentationContractError);
    db.sqlite.exec(`UPDATE orders SET currency='' WHERE id=2`);
    await expect(source(db).capture()).rejects.toBeInstanceOf(CustomerSegmentationContractError);
  });

  it('distingue total original y vigente sin añadir otra vez el delta ya cobrado de una modificación', async () => {
    const db = new SqliteD1();
    const orderId = addOrder(db, addProfile(db), 1, { amount: 1500 });
    addPayment(db, orderId, 1500);
    db.sqlite.prepare(`INSERT INTO order_amendments
      (id,order_id,status,expected_order_version,reason,currency,address_before_json,address_after_json,
       subtotal_before_cents,shipping_before_cents,total_before_cents,
       subtotal_after_cents,shipping_after_cents,total_after_cents,delta_cents,
       created_at,updated_at,applied_at)
      VALUES ('amendment:source',?,'applied',1,'Synthetic amendment','EUR','{}','{}',
        1000,0,1000,1500,0,1500,500,?,?,?)`)
      .run(orderId, CAPTURED, CAPTURED, CAPTURED);
    db.sqlite.prepare('UPDATE orders SET edit_version=2 WHERE id=?').run(orderId);
    const captured = await source(db).capture();
    const original = await source(db, { ...policy, refunds: 'ignore', amountBasis: 'original_order_total',
      storedValue: 'included_in_order_total' }).capture();
    const current = await source(db, { ...policy, refunds: 'ignore', amountBasis: 'current_order_total',
      storedValue: 'included_in_order_total' }).capture();
    expect(captured.candidates[0]!.facts['orders.total_spent_cents']).toBe(1500);
    expect(original.candidates[0]!.facts['orders.total_spent_cents']).toBe(1000);
    expect(current.candidates[0]!.facts['orders.total_spent_cents']).toBe(1500);
  });

  it('rechaza historia ausente de modificaciones sin usar el total vigente como original', async () => {
    const { db, orderId } = fixture();
    db.sqlite.prepare('UPDATE orders SET edit_version=2 WHERE id=?').run(orderId);
    await expect(source(db).capture()).rejects.toBeInstanceOf(CustomerSegmentationContractError);
  });

  it('conserva un cobro acreditado de cero como pedido y un cero distinto de ausencia', async () => {
    const db = new SqliteD1();
    addPayment(db, addOrder(db, addProfile(db), 1, { amount: 0 }), 0);
    const snapshot = await source(db).capture();
    expect(snapshot.candidates[0]!.facts).toMatchObject({
      'orders.count': 1, 'orders.total_spent_cents': 0,
    });
    expect(snapshot.candidates[0]!.facts['orders.days_since_last']).not.toBeNull();
  });

  it('normaliza fechas legacy como UTC y rechaza fechas futuras de la evidencia', async () => {
    const { db, profileId } = fixture();
    db.sqlite.prepare('UPDATE customer_profiles SET created_at=? WHERE id=?')
      .run('2026-09-01 10:00:00', profileId);
    const snapshot = await source(db).capture();
    expect(snapshot.candidates[0]!.facts['customer.age_days']).toBe(
      Math.floor((Date.parse(snapshot.capturedAt) - Date.parse(CREATED)) / 86_400_000),
    );
    db.sqlite.exec(`UPDATE payment_transactions SET occurred_at='2098-01-01T00:00:00.000Z'`);
    await expect(source(db).capture()).rejects.toBeInstanceOf(CustomerSegmentationContractError);
  });

  it('copia la política antes de cualquier I/O y no depende de mutaciones del llamador', async () => {
    const { db, paymentId } = fixture();
    addTransaction(db, paymentId, 'refund', 200);
    const mutablePolicy = { ...policy, orderStatuses: ['paid'] };
    const frozenSource = createD1CustomerSegmentFactsSource(db.asD1(), mutablePolicy, { now });
    mutablePolicy.orderStatuses[0] = 'cancelled';
    mutablePolicy.refunds = 'ignore';
    const snapshot = await frozenSource.capture();
    expect(snapshot.candidates[0]!.facts).toMatchObject({ 'orders.count': 1, 'orders.total_spent_cents': 800 });
  });

  it('obtiene toda la evidencia mediante un batch lector y sin seleccionar PII', async () => {
    const { db } = fixture();
    const before = db.value('SELECT total_changes() AS value');
    let batching = false;
    let batches = 0;
    const statements: string[] = [];
    const wrap = (statement: D1PreparedStatement): D1PreparedStatement => new Proxy(statement, {
      get(target, property) {
        if (property === 'bind') return (...values: unknown[]) => wrap(target.bind(...values));
        if (['run', 'all', 'first', 'raw'].includes(String(property))) return (...args: unknown[]) => {
          if (!batching) throw new Error('Lectura fuera del corte transaccional');
          const method = Reflect.get(target, property) as (...params: unknown[]) => unknown;
          return method.apply(target, args);
        };
        return Reflect.get(target, property);
      },
    });
    const observed = {
      prepare(sql: string) {
        statements.push(sql);
        expect(sql).toMatch(/^\s*(SELECT|WITH)\b/i);
        expect(sql).not.toMatch(/\b(primary_email|email_identity_hash|customer_name|address_json|phone|provider_reference)\b/i);
        return wrap(db.prepare(sql));
      },
      async batch<T>(prepared: D1PreparedStatement[]): Promise<D1Result<T>[]> {
        batches++;
        batching = true;
        try { return await db.batch<T>(prepared); } finally { batching = false; }
      },
    } as unknown as D1Database;
    const snapshot = await createD1CustomerSegmentFactsSource(observed, policy, { now }).capture();
    expect(snapshot.candidates).toHaveLength(1);
    expect(batches).toBe(1);
    expect(statements.length).toBeGreaterThan(1);
    expect(db.value('SELECT total_changes() AS value')).toBe(before);
  });

  it('propaga fallos de infraestructura y respuestas incompletas sin fabricar población vacía', async () => {
    const { db } = fixture();
    const failure = new Error('D1 unavailable');
    const rejected = {
      prepare: (sql: string) => db.prepare(sql),
      batch: async () => { throw failure; },
    } as unknown as D1Database;
    await expect(createD1CustomerSegmentFactsSource(rejected, policy, { now }).capture()).rejects.toBe(failure);
    const incomplete = {
      prepare: (sql: string) => db.prepare(sql),
      batch: async () => [],
    } as unknown as D1Database;
    await expect(createD1CustomerSegmentFactsSource(incomplete, policy, { now }).capture()).rejects.toThrow();
    const unsuccessful = {
      prepare: (sql: string) => db.prepare(sql),
      batch: async (prepared: D1PreparedStatement[]) => prepared.map(() => ({ success: false, results: [] })),
    } as unknown as D1Database;
    await expect(createD1CustomerSegmentFactsSource(unsuccessful, policy, { now }).capture()).rejects.toThrow();
  });
});
