import { describe, expect, it } from 'vitest';
import migration46 from '../migrations/0046_customer_segment_execution.sql?raw';
import { canonicalSegmentJson } from '../src/modules/customers/application/customer-segmentation-contract';
import { defineCustomerSegmentFactsPolicy } from '../src/modules/customers/application/customer-segmentation-facts';
import { SqliteD1 } from './sqlite-d1';

type Row = Record<string, string | number | null>;
const HASH = 'a'.repeat(64);
const CONTENT_HASH = 'b'.repeat(64);
const at = (second = 0) => `2026-10-03T12:00:${String(second).padStart(2, '0')}.000Z`;
const policy = defineCustomerSegmentFactsPolicy({
  schemaVersion: 1, id: 'synthetic.policy', version: 1, population: 'active_profiles',
  orderStatuses: ['paid', 'shipped', 'delivered'], orderEligibility: 'successful_capture',
  activityBasis: 'last_successful_capture', amountBasis: 'captured_payments',
  refunds: 'subtract', storedValue: 'include', paymentAdjustments: 'reject', unsettledPayments: 'reject',
  missingPaymentEvidence: 'null', currency: 'EUR', foreignCurrency: 'exclude_orders', dayBoundary: 'elapsed_24h_floor',
});

function insert(db: SqliteD1, table: string, row: Row): void {
  const columns = Object.keys(row);
  db.sqlite.prepare(`INSERT INTO ${table} (${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')})`)
    .run(...Object.values(row));
}
function statement(db: SqliteD1, table: string, row: Row): D1PreparedStatement {
  const columns = Object.keys(row);
  return db.prepare(`INSERT INTO ${table} (${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')})`)
    .bind(...Object.values(row));
}
function policyRow(overrides: Row = {}): Row {
  return { policy_id: policy.id, policy_version: policy.version, policy_json: canonicalSegmentJson(policy),
    policy_fingerprint: HASH, created_at: at(), created_by: 'system:synthetic',
    idempotency_key: 'policy:synthetic', command_fingerprint: HASH, ...overrides };
}
function plan(overrides: Row = {}): Row {
  return { run_id: 'segment-run:one', policy_id: policy.id, policy_version: policy.version, batch_size: 25,
    created_at: at(1), created_by: 'system:synthetic', idempotency_key: 'plan:synthetic', command_fingerprint: HASH, ...overrides };
}
function intent(overrides: Row = {}): Row {
  return { job_run_id: 'segment-job:one', run_id: 'segment-run:one', expected_revision: 1,
    scheduled_for: at(10), created_at: at(1), created_by: 'system:synthetic',
    idempotency_key: 'intent:synthetic', command_fingerprint: HASH, ...overrides };
}
function queue(overrides: Row = {}): Row {
  return { run_id: 'segment-job:one', job_id: 'customers.advance-segment', trigger_kind: 'one-off',
    scheduled_for: at(10), idempotency_key: 'intent:synthetic', status: 'pending', attempt_count: 0, replay_count: 0,
    available_at: at(10), locked_at: null, lock_expires_at: null, locked_by: null, completed_at: null,
    dead_at: null, last_error_code: null, last_error_message: null, created_at: at(1), updated_at: at(1), ...overrides };
}
function snapshot(overrides: Row = {}): Row {
  return { run_id: 'segment-run:one', revision: 1, state: 'requested', started_at: null, finished_at: null,
    cursor: null, total_candidates: 0, processed_candidates: 0, matched_customers: 0, error_code: null,
    source_snapshot_ref: null, source_snapshot_fingerprint: null, facts_policy_id: null, facts_policy_version: null,
    facts_captured_at: null, currency: null, last_position: 0, recorded_at: at(), actor_id: 'system:synthetic',
    idempotency_key: 'snapshot:requested', command_fingerprint: HASH, ...overrides };
}
function started(overrides: Row = {}): Row {
  return snapshot({ revision: 2, state: 'running', started_at: at(2),
    source_snapshot_ref: `source:${HASH}:${CONTENT_HASH}`, source_snapshot_fingerprint: CONTENT_HASH,
    facts_policy_id: policy.id, facts_policy_version: policy.version, facts_captured_at: at(1), currency: 'EUR',
    recorded_at: at(2), idempotency_key: 'snapshot:started', ...overrides });
}
function completed(overrides: Row = {}): Row {
  return started({ revision: 3, state: 'completed', finished_at: at(3), recorded_at: at(3), idempotency_key: 'snapshot:completed', ...overrides });
}
function request(db: SqliteD1, runId = 'segment-run:one', generation = 1): void {
  insert(db, 'customer_segment_runs', { run_id: runId, segment_id: 'synthetic-segment', definition_version: 1,
    generation, requested_at: at(), requested_by: 'system:synthetic', idempotency_key: `${runId}:request`, command_fingerprint: HASH });
  insert(db, 'customer_segment_run_snapshots', snapshot({ run_id: runId, idempotency_key: `${runId}:snapshot` }));
}
function definition(db: SqliteD1): void {
  const template = { id: 'synthetic-template', version: 1,
    parameters: [{ name: 'minimum', min: 0, max: 10 }],
    conditions: [{ fact: 'orders.count', operator: 'gte', parameter: 'minimum' }] };
  insert(db, 'customer_segment_definitions', { segment_id: 'synthetic-segment', definition_version: 1,
    template_id: template.id, template_version: 1, template_json: canonicalSegmentJson(template), parameters_json: '{"minimum":0}',
    definition_fingerprint: HASH, created_at: at(), created_by: 'system:synthetic', idempotency_key: 'definition:synthetic', command_fingerprint: HASH });
}
function fixture(withPlan = true): SqliteD1 {
  const db = new SqliteD1();
  definition(db); request(db);
  insert(db, 'customer_segment_facts_policies', policyRow());
  if (withPlan) insert(db, 'customer_segment_execution_plans', plan());
  return db;
}
function legacyDatabase(): SqliteD1 {
  return new SqliteD1(true, true, true, true, true, true, true, true, true, true, true,
    true, true, true, true, true, true, true, true, true, true, true, false);
}

describe('migration 0046 additive durable segment execution', () => {
  it('adds exactly three empty tables and leaves every legacy table byte-for-byte identical', async () => {
    const db = legacyDatabase();
    definition(db); request(db);
    insert(db, 'customer_segment_run_snapshots', started({ source_snapshot_ref: 'snapshot:legacy' }));
    db.sqlite.exec(`INSERT INTO products (slug,name,description,price_cents,stock,image,category)
      VALUES ('execution-legacy','Synthetic','Synthetic',500,3,'/synthetic.webp','synthetic')`);
    insert(db, 'platform_job_runs', queue({ job_id: 'other.synthetic-job', run_id: 'unrelated:job', idempotency_key: 'unrelated:key' }));
    const previousTables = db.query<{ name: string }>("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
    const dump = () => JSON.stringify(previousTables.map(({ name }) => [name, db.query(`SELECT * FROM ${name}`)]));
    const before = dump();
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(before));
    db.sqlite.exec(migration46);
    expect(dump()).toBe(before);
    expect(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(dump()))).toEqual(hash);
    const added = db.query<{ name: string }>("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .filter(({ name }) => !previousTables.some((table) => table.name === name));
    expect(added.map(({ name }) => name)).toEqual([
      'customer_segment_execution_plans', 'customer_segment_facts_policies', 'customer_segment_job_intents',
    ]);
    expect(added.map(({ name }) => db.value(`SELECT count(*) AS value FROM ${name}`))).toEqual([0, 0, 0]);
    expect(db.query('PRAGMA foreign_key_check')).toEqual([]);
    insert(db, 'customer_segment_run_snapshots', completed({ source_snapshot_ref: 'snapshot:legacy' }));
    expect(db.value("SELECT state AS value FROM customer_segment_run_snapshots WHERE revision=3")).toBe('completed');
  });

  it.each([
    ['schema version', { schemaVersion: 2 }], ['boolean version', { version: true }],
    ['identity mismatch', { id: 'other.policy' }], ['version mismatch', { version: 2 }],
    ['unknown field', { extra: true }], ['missing option', { refunds: undefined }],
    ['null option', { refunds: null }], ['empty statuses', { orderStatuses: [] }],
    ['duplicate statuses', { orderStatuses: ['paid', 'paid'] }],
    ['unsorted statuses', { orderStatuses: ['delivered', 'paid'] }],
    ['null status', { orderStatuses: [null] }], ['unknown status', { orderStatuses: ['refunded'] }],
    ['non-array statuses', { orderStatuses: { 0: 'paid' } }],
    ['population', { population: 'all_profiles' }], ['eligibility', { orderEligibility: 'paid' }],
    ['activity', { activityBasis: 'updated_at' }], ['amount basis', { amountBasis: 'net' }],
    ['refunds', { refunds: 'clamp' }], ['stored value', { storedValue: 'automatic' }],
    ['adjustments', { paymentAdjustments: 'apply' }], ['unsettled', { unsettledPayments: 'include' }],
    ['missing evidence', { missingPaymentEvidence: 'zero' }], ['foreign currency', { foreignCurrency: 'convert' }],
    ['day boundary', { dayBoundary: 'local_calendar' }], ['currency case', { currency: 'eur' }],
    ['currency length', { currency: 'EURO' }], ['currency number', { currency: 978 }],
    ['order total requires stored declaration', { amountBasis: 'original_order_total', refunds: 'ignore' }],
    ['order total cannot subtract refund twice', { amountBasis: 'current_order_total', storedValue: 'included_in_order_total' }],
    ['captures cannot include stored twice', { storedValue: 'included_in_order_total' }],
  ])('rejects policy %s at SQL boundary', (_name, changes) => {
    const db = new SqliteD1();
    const value = { ...policy, ...changes };
    const cleaned = Object.fromEntries(Object.entries(value).filter(([, field]) => field !== undefined));
    expect(() => insert(db, 'customer_segment_facts_policies', policyRow({ policy_json: canonicalSegmentJson(cleaned) })))
      .toThrow();
    expect(db.value('SELECT count(*) AS value FROM customer_segment_facts_policies')).toBe(0);
  });

  it.each([
    ['malformed JSON', { policy_json: '{' }], ['array JSON', { policy_json: '[]' }],
    ['noncanonical JSON order', { policy_json: JSON.stringify(policy) }],
    ['duplicate root JSON key', { policy_json: canonicalSegmentJson(policy).replace('"currency":"EUR"', '"currency":"EUR","currency":"EUR"') }],
    ['fractional schema version', { policy_json: canonicalSegmentJson(policy).replace('"schemaVersion":1', '"schemaVersion":1.0') }],
    ['bad id', { policy_id: 'wrong..id' }], ['zero version', { policy_version: 0 }],
    ['unsafe version', { policy_version: Number.MAX_SAFE_INTEGER + 1 }],
    ['bad policy fingerprint', { policy_fingerprint: 'A'.repeat(64) }], ['bad command fingerprint', { command_fingerprint: 'x' }],
    ['impossible date', { created_at: '2026-02-30T12:00:00.000Z' }],
    ['noncanonical date', { created_at: '2026-10-03T12:00:00Z' }],
    ['actor PII', { created_by: 'email@example.test' }], ['short key', { idempotency_key: 'short' }],
  ] as const)('rejects persisted policy %s', (_name, changes) => {
    const db = new SqliteD1();
    expect(() => insert(db, 'customer_segment_facts_policies', policyRow(changes))).toThrow();
  });

  it('allows explicit nonconsecutive policy versions but prevents identity, idempotency and content replacement', () => {
    const db = new SqliteD1();
    insert(db, 'customer_segment_facts_policies', policyRow());
    const later = { ...policy, version: 8 };
    insert(db, 'customer_segment_facts_policies', policyRow({ policy_version: 8,
      policy_json: canonicalSegmentJson(later), idempotency_key: 'policy:version-eight' }));
    expect(() => insert(db, 'customer_segment_facts_policies', policyRow({ policy_json: canonicalSegmentJson({ ...policy, refunds: 'ignore' }),
      idempotency_key: 'policy:changed' }))).toThrow(/policy_conflict/);
    expect(() => insert(db, 'customer_segment_facts_policies', policyRow({ policy_version: 9,
      policy_json: canonicalSegmentJson({ ...policy, version: 9 }) }))).toThrow(/policy_conflict/);
    expect(() => db.sqlite.exec("UPDATE customer_segment_facts_policies SET created_by='system:other'")).toThrow(/immutable/);
    expect(() => db.sqlite.exec('DELETE FROM customer_segment_facts_policies')).toThrow(/immutable/);
  });

  it.each(['original_order_total', 'current_order_total'] as const)('accepts canonical commercial total policy %s', (amountBasis) => {
    const db = new SqliteD1();
    const commercial = defineCustomerSegmentFactsPolicy({ ...policy, amountBasis,
      refunds: 'ignore', storedValue: 'included_in_order_total' });
    insert(db, 'customer_segment_facts_policies', policyRow({ policy_json: canonicalSegmentJson(commercial) }));
    expect(db.value('SELECT count(*) AS value FROM customer_segment_facts_policies')).toBe(1);
  });

  it.each([
    ['missing run', { run_id: 'run:missing' }], ['missing policy', { policy_id: 'missing.policy' }],
    ['missing policy version', { policy_version: 2 }], ['batch zero', { batch_size: 0 }],
    ['batch over limit', { batch_size: 101 }], ['fractional batch', { batch_size: 1.5 }],
    ['date before request', { created_at: '2026-10-03T11:59:59.000Z' }],
  ] as const)('rejects plan %s', (_name, changes) => {
    const db = fixture(false);
    expect(() => insert(db, 'customer_segment_execution_plans', plan(changes))).toThrow();
  });

  it('rejects duplicate, late and terminal plans and preserves immutable assignments', () => {
    const db = fixture();
    expect(() => insert(db, 'customer_segment_execution_plans', plan({ idempotency_key: 'plan:another' }))).toThrow(/plan_conflict/);
    expect(() => db.sqlite.exec('UPDATE customer_segment_execution_plans SET batch_size=1')).toThrow(/immutable/);
    expect(() => db.sqlite.exec('DELETE FROM customer_segment_execution_plans')).toThrow(/immutable/);
    request(db, 'segment-run:two', 2);
    insert(db, 'customer_segment_run_snapshots', started({ run_id: 'segment-run:two', source_snapshot_ref: 'snapshot:unplanned' }));
    expect(() => insert(db, 'customer_segment_execution_plans', plan({ run_id: 'segment-run:two', idempotency_key: 'plan:late' })))
      .toThrow(/plan_conflict/);
    request(db, 'segment-run:three', 3);
    insert(db, 'customer_segment_run_snapshots', snapshot({ run_id: 'segment-run:three', revision: 2, state: 'failed',
      finished_at: at(1), recorded_at: at(1), error_code: 'facts_capture_invalid', idempotency_key: 'snapshot:failed' }));
    expect(() => insert(db, 'customer_segment_execution_plans', plan({ run_id: 'segment-run:three', idempotency_key: 'plan:failed' })))
      .toThrow(/plan_conflict/);
  });

  it.each([
    ['policy id', { facts_policy_id: 'other.policy' }], ['policy version', { facts_policy_version: 2 }],
    ['currency', { currency: 'USD' }], ['legacy ref', { source_snapshot_ref: 'snapshot:legacy' }],
    ['different policy hash', { source_snapshot_ref: `source:${'c'.repeat(64)}:${CONTENT_HASH}` }],
    ['short content hash', { source_snapshot_ref: `source:${HASH}:abc` }],
    ['invalid content hash', { source_snapshot_ref: `source:${HASH}:${'g'.repeat(64)}` }],
    ['start before plan', { started_at: at(), facts_captured_at: at() }],
  ] as const)('rejects planned capture with incompatible %s', (_name, changes) => {
    const db = fixture();
    expect(() => insert(db, 'customer_segment_run_snapshots', started(changes))).toThrow(/plan_conflict/);
    expect(db.value('SELECT MAX(revision) AS value FROM customer_segment_run_snapshots')).toBe(1);
  });

  it('permits failure before capture with a plan and protects all durable rows from replacement', () => {
    const db = fixture();
    expect(() => insert(db, 'customer_segment_run_snapshots', snapshot({ revision: 2, state: 'failed', finished_at: at(), recorded_at: at(),
      error_code: 'facts_capture_invalid', idempotency_key: 'snapshot:backdated-failure' }))).toThrow(/plan_conflict/);
    insert(db, 'customer_segment_run_snapshots', snapshot({ revision: 2, state: 'failed', finished_at: at(2), recorded_at: at(2),
      error_code: 'facts_capture_invalid', idempotency_key: 'snapshot:failed' }));
    expect(db.value('SELECT count(*) AS value FROM customer_segment_execution_plans')).toBe(1);
    expect(db.query('PRAGMA foreign_key_check')).toEqual([]);
  });
});

describe('durable segment job intentions and ephemeral queue guards', () => {
  it.each([
    ['unknown revision', { expected_revision: 2 }], ['missing plan', { run_id: 'run:missing' }],
    ['zero revision', { expected_revision: 0 }], ['unsafe revision', { expected_revision: Number.MAX_SAFE_INTEGER + 1 }],
    ['before plan', { created_at: at() }], ['bad timestamp', { scheduled_for: '2026-02-30T00:00:00.000Z' }],
    ['long platform identity', { job_run_id: 'j'.repeat(129) }], ['unsafe platform identity', { job_run_id: 'job/unsafe' }],
  ] as const)('rejects intention %s', (_name, changes) => {
    const db = fixture();
    expect(() => insert(db, 'customer_segment_job_intents', intent(changes))).toThrow();
  });

  it('preserves exactly one intention per run/revision and rolls back an incompatible queue insertion atomically', async () => {
    const db = fixture();
    await expect(db.batch([
      statement(db, 'customer_segment_job_intents', intent()),
      statement(db, 'platform_job_runs', queue({ scheduled_for: at(11) })),
    ])).rejects.toThrow(/job_conflict/);
    expect(db.value('SELECT count(*) AS value FROM customer_segment_job_intents')).toBe(0);
    expect(db.value('SELECT count(*) AS value FROM platform_job_runs')).toBe(0);
    const attempts = await Promise.allSettled(['one', 'two'].map((suffix) => db.batch([
      statement(db, 'customer_segment_job_intents', intent({ job_run_id: `segment-job:${suffix}`, idempotency_key: `intent:${suffix}` })),
      statement(db, 'platform_job_runs', queue({ run_id: `segment-job:${suffix}`, idempotency_key: `intent:${suffix}` })),
    ])));
    expect(attempts.filter(({ status }) => status === 'fulfilled')).toHaveLength(1);
    expect(db.value('SELECT count(*) AS value FROM customer_segment_job_intents')).toBe(1);
    expect(db.value('SELECT count(*) AS value FROM platform_job_runs')).toBe(1);
    expect(() => db.sqlite.exec('UPDATE customer_segment_job_intents SET expected_revision=2')).toThrow(/immutable/);
    expect(() => db.sqlite.exec('DELETE FROM customer_segment_job_intents')).toThrow(/immutable/);
  });

  it.each([
    ['wrong job descriptor', { job_id: 'other.synthetic-job' }], ['wrong identity', { run_id: 'segment-job:other' }],
    ['wrong idempotency key', { idempotency_key: 'intent:other' }], ['recurring trigger', { trigger_kind: 'recurring' }],
    ['changed schedule', { scheduled_for: at(11) }], ['changed creation', { created_at: at(2) }],
    ['changed update', { updated_at: at(2) }], ['changed availability', { available_at: at(11) }],
    ['previous attempt', { attempt_count: 1 }], ['previous replay', { replay_count: 1 }],
    ['previous error', { last_error_code: 'provider_error' }], ['private error', { last_error_message: 'private' }],
    ['already succeeded', { status: 'succeeded', completed_at: at(11) }],
  ] as const)('rejects queue %s', (_name, changes) => {
    const db = fixture();
    insert(db, 'customer_segment_job_intents', intent());
    expect(() => insert(db, 'platform_job_runs', queue(changes))).toThrow(/job_conflict/);
    expect(db.value('SELECT count(*) AS value FROM platform_job_runs')).toBe(0);
  });

  it('requires prior intent for the reserved descriptor while leaving unrelated job lifecycle intact', () => {
    const db = fixture();
    expect(() => insert(db, 'platform_job_runs', queue())).toThrow(/job_conflict/);
    insert(db, 'platform_job_runs', queue({ job_id: 'other.synthetic-job', run_id: 'other:job', idempotency_key: 'other:intent' }));
    db.sqlite.exec("UPDATE platform_job_runs SET status='succeeded',completed_at='2026-10-03T12:00:12.000Z' WHERE run_id='other:job'");
    db.sqlite.exec("DELETE FROM platform_job_runs WHERE run_id='other:job'");
    expect(db.value('SELECT count(*) AS value FROM platform_job_runs')).toBe(0);
  });

  it('refuses retroactive appropriation of an unrelated existing queue identity or idempotency key', () => {
    const db = fixture();
    insert(db, 'platform_job_runs', queue({ job_id: 'other.synthetic-job' }));
    expect(() => insert(db, 'customer_segment_job_intents', intent())).toThrow(/intent_conflict/);
    expect(() => insert(db, 'customer_segment_job_intents', intent({ job_run_id: 'segment-job:different' }))).toThrow(/intent_conflict/);
    expect(() => insert(db, 'customer_segment_job_intents', intent({ idempotency_key: 'intent:different' }))).toThrow(/intent_conflict/);
    expect(db.value('SELECT job_id AS value FROM platform_job_runs')).toBe('other.synthetic-job');
  });

  it('allows lifecycle and successful purging while keeping immutable reserved identity and durable intent', () => {
    const db = fixture();
    insert(db, 'customer_segment_job_intents', intent()); insert(db, 'platform_job_runs', queue());
    for (const [column, value] of Object.entries({ run_id: 'job:changed', job_id: 'other.job', trigger_kind: 'recurring',
      scheduled_for: at(12), idempotency_key: 'intent:changed', created_at: at(2) })) {
      expect(() => db.sqlite.prepare(`UPDATE platform_job_runs SET ${column}=?`).run(value)).toThrow(/job_conflict/);
    }
    db.sqlite.exec(`UPDATE platform_job_runs SET status='running',attempt_count=1,
      locked_at='${at(10)}',lock_expires_at='${at(20)}',locked_by='worker:synthetic',updated_at='${at(10)}'`);
    db.sqlite.exec(`UPDATE platform_job_runs SET status='succeeded',locked_at=NULL,lock_expires_at=NULL,locked_by=NULL,
      completed_at='${at(11)}',updated_at='${at(11)}'`);
    db.sqlite.exec('DELETE FROM platform_job_runs');
    expect(db.value('SELECT count(*) AS value FROM customer_segment_job_intents')).toBe(1);
    expect(db.query('PRAGMA foreign_key_check')).toEqual([]);
  });

  it('restores historical intentions with guards active but never requeues obsolete or terminal revisions', () => {
    const db = fixture();
    insert(db, 'customer_segment_run_snapshots', started());
    insert(db, 'customer_segment_run_snapshots', completed());
    insert(db, 'customer_segment_job_intents', intent());
    insert(db, 'customer_segment_job_intents', intent({ job_run_id: 'segment-job:two', expected_revision: 2,
      created_at: at(2), idempotency_key: 'intent:two' }));
    expect(() => insert(db, 'customer_segment_job_intents', intent({ job_run_id: 'segment-job:terminal', expected_revision: 3,
      created_at: at(3), idempotency_key: 'intent:terminal' }))).toThrow(/intent_conflict/);
    expect(() => insert(db, 'platform_job_runs', queue())).toThrow(/job_conflict/);
    expect(() => insert(db, 'platform_job_runs', queue({ run_id: 'segment-job:two', created_at: at(2), updated_at: at(2),
      idempotency_key: 'intent:two' }))).toThrow(/job_conflict/);
    expect(db.value('SELECT count(*) AS value FROM customer_segment_job_intents')).toBe(2);
    expect(db.value('SELECT count(*) AS value FROM platform_job_runs')).toBe(0);
    expect(db.query('PRAGMA foreign_key_check')).toEqual([]);
  });

  it('recovers a still-current intent with its original queue identity and permits overdue schedules', () => {
    const db = fixture();
    insert(db, 'customer_segment_job_intents', intent({ scheduled_for: at() }));
    insert(db, 'platform_job_runs', queue({ scheduled_for: at(), available_at: at() }));
    db.sqlite.exec('DELETE FROM platform_job_runs');
    insert(db, 'platform_job_runs', queue({ scheduled_for: at(), available_at: at() }));
    expect(db.value('SELECT count(*) AS value FROM customer_segment_job_intents')).toBe(1);
    expect(db.value('SELECT count(*) AS value FROM platform_job_runs')).toBe(1);
  });

  it('prevents INSERT OR REPLACE from bypassing append-only history or resetting a reserved job', () => {
    const db = fixture();
    insert(db, 'customer_segment_job_intents', intent()); insert(db, 'platform_job_runs', queue());
    for (const [table, field, value] of [
      ['customer_segment_facts_policies', 'created_by', 'system:replaced'],
      ['customer_segment_execution_plans', 'batch_size', 1],
      ['customer_segment_job_intents', 'created_by', 'system:replaced'],
      ['platform_job_runs', 'updated_at', at(2)],
    ] as const) {
      const original = db.query(table === 'platform_job_runs' ? 'SELECT * FROM platform_job_runs' : `SELECT * FROM ${table}`)[0]!;
      const replacement = { ...original, [field]: value };
      const columns = Object.keys(replacement);
      expect(() => db.sqlite.prepare(`INSERT OR REPLACE INTO ${table} (${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')})`)
        .run(...Object.values(replacement) as (string | number | null)[])).toThrow(/conflict/);
      expect(db.query(`SELECT * FROM ${table}`)).toEqual([original]);
    }
  });
});
