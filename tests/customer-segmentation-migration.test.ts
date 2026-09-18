import { describe, expect, it } from 'vitest';
import migration45 from '../migrations/0045_customer_segmentation.sql?raw';
import { SqliteD1 } from './sqlite-d1';

type Row = Record<string, string | number | null>;
const fingerprint = 'a'.repeat(64);
const at = (second = 0) => `2026-09-18T10:00:${String(second).padStart(2, '0')}.000Z`;
const template = {
  conditions: [
    { fact: 'orders.count', operator: 'gte', parameter: 'minimum_orders' },
    { fact: 'customer.age_days', operator: 'gte', parameter: 'minimum_age' },
  ],
  id: 'synthetic-test',
  parameters: [
    { max: 100, min: 0, name: 'minimum_orders' },
    { max: 100, min: 0, name: 'minimum_age' },
  ],
  version: 1,
};
const facts = { 'customer.age_days': 10, 'orders.count': 3, 'orders.days_since_last': null, 'orders.total_spent_cents': 300 };
const definition = (overrides: Row = {}): Row => ({
  segment_id: 'synthetic-segment', definition_version: 1, template_id: template.id,
  template_version: 1, template_json: JSON.stringify(template),
  parameters_json: '{"minimum_age":2,"minimum_orders":2}', definition_fingerprint: fingerprint,
  created_at: at(), created_by: 'operator:synthetic', idempotency_key: 'definition:one', command_fingerprint: fingerprint,
  ...overrides,
});
function statement(db: SqliteD1, table: string, row: Row): D1PreparedStatement {
  const entries = Object.entries(row);
  return db.prepare(`INSERT INTO ${table} (${entries.map(([key]) => key).join(',')}) VALUES (${entries.map(() => '?').join(',')})`)
    .bind(...entries.map(([, value]) => value));
}
function insert(db: SqliteD1, table: string, row: Row): void {
  const entries = Object.entries(row);
  db.sqlite.prepare(`INSERT INTO ${table} (${entries.map(([key]) => key).join(',')}) VALUES (${entries.map(() => '?').join(',')})`)
    .run(...entries.map(([, value]) => value));
}
function profile(db: SqliteD1, id: string): void {
  insert(db, 'customer_profiles', {
    id, primary_email: `${id.replaceAll(':', '-')}@example.test`,
    email_identity_hash: [...id].map((letter) => letter.charCodeAt(0).toString(16).padStart(2, '0')).join('').padEnd(64, '0'), status: 'active', version: 1,
    created_at: at(), updated_at: at(),
  });
}
function snapshot(runId = 'segment-run:one', overrides: Row = {}): Row {
  return {
    run_id: runId, revision: 1, state: 'requested', started_at: null, finished_at: null, cursor: null,
    total_candidates: 0, processed_candidates: 0, matched_customers: 0, error_code: null,
    source_snapshot_ref: null, source_snapshot_fingerprint: null, facts_policy_id: null,
    facts_policy_version: null, facts_captured_at: null, currency: null, last_position: 0,
    recorded_at: at(), actor_id: 'operator:synthetic', idempotency_key: `${runId}:requested`, command_fingerprint: fingerprint,
    ...overrides,
  };
}
function request(db: SqliteD1, runId = 'segment-run:one', generation = 1, definitionVersion = 1): void {
  insert(db, 'customer_segment_runs', {
    run_id: runId, segment_id: 'synthetic-segment', definition_version: definitionVersion, generation,
    requested_at: at(), requested_by: 'operator:synthetic', idempotency_key: `${runId}:request`, command_fingerprint: fingerprint,
  });
  insert(db, 'customer_segment_run_snapshots', snapshot(runId));
}
function candidate(runId = 'segment-run:one', position = 1, overrides: Row = {}): Row {
  return {
    run_id: runId, customer_profile_id: `customer:${position}`, position, customer_profile_version: 1,
    facts_json: JSON.stringify(facts), facts_fingerprint: fingerprint, matches: null, missing_facts_json: null, evaluated_revision: null,
    ...overrides,
  };
}
function started(runId = 'segment-run:one', total = 1, overrides: Row = {}): Row {
  return snapshot(runId, {
    revision: 2, state: 'running', started_at: at(1), cursor: total === 0 ? null : `${runId}:cursor:two`, total_candidates: total,
    source_snapshot_ref: `${runId}:source`, source_snapshot_fingerprint: fingerprint, facts_policy_id: 'synthetic-facts',
    facts_policy_version: 1, facts_captured_at: at(), currency: 'EUR', recorded_at: at(1), idempotency_key: `${runId}:start`,
    ...overrides,
  });
}
function progressed(runId = 'segment-run:one', total = 1, processed = 1, overrides: Row = {}): Row {
  return started(runId, total, {
    revision: 3, processed_candidates: processed, matched_customers: processed, last_position: processed,
    cursor: processed === total ? null : `${runId}:cursor:three`, recorded_at: at(2), idempotency_key: `${runId}:progress`, ...overrides,
  });
}
function completed(runId = 'segment-run:one', total = 1, overrides: Row = {}): Row {
  return progressed(runId, total, total, {
    revision: 4, state: 'completed', cursor: null, finished_at: at(3), recorded_at: at(3), idempotency_key: `${runId}:complete`, ...overrides,
  });
}
function evaluateStatement(db: SqliteD1, position = 1, revision = 3, runId = 'segment-run:one'): D1PreparedStatement {
  return db.prepare(`UPDATE customer_segment_results SET matches=1, missing_facts_json='[]', evaluated_revision=?
    WHERE run_id=? AND position=? AND evaluated_revision IS NULL`).bind(revision, runId, position);
}
function setup(total = 1): SqliteD1 {
  const db = new SqliteD1();
  insert(db, 'customer_segment_definitions', definition());
  request(db);
  for (let position = 1; position <= total; position++) {
    profile(db, `customer:${position}`);
    insert(db, 'customer_segment_results', candidate('segment-run:one', position));
  }
  insert(db, 'customer_segment_run_snapshots', started('segment-run:one', total));
  return db;
}
function publication(overrides: Row = {}): Row {
  return {
    segment_id: 'synthetic-segment', publication_version: 1, run_id: 'segment-run:one', definition_version: 1,
    generation: 1, published_at: at(4), published_by: 'operator:synthetic', idempotency_key: 'publication:one', command_fingerprint: fingerprint,
    ...overrides,
  };
}

describe('migration 0045 customer segmentation persistence', () => {
  it('rehearses an additive expansion from 0044 with identical legacy hashes and empty new tables', async () => {
    const db = new SqliteD1(
      true, true, true, true, true, true, true, true, true, true, true,
      true, true, true, true, true, true, true, true, true, true, false,
    );
    profile(db, 'customer:legacy');
    db.sqlite.exec(`INSERT INTO products (slug,name,description,price_cents,stock,image,category)
      VALUES ('segmentation-legacy','Synthetic product','Synthetic',1234,7,'/synthetic.webp','synthetic');`);
    const legacyTables = db.query<{ name: string }>("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
    const legacy = () => JSON.stringify(legacyTables.map(({ name }) => [name, db.query(`SELECT * FROM ${name}`).sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)))]));
    const before = legacy();
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(before));
    db.sqlite.exec(migration45);
    expect(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(legacy()))).toEqual(hash);
    expect(legacy()).toBe(before);
    const added = db.query<{ name: string }>("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'customer_segment_%' ORDER BY name");
    expect(added.map(({ name }) => name)).toEqual([
      'customer_segment_definitions', 'customer_segment_publications', 'customer_segment_results', 'customer_segment_run_snapshots', 'customer_segment_runs',
    ]);
    expect(added.map(({ name }) => db.value(`SELECT count(*) AS value FROM ${name}`))).toEqual([0, 0, 0, 0, 0]);
    expect(db.query('PRAGMA foreign_key_check')).toEqual([]);
  });

  it.each([
    ['version gap', { definition_version: 2 }],
    ['invalid segment', { segment_id: 'segment..invalid' }],
    ['unsafe version', { definition_version: Number.MAX_SAFE_INTEGER + 1 }],
    ['invalid hash', { definition_fingerprint: 'g'.repeat(64) }],
    ['invalid command hash', { command_fingerprint: 'A'.repeat(64) }],
    ['invalid timestamp', { created_at: '2026-02-30T10:00:00.000Z' }],
    ['noncanonical timestamp', { created_at: '2026-09-18T10:00:00Z' }],
    ['invalid JSON', { template_json: '{' }],
    ['unknown root field', { template_json: JSON.stringify({ ...template, unknown: true }) }],
    ['mismatched template identity', { template_id: 'different-template' }],
    ['mismatched template version', { template_version: 2 }],
    ['unknown operator', { template_json: JSON.stringify({ ...template, conditions: [{ ...template.conditions[0], operator: 'gt' }, template.conditions[1]] }) }],
    ['unknown fact', { template_json: JSON.stringify({ ...template, conditions: [{ ...template.conditions[0], fact: 'orders.unknown' }, template.conditions[1]] }) }],
    ['null nested parameter', { template_json: JSON.stringify({ ...template, parameters: [null, template.parameters[1]] }) }],
    ['duplicate parameter name', { template_json: JSON.stringify({ ...template, parameters: [template.parameters[0], template.parameters[0]] }) }],
    ['unreferenced parameter', { template_json: JSON.stringify({ ...template, conditions: [template.conditions[0], template.conditions[0]] }) }],
    ['null parameter value', { parameters_json: '{"minimum_age":null,"minimum_orders":2}' }],
    ['boolean parameter value', { parameters_json: '{"minimum_age":true,"minimum_orders":2}' }],
    ['fractional parameter value', { parameters_json: '{"minimum_age":2.5,"minimum_orders":2}' }],
    ['out-of-bounds parameter value', { parameters_json: '{"minimum_age":101,"minimum_orders":2}' }],
    ['duplicate JSON keys', { parameters_json: '{"minimum_age":2,"minimum_age":2}' }],
    ['unknown parameter value', { parameters_json: '{"unknown":2,"minimum_orders":2}' }],
    ['contradictory conditions', { template_json: JSON.stringify({ ...template, conditions: [template.conditions[0], { fact: 'orders.count', operator: 'lte', parameter: 'minimum_age' }] }), parameters_json: '{"minimum_age":1,"minimum_orders":2}' }],
  ] as const)('rejects %s', (_label, overrides) => {
    const db = new SqliteD1();
    expect(() => insert(db, 'customer_segment_definitions', definition(overrides))).toThrow();
    expect(db.value('SELECT count(*) AS value FROM customer_segment_definitions')).toBe(0);
  });

  it('permits exactly one concurrent next definition and rejects template identity reuse with changed JSON', async () => {
    const db = new SqliteD1();
    insert(db, 'customer_segment_definitions', definition());
    const attempts = await Promise.allSettled(['writer:one', 'writer:two'].map((key) => db.batch([
      statement(db, 'customer_segment_definitions', definition({ definition_version: 2, idempotency_key: key })),
    ])));
    expect(attempts.filter(({ status }) => status === 'fulfilled')).toHaveLength(1);
    expect(db.value('SELECT count(*) AS value FROM customer_segment_definitions')).toBe(2);
    expect(() => insert(db, 'customer_segment_definitions', definition({
      segment_id: 'another-segment', template_json: JSON.stringify({ ...template, parameters: [{ ...template.parameters[0], max: 200 }, template.parameters[1]] }),
    }))).toThrow(/customer_segment_template_conflict/u);
    expect(() => db.sqlite.exec("UPDATE customer_segment_definitions SET created_by='other'" )).toThrow(/immutable/u);
    expect(() => db.sqlite.exec('DELETE FROM customer_segment_definitions')).toThrow(/immutable/u);
  });

  it('requires current definitions, consecutive generations and immutable requests', () => {
    const db = new SqliteD1();
    insert(db, 'customer_segment_definitions', definition());
    request(db);
    expect(() => request(db, 'segment-run:gap', 3)).toThrow(/run_conflict/u);
    insert(db, 'customer_segment_definitions', definition({ definition_version: 2, idempotency_key: 'definition:two' }));
    expect(() => request(db, 'segment-run:stale', 2)).toThrow(/run_conflict/u);
    request(db, 'segment-run:current', 2, 2);
    expect(() => db.sqlite.exec("UPDATE customer_segment_runs SET requested_by='other'" )).toThrow(/immutable/u);
    expect(() => db.sqlite.exec('DELETE FROM customer_segment_runs')).toThrow(/immutable/u);
  });

  it('rolls back the whole candidate capture when a duplicate or injected pre-start failure occurs', async () => {
    const db = new SqliteD1();
    insert(db, 'customer_segment_definitions', definition());
    request(db);
    profile(db, 'customer:1');
    for (const extra of [statement(db, 'customer_segment_results', candidate('segment-run:one', 2, { customer_profile_id: 'customer:1' })),
      db.prepare('INSERT INTO nonexistent_segmentation_table VALUES (1)')]) {
      await expect(db.batch([
        statement(db, 'customer_segment_results', candidate()), extra,
        statement(db, 'customer_segment_run_snapshots', started()),
      ])).rejects.toThrow();
      expect(db.value('SELECT count(*) AS value FROM customer_segment_results')).toBe(0);
      expect(db.value('SELECT MAX(revision) AS value FROM customer_segment_run_snapshots')).toBe(1);
    }
  });

  it.each([
    ['missing fact', JSON.stringify({ 'orders.count': 3 })],
    ['unknown fact', JSON.stringify({ ...facts, unknown: 1 })],
    ['boolean fact', JSON.stringify({ ...facts, 'orders.count': true })],
    ['string fact', JSON.stringify({ ...facts, 'orders.count': '3' })],
    ['negative fact', JSON.stringify({ ...facts, 'orders.count': -1 })],
    ['unsafe fact', JSON.stringify({ ...facts, 'orders.count': Number.MAX_SAFE_INTEGER + 1 })],
    ['duplicate fact', '{"customer.age_days":10,"orders.count":3,"orders.count":3,"orders.total_spent_cents":300}'],
  ])('rejects %s', (_label, factsJson) => {
    const db = new SqliteD1();
    insert(db, 'customer_segment_definitions', definition());
    request(db);
    profile(db, 'customer:1');
    expect(() => insert(db, 'customer_segment_results', candidate('segment-run:one', 1, { facts_json: factsJson }))).toThrow(/facts_invalid/u);
  });

  it('freezes facts, population and source metadata once started', () => {
    const db = setup();
    expect(() => db.sqlite.exec("UPDATE customer_segment_results SET facts_json='{}'" )).toThrow(/immutable/u);
    profile(db, 'customer:2');
    expect(() => insert(db, 'customer_segment_results', candidate('segment-run:one', 2))).toThrow(/results_conflict/u);
    expect(() => insert(db, 'customer_segment_run_snapshots', progressed('segment-run:one', 1, 0, { currency: 'USD' }))).toThrow(/snapshot_invalid/u);
    expect(() => db.sqlite.exec('DELETE FROM customer_segment_results')).toThrow(/immutable/u);
  });

  it('rolls back a start whose source reference was already captured with a different fingerprint', async () => {
    const db = setup();
    request(db, 'segment-run:two', 2);
    await expect(db.batch([
      statement(db, 'customer_segment_results', candidate('segment-run:two')),
      statement(db, 'customer_segment_run_snapshots', started('segment-run:two', 1, {
        source_snapshot_ref: 'segment-run:one:source', source_snapshot_fingerprint: 'b'.repeat(64),
      })),
    ])).rejects.toThrow(/source_conflict/u);
    expect(db.value("SELECT count(*) AS value FROM customer_segment_results WHERE run_id='segment-run:two'" )).toBe(0);
  });

  it.each([
    ['currency', { currency: 'eur' }], ['missing currency', { currency: null }],
    ['source fingerprint', { source_snapshot_fingerprint: 'invalid' }],
    ['policy version', { facts_policy_version: 1.5 }], ['future capture', { facts_captured_at: at(2) }],
    ['null cursor', { cursor: null }], ['candidate count', { total_candidates: 2 }],
    ['negative count', { total_candidates: -1 }],
  ] as const)('rejects invalid start %s', (_label, overrides) => {
    const db = new SqliteD1();
    insert(db, 'customer_segment_definitions', definition()); request(db); profile(db, 'customer:1');
    insert(db, 'customer_segment_results', candidate());
    expect(() => insert(db, 'customer_segment_run_snapshots', started('segment-run:one', 1, overrides))).toThrow();
  });

  it('commits exactly one same-revision writer and refuses replayed or out-of-order evaluation', async () => {
    const db = setup(2);
    await expect(evaluateStatement(db, 2).run()).rejects.toThrow(/results_conflict/u);
    const attempts = await Promise.allSettled(['writer:one', 'writer:two'].map((key) => db.batch([
      evaluateStatement(db), statement(db, 'customer_segment_run_snapshots', progressed('segment-run:one', 2, 1, { idempotency_key: key })),
    ])));
    expect(attempts.filter(({ status }) => status === 'fulfilled')).toHaveLength(1);
    expect(db.value('SELECT count(*) AS value FROM customer_segment_results WHERE evaluated_revision=3')).toBe(1);
    expect(() => db.sqlite.exec("UPDATE customer_segment_results SET evaluated_revision=4 WHERE position=1" )).toThrow(/immutable/u);
    expect(() => db.sqlite.exec('UPDATE customer_segment_run_snapshots SET processed_candidates=2')).toThrow(/immutable/u);
    expect(() => db.sqlite.exec('DELETE FROM customer_segment_run_snapshots')).toThrow(/immutable/u);
  });

  it('rejects fabricated counters, cross-run cursors and snapshots after a failed intermediate command atomically', async () => {
    const db = setup(2);
    await expect(db.batch([
      evaluateStatement(db), db.prepare('INSERT INTO nonexistent_segmentation_table VALUES (1)'),
      statement(db, 'customer_segment_run_snapshots', progressed('segment-run:one', 2, 1)),
    ])).rejects.toThrow();
    expect(db.value('SELECT count(*) AS value FROM customer_segment_results WHERE evaluated_revision IS NOT NULL')).toBe(0);
    await expect(db.batch([
      evaluateStatement(db), statement(db, 'customer_segment_run_snapshots', progressed('segment-run:one', 2, 2)),
    ])).rejects.toThrow(/results_conflict/u);
    expect(db.value('SELECT count(*) AS value FROM customer_segment_results WHERE evaluated_revision IS NOT NULL')).toBe(0);
    request(db, 'segment-run:two', 2);
    insert(db, 'customer_segment_results', candidate('segment-run:two'));
    expect(() => insert(db, 'customer_segment_run_snapshots', started('segment-run:two', 1, { cursor: 'segment-run:one:cursor:two' }))).toThrow(/UNIQUE/u);
  });

  it('requires a truthful deterministic result and missing facts in condition order', async () => {
    const db = new SqliteD1();
    insert(db, 'customer_segment_definitions', definition()); request(db); profile(db, 'customer:1');
    insert(db, 'customer_segment_results', candidate('segment-run:one', 1, {
      facts_json: JSON.stringify({ ...facts, 'orders.count': null, 'customer.age_days': null }),
    }));
    insert(db, 'customer_segment_run_snapshots', started());
    await expect(evaluateStatement(db).run()).rejects.toThrow(/evaluation_invalid/u);
    expect(() => db.sqlite.exec(`UPDATE customer_segment_results SET matches=0,
      missing_facts_json='["customer.age_days","orders.count"]', evaluated_revision=3`)).toThrow(/evaluation_invalid/u);
    await db.batch([
      db.prepare(`UPDATE customer_segment_results SET matches=0, missing_facts_json='["orders.count","customer.age_days"]', evaluated_revision=3`),
      statement(db, 'customer_segment_run_snapshots', progressed('segment-run:one', 1, 1, { matched_customers: 0 })),
    ]);
    expect(db.value('SELECT matches AS value FROM customer_segment_results')).toBe(0);
  });

  it('rejects incomplete completion, keeps failure counters and treats terminal states as immutable', async () => {
    const db = setup(2);
    expect(() => insert(db, 'customer_segment_run_snapshots', completed('segment-run:one', 2, { revision: 3 }))).toThrow();
    await db.batch([evaluateStatement(db), statement(db, 'customer_segment_run_snapshots', progressed('segment-run:one', 2, 1))]);
    const failure = completed('segment-run:one', 2, {
      state: 'failed', processed_candidates: 1, matched_customers: 1, last_position: 1,
      error_code: 'source.unavailable', idempotency_key: 'segment-run:one:failed',
    });
    expect(() => insert(db, 'customer_segment_run_snapshots', { ...failure, processed_candidates: 0, matched_customers: 0, last_position: 0 })).toThrow(/snapshot_invalid/u);
    insert(db, 'customer_segment_run_snapshots', failure);
    expect(() => insert(db, 'customer_segment_run_snapshots', { ...failure, revision: 5, idempotency_key: 'terminal:retry' })).toThrow(/revision_conflict/u);
    await expect(evaluateStatement(db, 2, 5).run()).rejects.toThrow(/results_conflict/u);
    expect(() => insert(db, 'customer_segment_publications', publication())).toThrow(/publication_conflict/u);
  });

  it('permits failure before capture and completion of an empty snapshot', () => {
    const db = new SqliteD1();
    insert(db, 'customer_segment_definitions', definition()); request(db);
    insert(db, 'customer_segment_run_snapshots', snapshot('segment-run:one', {
      revision: 2, state: 'failed', finished_at: at(1), recorded_at: at(1), error_code: 'source.unavailable', idempotency_key: 'request:failed',
    }));
    request(db, 'segment-run:two', 2);
    insert(db, 'customer_segment_run_snapshots', started('segment-run:two', 0));
    insert(db, 'customer_segment_run_snapshots', completed('segment-run:two', 0, { revision: 3 }));
    insert(db, 'customer_segment_publications', publication({ run_id: 'segment-run:two', generation: 2 }));
    expect(db.query('PRAGMA foreign_key_check')).toEqual([]);
  });

  it('publishes completed current definitions in ascending generations without requiring the newest requested run', async () => {
    const db = setup();
    request(db, 'segment-run:two', 2);
    await db.batch([evaluateStatement(db), statement(db, 'customer_segment_run_snapshots', progressed())]);
    insert(db, 'customer_segment_run_snapshots', completed());
    insert(db, 'customer_segment_publications', publication());
    expect(() => insert(db, 'customer_segment_publications', publication({ publication_version: 2, idempotency_key: 'publication:reused-run' }))).toThrow(/publication_conflict/u);
    insert(db, 'customer_segment_definitions', definition({ definition_version: 2, idempotency_key: 'definition:two' }));
    insert(db, 'customer_segment_run_snapshots', started('segment-run:two', 0));
    insert(db, 'customer_segment_run_snapshots', completed('segment-run:two', 0, { revision: 3 }));
    expect(() => insert(db, 'customer_segment_publications', publication({ publication_version: 2, run_id: 'segment-run:two', generation: 2, idempotency_key: 'publication:old-definition' }))).toThrow(/publication_conflict/u);
    request(db, 'segment-run:three', 3, 2);
    insert(db, 'customer_segment_run_snapshots', started('segment-run:three', 0));
    insert(db, 'customer_segment_run_snapshots', completed('segment-run:three', 0, { revision: 3 }));
    insert(db, 'customer_segment_publications', publication({ publication_version: 2, run_id: 'segment-run:three', generation: 3, definition_version: 2, idempotency_key: 'publication:two' }));
    expect(db.query('SELECT publication_version, generation FROM customer_segment_publications ORDER BY publication_version')).toEqual([
      { publication_version: 1, generation: 1 }, { publication_version: 2, generation: 3 },
    ]);
    expect(() => db.sqlite.exec('UPDATE customer_segment_publications SET generation=1')).toThrow(/immutable/u);
    expect(() => db.sqlite.exec('DELETE FROM customer_segment_publications')).toThrow(/immutable/u);
  });
});
