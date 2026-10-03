#!/usr/bin/env node

/** Fuente de hechos R5.6c: D1/workerd aislado, política sintética y cero bindings remotos. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arguments_ = process.argv.slice(2).filter((argument) => argument !== '--');
if (arguments_.length > 2 || (arguments_.length && (arguments_[0] !== '--output-dir' || !arguments_[1]))) {
  throw new Error('Uso: node scripts/rehearse-r5-customer-segmentation-facts-d1.mjs [--output-dir <directorio>]');
}
const outputRoot = resolve(arguments_[1] ?? join(root, 'tmp/segmentation-facts-d1'));
await mkdir(outputRoot, { recursive: true });
const output = await mkdtemp(join(outputRoot, 'rehearsal-'));
// Evita telemetría y escrituras del CLI fuera del directorio aislado.
process.env.WRANGLER_SEND_METRICS = 'false';
process.env.WRANGLER_LOG_PATH = join(output, 'wrangler.log');
process.env.CLOUDFLARE_CF_FETCH_ENABLED = 'false';
const { getPlatformProxy, unstable_splitSqlQuery: splitSql } = await import('wrangler');
const configPath = join(output, 'wrangler.json');
await writeFile(configPath, JSON.stringify({
  name: 'segmentation-facts-rehearsal-local', compatibility_date: '2026-07-01',
  d1_databases: [
    { binding: 'SOURCE', database_name: 'segmentation-facts-source-local', database_id: '00000000-0000-0000-0000-000000000001', remote: false },
    { binding: 'RESTORE', database_name: 'segmentation-facts-restore-local', database_id: '00000000-0000-0000-0000-000000000002', remote: false },
  ],
}, null, 2));

// Compilador transitivo ya instalado por Wrangler; sin instalar dependencias.
const wranglerRequire = createRequire(import.meta.resolve('wrangler'));
const { build } = wranglerRequire('esbuild');
const bundlePath = join(output, 'harness.mjs');
await build({
  stdin: { contents: [
    "export { createD1CustomerSegmentFactsSource, CUSTOMER_SEGMENT_SOURCE_LIMITS } from './src/composition/customer-segmentation-facts';",
    "export { defineCustomerSegmentFactsPolicy } from './src/modules/customers/application/customer-segmentation-facts';",
    "export { createCustomerSegmentExecution } from './src/modules/customers/application/customer-segmentation-execution';",
    "export { segmentFingerprint } from './src/modules/customers/application/customer-segmentation-contract';",
    "export { createD1CustomerSegmentationRepository } from './src/modules/customers/infrastructure/d1-customer-segmentation-repository';",
    "export { createD1CustomerSegmentExecutionStore } from './src/modules/customers/infrastructure/d1-customer-segment-execution-store';",
    "export { createD1JobRunRepository } from './src/platform/jobs/d1-job-run-repository';",
    "export { defineCustomerSegmentTemplate } from './src/modules/customers/domain/customer-segmentation';",
    "export { exportD1Backup } from './src/composition/backup';",
    "export { BACKUP_TABLES, BACKUP_SCHEMA_VERSION } from './src/lib/backup';",
  ].join('\n'), resolveDir: root, loader: 'ts' },
  bundle: true, platform: 'node', target: 'node22', format: 'esm', outfile: bundlePath,
});
const {
  createD1CustomerSegmentFactsSource, CUSTOMER_SEGMENT_SOURCE_LIMITS,
  defineCustomerSegmentFactsPolicy, createCustomerSegmentExecution, segmentFingerprint,
  createD1CustomerSegmentationRepository, defineCustomerSegmentTemplate,
  createD1CustomerSegmentExecutionStore, createD1JobRunRepository,
  exportD1Backup, BACKUP_TABLES, BACKUP_SCHEMA_VERSION,
} = await import(pathToFileURL(bundlePath).href);
const hash = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const ordered = (rows) => [...rows].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
async function query(db, sql, ...bindings) {
  const result = await db.prepare(sql).bind(...bindings).all();
  assert.equal(result.success, true);
  return result.results;
}
async function readTables(db, names) {
  const result = await db.batch(names.map((table) => db.prepare(`SELECT * FROM ${table}`)));
  assert.equal(result.length, names.length);
  assert.ok(result.every((entry) => entry.success));
  return Object.fromEntries(names.map((table, index) => [table, ordered(result[index].results)]));
}
async function executeSql(db, sql) {
  const statements = splitSql(sql).filter((statement) => statement.trim());
  const result = await db.batch(statements.map((statement) => db.prepare(statement)));
  assert.equal(result.length, statements.length);
  assert.ok(result.every((entry) => entry.success));
  return statements.length;
}
function insert(db, table, row) {
  const columns = Object.keys(row);
  return db.prepare(`INSERT INTO ${table} (${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')})`)
    .bind(...columns.map((column) => row[column]));
}
const policy = defineCustomerSegmentFactsPolicy({
  schemaVersion: 1, id: 'facts.rehearsal-captured', version: 1,
  population: 'active_profiles', orderStatuses: ['paid', 'shipped', 'delivered'],
  orderEligibility: 'successful_capture', activityBasis: 'last_successful_capture',
  amountBasis: 'captured_payments', refunds: 'subtract', storedValue: 'exclude',
  paymentAdjustments: 'reject', unsettledPayments: 'reject', missingPaymentEvidence: 'null',
  currency: 'EUR', foreignCurrency: 'reject', dayBoundary: 'utc_calendar_days',
});
const report = {
  runtime: 'Wrangler getPlatformProxy / local workerd D1', remoteBindings: false, envFiles: [],
  nodeVersion: process.version, wranglerVersion: wranglerRequire('../package.json').version,
  schema: BACKUP_SCHEMA_VERSION, output, policy, limits: CUSTOMER_SEGMENT_SOURCE_LIMITS, checks: [],
};
const check = (message, data = {}) => {
  report.checks.push({ message, ...data });
  console.log(`✓ ${message}`);
};
console.log(`Ensayo aislado: ${output}`);
let platform;
try {
  platform = await getPlatformProxy({ configPath, envFiles: [], remoteBindings: false,
    persist: { path: join(output, 'state') } });
  const { SOURCE: source, RESTORE: restored } = platform.env;
  const migrations = (await readdir(join(root, 'migrations'))).filter((name) => /^\d{4}_.*\.sql$/.test(name)).sort();
  assert.equal(migrations.at(-1), '0046_customer_segment_execution.sql', 'Revisar el ensayo si cambia el esquema canónico.');
  for (const migration of migrations.slice(0, -1)) {
    const sql = await readFile(join(root, 'migrations', migration), 'utf8');
    await Promise.all([executeSql(source, sql), executeSql(restored, sql)]);
  }
  check('Dos D1 vacías reciben primero las 45 migraciones anteriores para ensayar la ampliación con datos', { migrationCount: migrations.length - 1 });

  const base = Date.now();
  const daysAgo = (days) => new Date(base - days * 86_400_000).toISOString();
  const profileAt = daysAgo(30);
  const orderAt = daysAgo(14);
  const captureAt = daysAgo(7);
  const profileId = 'customer:facts-captured';
  const missingId = 'customer:facts-missing';
  const emptyId = 'customer:facts-empty';
  const mergedId = 'customer:facts-merged';
  const profileRow = (id) => ({
    id, primary_email: `${id.slice('customer:'.length)}@example.test`, email_identity_hash: hash(id),
    status: 'active', version: 1, created_at: profileAt, updated_at: profileAt,
  });
  await source.batch([profileId, missingId, emptyId].map((id) => insert(source, 'customer_profiles', profileRow(id))));
  await source.batch([insert(source, 'customer_profiles', {
    ...profileRow(mergedId), status: 'merged', merged_into_profile_id: profileId,
  })]);
  await source.batch([
    [1, profileId], [2, missingId], [3, mergedId],
  ].map(([id, customerProfileId]) => insert(source, 'orders', {
    id, order_number: `FACTS-${id}`, email: `order-${id}@example.test`,
    customer_name: 'Persona sintética del ensayo', address_json: '{}',
    subtotal_cents: 10000, shipping_cents: 0, total_cents: 10000,
    status: 'paid', currency: 'EUR', customer_profile_id: customerProfileId,
    // También se comprueba la normalización UTC de fechas legacy SQLite.
    created_at: orderAt.slice(0, 19).replace('T', ' '), updated_at: orderAt,
  })));
  await source.batch([insert(source, 'payments', {
    id: 1, order_id: 1, provider: 'simulated', currency: 'EUR', expected_amount_cents: 10000,
    status: 'partially_refunded', version: 1, idempotency_key: 'facts:payment:1',
    created_at: orderAt, updated_at: daysAgo(2),
  })]);
  const transaction = (id, type, amount, at) => insert(source, 'payment_transactions', {
    id, payment_id: 1, type, amount_cents: amount, currency: 'EUR', status: 'succeeded',
    idempotency_key: `facts:transaction:${id}`, occurred_at: at, created_at: at,
  });
  await source.batch([transaction(1, 'capture', 10000, captureAt), transaction(2, 'refund', 2500, daysAgo(2))]);

  const legacyNames = (await query(source, "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name"))
    .map((row) => row.name);
  const beforeMigration = hash(await readTables(source, legacyNames));
  const migration46 = await readFile(join(root, 'migrations', migrations.at(-1)), 'utf8');
  await Promise.all([executeSql(source, migration46), executeSql(restored, migration46)]);
  assert.equal(hash(await readTables(source, legacyNames)), beforeMigration);
  const executionTables = ['customer_segment_facts_policies', 'customer_segment_execution_plans', 'customer_segment_job_intents'];
  for (const table of executionTables) assert.equal((await query(source, `SELECT count(*) AS value FROM ${table}`))[0].value, 0);
  const migratedNames = (await query(source, "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name"))
    .map((row) => row.name);
  assert.deepEqual(migratedNames.filter((name) => !legacyNames.includes(name)).sort(), [...executionTables].sort());
  check('0046 añade exactamente tres tablas vacías y conserva el hash de todas las filas anteriores', { previousTablesHash: beforeMigration });

  const names = (await query(source, "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name"))
    .map((row) => row.name);
  const initialHash = hash(await readTables(source, names));
  const sourceBatches = [];
  const readOnly = {
    prepare(sql) {
      assert.match(sql.trim(), /^(?:SELECT|WITH)\b/i, 'La fuente solo puede preparar lecturas.');
      assert.doesNotMatch(sql, /\b(?:INSERT|UPDATE|DELETE|REPLACE|CREATE|DROP|ALTER|ATTACH|DETACH)\b/i);
      return source.prepare(sql);
    },
    batch(statements) { sourceBatches.push(statements.length); return source.batch(statements); },
  };
  const factsSource = createD1CustomerSegmentFactsSource(readOnly, policy);
  const snapshot = await factsSource.capture();
  assert.deepEqual(sourceBatches, [7], 'La captura debe ser un solo batch de siete lecturas.');
  assert.equal(hash(await readTables(source, names)), initialHash);
  assert.equal(snapshot.candidates.length, 3);
  assert.ok(!snapshot.candidates.some((candidate) => candidate.customerProfileId === mergedId));
  const candidate = (id) => snapshot.candidates.find((value) => value.customerProfileId === id);
  const dayDifference = (at) => Math.floor(Date.parse(snapshot.capturedAt) / 86_400_000) - Math.floor(Date.parse(at) / 86_400_000);
  assert.deepEqual(candidate(profileId).facts, {
    'customer.age_days': dayDifference(profileAt), 'orders.count': 1,
    'orders.days_since_last': dayDifference(captureAt), 'orders.total_spent_cents': 7500,
  });
  assert.deepEqual(candidate(missingId).facts, {
    'customer.age_days': dayDifference(profileAt), 'orders.count': null,
    'orders.days_since_last': null, 'orders.total_spent_cents': null,
  });
  assert.deepEqual(candidate(emptyId).facts, {
    'customer.age_days': dayDifference(profileAt), 'orders.count': 0,
    'orders.days_since_last': null, 'orders.total_spent_cents': 0,
  });
  const { ref, ...content } = snapshot;
  assert.equal(ref, `source:${await segmentFingerprint(policy)}:${await segmentFingerprint(content)}`);
  assert.doesNotMatch(JSON.stringify(snapshot), /example\.test|Persona sintética|address_json|primary_email/);
  check('Captura real en siete SELECT: 10000−2500=7500 céntimos, ausencia de pago null, sin pedidos cero y merged excluido', {
    sourceRef: snapshot.ref, capturedAt: snapshot.capturedAt, candidates: snapshot.candidates.length, sourceTablesHash: initialHash,
  });

  const ignoreRefunds = defineCustomerSegmentFactsPolicy({ ...policy, refunds: 'ignore' });
  const gross = await createD1CustomerSegmentFactsSource(readOnly, ignoreRefunds).capture();
  assert.equal(gross.candidates.find((value) => value.customerProfileId === profileId).facts['orders.total_spent_cents'], 10000);
  assert.notEqual(gross.ref.split(':')[1], snapshot.ref.split(':')[1]);
  await assert.rejects(createD1CustomerSegmentFactsSource(readOnly, {
    ...policy, missingPaymentEvidence: 'reject',
  }).capture(), /carece de evidencia/);
  assert.equal(hash(await readTables(source, names)), initialHash);
  check('La política explícita cambia el importe y su huella; reject aborta por evidencia ausente sin escribir');

  let sequence = 0;
  const ctx = (key) => ({ actorId: 'actor:facts-rehearsal', idempotencyKey: `facts-rehearsal:${key}`,
    occurredAt: new Date().toISOString() });
  const repo = createD1CustomerSegmentationRepository(source, { newId: () => `facts-local-${++sequence}` });
  const template = defineCustomerSegmentTemplate({ id: 'spending.minimum', version: 1,
    parameters: [{ name: 'minimum', min: 1, max: 100000 }],
    conditions: [{ fact: 'orders.total_spent_cents', operator: 'gte', parameter: 'minimum' }] });
  const segmentId = 'segment.facts-rehearsal';
  await repo.appendDefinition({ ...ctx('definition'), segmentId, expectedVersion: 0, template, parameters: { minimum: 7200 } });
  const run = (await repo.requestRun({ ...ctx('request'), segmentId, definitionVersion: 1 })).value;
  await repo.startRun({ ...ctx('start'), runId: run.runId, expectedRevision: 1, snapshot });
  let current = (await repo.readRun(run.runId)).snapshot;
  while (current.processedCandidates < current.totalCandidates) {
    current = (await repo.appendProgress({ ...ctx(`progress:${current.revision}`), runId: run.runId,
      expectedRevision: current.revision, cursor: current.cursor, limit: 2 })).value;
  }
  await repo.completeRun({ ...ctx('complete'), runId: run.runId, expectedRevision: current.revision });
  const publication = { ...ctx('publish'), segmentId, runId: run.runId, expectedPublicationVersion: 0 };
  await repo.publish(publication);
  const membership = await repo.readMembership(segmentId, profileId);
  assert.equal(membership.state, 'evaluated');
  assert.equal(membership.matches, true);
  const missing = await repo.readMembership(segmentId, missingId);
  assert.equal(missing.state, 'evaluated');
  assert.equal(missing.matches, false);
  assert.deepEqual(missing.missingFacts, ['orders.total_spent_cents']);
  assert.equal((await repo.readMembership(segmentId, emptyId)).matches, false);
  const completed = await repo.readRun(run.runId);
  assert.equal(completed.snapshot.sourceSnapshotRef, snapshot.ref);
  assert.equal(completed.snapshot.factsPolicyId, policy.id);
  assert.equal(completed.snapshot.factsCapturedAt, snapshot.capturedAt);
  assert.equal(completed.snapshot.matchedCustomers, 1);
  check('La captura alimenta definición→solicitud→inicio→progreso→completado→publicación, conservando ref/política/fecha', {
    runId: run.runId, processedCandidates: completed.snapshot.processedCandidates,
    matchedCustomers: completed.snapshot.matchedCustomers,
  });

  await source.batch([transaction(3, 'refund', 500, daysAgo(1))]);
  const afterRefundHash = hash(await readTables(source, names));
  const changed = await factsSource.capture();
  assert.equal(changed.candidates.find((value) => value.customerProfileId === profileId).facts['orders.total_spent_cents'], 7000);
  assert.notEqual(changed.ref, snapshot.ref);
  assert.equal(candidate(profileId).facts['orders.total_spent_cents'], 7500);
  assert.equal((await repo.readRun(run.runId)).snapshot.sourceSnapshotRef, snapshot.ref);
  assert.equal((await repo.readMembership(segmentId, profileId)).matches, true);
  assert.equal(hash(await readTables(source, names)), afterRefundHash);
  check('Otro reembolso cambia la nueva captura a 7000 sin reescribir los 7500 ni la publicación anterior');

  const coordinatedRun = (await repo.requestRun({ ...ctx('request:coordinator'), segmentId, definitionVersion: 1 })).value;
  const advanceCommand = { runId: coordinatedRun.runId, actorId: 'actor:facts-rehearsal', limit: 1 };
  function twoArrivals() {
    let arrivals = 0;
    let release;
    const ready = new Promise((resolveReady) => { release = resolveReady; });
    return async () => { if (++arrivals === 2) release(); await ready; };
  }
  const startBarrier = twoArrivals();
  const capturedStarts = [];
  const execution = createCustomerSegmentExecution({ repository: repo, policy, now: () => Date.now(), source: {
    async capture() {
      const captured = await factsSource.capture();
      capturedStarts.push(captured);
      // Ambos trabajadores han leído requested antes de competir por el inicio.
      await startBarrier();
      return captured;
    },
  } });
  const starts = await Promise.all([execution.advance(advanceCommand), execution.advance(advanceCommand)]);
  assert.equal(capturedStarts.length, 2);
  assert.equal(starts.filter((result) => result.outcome === 'applied').length, 1);
  assert.ok(starts.every((result) => ['applied', 'replayed', 'reconciled'].includes(result.outcome)));
  let coordinated = await repo.readRun(coordinatedRun.runId);
  assert.equal(coordinated.snapshot.state, 'running');
  assert.equal(coordinated.snapshot.revision, 2);
  assert.equal(coordinated.snapshot.processedCandidates, 0);
  assert.equal((await repo.readSnapshots(coordinatedRun.runId)).length, 2);
  assert.equal((await query(source, 'SELECT count(*) AS value FROM customer_segment_results WHERE run_id=?', coordinatedRun.runId))[0].value, 3);
  const coordinatedRef = coordinated.snapshot.sourceSnapshotRef;
  assert.ok(capturedStarts.some((captured) => captured.ref === coordinatedRef));
  assert.deepEqual(await repo.readMembership(segmentId, profileId), membership);
  check('Dos coordinadores compiten por requested: un único inicio, tres candidatos y ninguna publicación implícita', {
    runId: coordinatedRun.runId, outcomes: starts.map((result) => result.outcome), sourceRef: coordinatedRef,
  });

  await source.batch([transaction(4, 'refund', 500, daysAgo(0.5))]);
  let restartedCaptureCalls = 0;
  const unavailableSource = { async capture() {
    restartedCaptureCalls++;
    throw new Error('Una ejecución iniciada nunca debe volver a capturar.');
  } };
  const progressBarrier = twoArrivals();
  const concurrentRepository = { ...repo, async readRun(runId) {
    const value = await repo.readRun(runId);
    if (runId === coordinatedRun.runId && value.snapshot.revision === 2) await progressBarrier();
    return value;
  } };
  const restarted = createCustomerSegmentExecution({ repository: concurrentRepository,
    source: unavailableSource, policy, now: () => Date.now() });
  const progresses = await Promise.all([restarted.advance(advanceCommand), restarted.advance(advanceCommand)]);
  assert.equal(progresses.filter((result) => result.outcome === 'applied').length, 1);
  assert.ok(progresses.every((result) => ['applied', 'replayed', 'reconciled'].includes(result.outcome)));
  coordinated = await repo.readRun(coordinatedRun.runId);
  assert.equal(coordinated.snapshot.revision, 3);
  assert.equal(coordinated.snapshot.processedCandidates, 1);
  assert.equal(coordinated.snapshot.sourceSnapshotRef, coordinatedRef);
  check('Tras reiniciar, dos avances sobre el mismo cursor confirman un único candidato y conservan la captura', {
    outcomes: progresses.map((result) => result.outcome), revision: coordinated.snapshot.revision,
    processedCandidates: coordinated.snapshot.processedCandidates,
  });

  const resumed = createCustomerSegmentExecution({ repository: repo, source: unavailableSource,
    policy, now: () => Date.now() });
  while (coordinated.snapshot.processedCandidates < coordinated.snapshot.totalCandidates) {
    const previous = coordinated.snapshot;
    const result = await resumed.advance(advanceCommand);
    coordinated = result.run;
    assert.equal(result.outcome, 'applied');
    assert.equal(coordinated.snapshot.state, 'running');
    assert.equal(coordinated.snapshot.revision, previous.revision + 1);
    assert.equal(coordinated.snapshot.processedCandidates, previous.processedCandidates + 1);
    assert.equal(coordinated.snapshot.sourceSnapshotRef, coordinatedRef);
  }
  assert.equal(coordinated.snapshot.cursor, null);
  const beforeCompletion = coordinated.snapshot.revision;
  const completion = await resumed.advance(advanceCommand);
  assert.equal(completion.outcome, 'applied');
  assert.equal(completion.run.snapshot.state, 'completed');
  assert.equal(completion.run.snapshot.revision, beforeCompletion + 1);
  assert.equal(completion.run.snapshot.matchedCustomers, 0);
  const frozen = await query(source, 'SELECT facts_json FROM customer_segment_results WHERE run_id=? AND customer_profile_id=?', coordinatedRun.runId, profileId);
  assert.equal(JSON.parse(frozen[0].facts_json)['orders.total_spent_cents'], 7000);
  assert.equal(restartedCaptureCalls, 0);
  assert.deepEqual(await repo.readMembership(segmentId, profileId), membership);
  const completedHash = hash(await readTables(source, names));
  const unchanged = await resumed.advance(advanceCommand);
  assert.equal(unchanged.outcome, 'unchanged');
  assert.deepEqual(unchanged.run, completion.run);
  assert.equal(hash(await readTables(source, names)), completedHash);
  check('Cada invocación avanza una revisión, completa por separado y termina sin recapturar ni publicar; 7000 siguen congelados', {
    revisions: (await repo.readSnapshots(coordinatedRun.runId)).length,
    recaptureAttempts: restartedCaptureCalls, terminalOutcome: unchanged.outcome,
  });

  await assert.rejects(resumed.publish({ ...ctx('publish:coordinator-stale'), segmentId,
    runId: coordinatedRun.runId, expectedPublicationVersion: 0 }), (error) => error.code === 'customer_segmentation_conflict');
  assert.deepEqual(await repo.readMembership(segmentId, profileId), membership);
  const coordinatedPublication = { ...ctx('publish:coordinator'), segmentId,
    runId: coordinatedRun.runId, expectedPublicationVersion: 1 };
  const published = await resumed.publish(coordinatedPublication);
  assert.equal(published.outcome, 'applied');
  assert.equal(published.value.version, 2);
  const publishedHash = hash(await readTables(source, names));
  const publicationReplay = await resumed.publish(coordinatedPublication);
  assert.equal(publicationReplay.outcome, 'replayed');
  assert.deepEqual(publicationReplay.value, published.value);
  assert.equal(hash(await readTables(source, names)), publishedHash);
  const coordinatedMembership = await repo.readMembership(segmentId, profileId);
  assert.equal(coordinatedMembership.state, 'evaluated');
  assert.equal(coordinatedMembership.matches, false);
  assert.equal(coordinatedMembership.publication.version, 2);
  assert.equal(restartedCaptureCalls, 0);
  check('Publicación explícita: CAS obsoleto rechazado, versión 2 confirmada y comando idéntico reproducido sin nuevas filas');

  // Composición exclusivamente de QA: ningún descriptor se registra en runtime.
  const store = createD1CustomerSegmentExecutionStore(source, { newId: () => `durable-local-${++sequence}` });
  const policyCommand = { ...ctx('durable:policy'), policy };
  const registeredPolicy = await store.registerPolicy(policyCommand);
  assert.equal(registeredPolicy.outcome, 'applied');
  assert.equal((await store.registerPolicy(policyCommand)).outcome, 'replayed');
  await assert.rejects(store.registerPolicy({ ...ctx('durable:policy-conflict'), policy: { ...policy, refunds: 'ignore' } }));
  await store.registerPolicy({ ...ctx('durable:unused-policy'), policy: { ...policy, id: 'facts.rehearsal-unused' } });
  const durableSegment = 'segment.durable-rehearsal';
  await repo.appendDefinition({ ...ctx('durable:definition'), segmentId: durableSegment, expectedVersion: 0,
    template, parameters: { minimum: 7200 } });
  async function planned(label, batchSize = 1) {
    const value = (await repo.requestRun({ ...ctx(`durable:request:${label}`), segmentId: durableSegment, definitionVersion: 1 })).value;
    const command = { ...ctx(`durable:plan:${label}`), runId: value.runId,
      policyId: policy.id, policyVersion: policy.version, batchSize };
    const attached = await store.attachPlan(command);
    assert.equal(attached.outcome, 'applied');
    assert.equal((await store.attachPlan(command)).outcome, 'replayed');
    return { runId: value.runId, command };
  }
  const durable = await planned('partial');
  const enqueueCommand = { ...ctx('durable:enqueue:first'), runId: durable.runId, expectedRevision: 1,
    scheduledFor: new Date().toISOString() };
  const scheduled = await Promise.all([store.enqueueStep(enqueueCommand), store.enqueueStep(enqueueCommand)]);
  assert.equal(scheduled.filter((item) => item.outcome === 'applied').length, 1);
  assert.equal(scheduled.filter((item) => item.outcome === 'replayed').length, 1);
  assert.deepEqual(scheduled[0].value, scheduled[1].value);
  const firstIntent = scheduled[0].value;
  await assert.rejects(store.enqueueStep({ ...ctx('durable:enqueue:incompatible'), runId: durable.runId,
    expectedRevision: 1, scheduledFor: enqueueCommand.scheduledFor }));
  const requested = await planned('requested');
  const secondIntent = (await store.enqueueStep({ ...ctx('durable:enqueue:second'), runId: requested.runId,
    expectedRevision: 1, scheduledFor: new Date().toISOString() })).value;
  const queue = createD1JobRunRepository(source);
  const qaDescriptor = { id: 'customers.advance-segment', moduleId: 'customers', scope: 'capability',
    requiredCapabilityId: 'CUS-009', trigger: { kind: 'one-off' }, modes: ['client'],
    timeoutSeconds: 30, maxAttempts: 3, retryDelaysSeconds: [1, 5] };
  const claimedJob = await queue.claim(qaDescriptor, 'qa-worker', new Date().toISOString());
  assert.equal(claimedJob.runId, firstIntent.jobRunId);
  assert.notEqual(claimedJob.runId, secondIntent.jobRunId);
  const actualIntent = await store.readJobIntent(claimedJob.runId);
  const actualPlan = await store.readPlan(actualIntent.runId);
  const actualPolicy = await store.readPolicy(actualPlan.policyId, actualPlan.policyVersion);
  assert.equal(actualIntent.runId, durable.runId);
  assert.equal(actualPlan.policyFingerprint, actualPolicy.fingerprint);
  const plannedExecution = createCustomerSegmentExecution({ repository: repo, policy: actualPolicy.policy,
    source: createD1CustomerSegmentFactsSource(readOnly, actualPolicy.policy), now: () => Date.now() });
  const plannedAdvance = { runId: actualIntent.runId, actorId: 'actor:facts-rehearsal', limit: actualPlan.batchSize };
  assert.equal((await plannedExecution.advance(plannedAdvance)).run.snapshot.state, 'running');
  assert.equal((await repo.readRun(requested.runId)).snapshot.state, 'requested');
  assert.equal(await queue.succeed(claimedJob, 'qa-worker', new Date().toISOString()), true);
  const purgeAt = new Date(Date.now() + 31 * 86_400_000).toISOString();
  assert.equal(await queue.purgeSucceeded(purgeAt, 30, 100), 1);
  assert.deepEqual(await store.readJobIntent(firstIntent.jobRunId), firstIntent);
  await assert.rejects(store.recoverStep({ jobRunId: firstIntent.jobRunId }));
  check('Política y plan inmutables, encolado concurrente único y claim resuelto por el job real; purgar la cola conserva la intención', {
    firstJobRunId: firstIntent.jobRunId, claimedRunId: actualIntent.runId,
    outcomes: scheduled.map((item) => item.outcome),
  });

  // Caída entre confirmar inicio y preparar el paso siguiente: se relee revisión.
  assert.equal((await query(source, 'SELECT count(*) AS value FROM customer_segment_job_intents WHERE run_id=?', durable.runId))[0].value, 1);
  const afterStart = await repo.readRun(durable.runId);
  const progressIntent = (await store.enqueueStep({ ...ctx('durable:enqueue:progress'), runId: durable.runId,
    expectedRevision: afterStart.snapshot.revision, scheduledFor: new Date().toISOString() })).value;
  const plannedResumed = createCustomerSegmentExecution({ repository: repo, policy: actualPolicy.policy,
    source: unavailableSource, now: () => Date.now() });
  const partial = await plannedResumed.advance(plannedAdvance);
  assert.equal(partial.run.snapshot.processedCandidates, 1);
  const currentIntent = (await store.enqueueStep({ ...ctx('durable:enqueue:current'), runId: durable.runId,
    expectedRevision: partial.run.snapshot.revision, scheduledFor: new Date().toISOString() })).value;
  const idlePlan = await planned('without-job');
  const failedPlan = await planned('failed');
  await repo.failRun({ ...ctx('durable:fail'), runId: failedPlan.runId, expectedRevision: 1, errorCode: 'qa.synthetic_failure' });
  const completedPlan = await planned('completed', 100);
  const completedIntent = (await store.enqueueStep({ ...ctx('durable:enqueue:completed'), runId: completedPlan.runId,
    expectedRevision: 1, scheduledFor: new Date().toISOString() })).value;
  const completionInput = { runId: completedPlan.runId, actorId: 'actor:facts-rehearsal', limit: 100 };
  await plannedExecution.advance(completionInput);
  await plannedResumed.advance(completionInput);
  assert.equal((await plannedResumed.advance(completionInput)).run.snapshot.state, 'completed');
  await plannedResumed.publish({ ...ctx('durable:publish'), segmentId: durableSegment,
    runId: completedPlan.runId, expectedPublicationVersion: 0 });
  await assert.rejects(store.attachPlan({ ...ctx('durable:late-plan'), runId: run.runId,
    policyId: policy.id, policyVersion: policy.version, batchSize: 1 }));
  assert.equal(restartedCaptureCalls, 0);
  check('El plan fija lote y política antes de capturar; recuperación del paso siguiente, runs sin plan y con estados mixtos conservados');

  const backup = await exportD1Backup(source);
  const backupPath = join(output, `backup-schema-${BACKUP_SCHEMA_VERSION}.sql`);
  await writeFile(backupPath, backup.sql);
  const restoreStatements = await executeSql(restored, backup.sql);
  const sourceTables = await readTables(source, BACKUP_TABLES);
  assert.deepEqual(await readTables(restored, BACKUP_TABLES), sourceTables);
  const restoredRepo = createD1CustomerSegmentationRepository(restored);
  assert.deepEqual(await restoredRepo.readRun(run.runId), await repo.readRun(run.runId));
  assert.deepEqual(await restoredRepo.readRun(coordinatedRun.runId), completion.run);
  assert.deepEqual(await restoredRepo.readMembership(segmentId, profileId), coordinatedMembership);
  const historicalReplay = await restoredRepo.publish(publication);
  assert.equal(historicalReplay.outcome, 'replayed');
  assert.equal(historicalReplay.value.version, 1);
  assert.equal(historicalReplay.current.version, 2);
  assert.equal((await restoredRepo.readRun(run.runId)).snapshot.sourceSnapshotRef, snapshot.ref);
  const restoredExecution = createCustomerSegmentExecution({ repository: restoredRepo,
    source: unavailableSource, policy, now: () => Date.now() });
  assert.equal((await restoredExecution.advance(advanceCommand)).outcome, 'unchanged');
  const restoredPublication = await restoredExecution.publish(coordinatedPublication);
  assert.equal(restoredPublication.outcome, 'replayed');
  assert.deepEqual(restoredPublication.value, published.value);
  assert.equal((await restoredRepo.readRun(coordinatedRun.runId)).snapshot.sourceSnapshotRef, coordinatedRef);
  assert.equal(restartedCaptureCalls, 0);
  assert.deepEqual(await query(source, 'PRAGMA foreign_key_check'), []);
  assert.deepEqual(await query(restored, 'PRAGMA foreign_key_check'), []);
  const restoredStore = createD1CustomerSegmentExecutionStore(restored);
  assert.deepEqual(await restoredStore.readPolicy(policy.id, policy.version), registeredPolicy.value);
  assert.deepEqual(await restoredStore.readPlan(durable.runId), await store.readPlan(durable.runId));
  assert.deepEqual(await restoredStore.readJobIntent(firstIntent.jobRunId), firstIntent);
  assert.equal((await query(restored, 'SELECT count(*) AS value FROM platform_job_runs'))[0].value, 0);
  assert.equal((await restoredStore.registerPolicy(policyCommand)).outcome, 'replayed');
  assert.equal((await restoredStore.attachPlan(durable.command)).outcome, 'replayed');
  assert.equal((await restoredStore.enqueueStep(enqueueCommand)).outcome, 'replayed');
  assert.equal((await query(restored, 'SELECT count(*) AS value FROM platform_job_runs'))[0].value, 0);
  await assert.rejects(restoredStore.recoverStep({ jobRunId: firstIntent.jobRunId }));
  await assert.rejects(restoredStore.recoverStep({ jobRunId: progressIntent.jobRunId }));
  await assert.rejects(restoredStore.recoverStep({ jobRunId: completedIntent.jobRunId }));
  assert.equal((await restoredStore.recoverStep({ jobRunId: currentIntent.jobRunId })).outcome, 'applied');
  assert.equal((await restoredStore.recoverStep({ jobRunId: currentIntent.jobRunId })).outcome, 'replayed');
  assert.equal((await restoredStore.recoverStep({ jobRunId: secondIntent.jobRunId })).outcome, 'applied');
  assert.equal((await query(restored, 'SELECT count(*) AS value FROM platform_job_runs'))[0].value, 2);
  assert.equal((await restoredRepo.readRun(idlePlan.runId)).snapshot.state, 'requested');
  assert.deepEqual(await readTables(restored, BACKUP_TABLES), sourceTables);
  assert.deepEqual(await query(restored, 'PRAGMA foreign_key_check'), []);
  check('Backup39 restaura políticas, planes e intenciones sin cola; solo una recuperación explícita de revisión abierta vigente recrea el paso', {
    tableCount: BACKUP_TABLES.length, tablesHash: hash(sourceTables), restoreStatements,
    backupPath, backupSha256: createHash('sha256').update(backup.sql).digest('hex'),
  });

  // La prueba de volumen va al final: no altera la evidencia anterior ni necesita truncar tablas.
  await source.batch(Array.from({ length: 97 }, (_, index) => insert(source, 'customer_profiles',
    profileRow(`customer:facts-limit-${String(index + 1).padStart(3, '0')}`))));
  const limit100Hash = hash(await readTables(source, names));
  const maximum = await factsSource.capture();
  assert.equal(maximum.candidates.length, 100);
  assert.equal(new Set(maximum.candidates.map((value) => value.customerProfileId)).size, 100);
  assert.equal(hash(await readTables(source, names)), limit100Hash);
  check('100 perfiles activos se capturan completos, sin truncamiento ni escrituras', { candidates: maximum.candidates.length });

  await source.batch([insert(source, 'customer_profiles', profileRow('customer:facts-limit-101'))]);
  const limit101Hash = hash(await readTables(source, names));
  await assert.rejects(factsSource.capture(), /límite técnico de 100 \(profiles\)/);
  assert.equal(hash(await readTables(source, names)), limit101Hash);
  assert.ok(sourceBatches.every((length) => length === 7));
  check('101 perfiles activos abortan toda la captura y conservan todas las tablas', {
    captureAttempts: sourceBatches.length, readBatchSize: 7, sourceTablesHash: limit101Hash,
  });
  report.result = 'passed';
  await writeFile(join(output, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(`PASS — informe: ${join(output, 'report.json')}`);
} catch (error) {
  report.result = 'failed';
  report.error = String(error?.stack ?? error);
  await writeFile(join(output, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  throw error;
} finally {
  await platform?.dispose();
}
