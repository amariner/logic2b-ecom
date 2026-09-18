import {
  assertCustomerSegmentRecalculation, createCustomerSegmentFacts,
  defineCustomerSegmentTemplate, evaluateCustomerSegment, instantiateCustomerSegment,
  CustomerSegmentationContractError, type CustomerSegmentTemplate,
} from '../domain/customer-segmentation';
import {
  canonicalSegmentJson, segmentFingerprint, normalizeCustomerSegmentFactsSnapshot,
  segmentInteger, segmentOpaqueId, segmentRecord, segmentTimestamp,
  MAX_CUSTOMER_SEGMENT_CANDIDATES,
} from '../application/customer-segmentation-contract';
import type {
  CustomerSegmentationRepository, SegmentCommandContext, SegmentDefinition,
  SegmentPublication, SegmentRun, SegmentRunSnapshot, SegmentWrite,
} from '../application/customer-segmentation-repository';

type Row = Record<string, unknown>;
const SNAPSHOT_COLUMNS = [
  'run_id', 'revision', 'state', 'started_at', 'finished_at', 'cursor',
  'total_candidates', 'processed_candidates', 'matched_customers', 'error_code',
  'source_snapshot_ref', 'source_snapshot_fingerprint', 'facts_policy_id',
  'facts_policy_version', 'facts_captured_at', 'currency', 'last_position',
  'recorded_at', 'actor_id', 'idempotency_key', 'command_fingerprint',
] as const;

export class CustomerSegmentationConflictError extends Error {
  readonly code = 'customer_segmentation_conflict';
  constructor() { super('La versión, el cursor o la clave de idempotencia ya no coinciden.'); this.name = 'CustomerSegmentationConflictError'; }
}
function conflict(): never { throw new CustomerSegmentationConflictError(); }
function invalid(message: string): never { throw new CustomerSegmentationContractError(message); }
function name(value: unknown, field: string): string {
  const parsed = segmentOpaqueId(value, field);
  if (!/^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/u.test(parsed)) invalid(`${field} no es canónico.`);
  return parsed;
}
function digest(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/u.test(value)) invalid('Huella persistida inválida.');
  return value;
}
function json(value: unknown): unknown {
  if (typeof value !== 'string') invalid('JSON persistido inválido.');
  let parsed: unknown;
  try { parsed = JSON.parse(value); } catch { return invalid('JSON persistido inválido.'); }
  if (canonicalSegmentJson(parsed) !== value) invalid('JSON persistido no canónico.');
  return parsed;
}

/** Puerto interno: no se compone en rutas ni jobs mientras CUS-009 está inactiva. */
export function createD1CustomerSegmentationRepository(
  db: D1Database,
  options: Readonly<{ now?: () => number; newId?: () => string }> = {},
): CustomerSegmentationRepository {
  const now = options.now ?? Date.now;
  const newId = options.newId ?? (() => crypto.randomUUID());
  const clock = () => {
    const value = now();
    if (!Number.isFinite(value) || !Number.isFinite(new Date(value).getTime())) invalid('Reloj inválido.');
    return value;
  };
  const at = (value: unknown, field: string) => segmentTimestamp(value, clock(), field);
  function context(input: unknown, keys: readonly string[]): SegmentCommandContext {
    const row = segmentRecord(input, ['actorId', 'idempotencyKey', 'occurredAt', ...keys], 'command');
    const idempotencyKey = segmentOpaqueId(row.idempotencyKey, 'idempotencyKey');
    if (idempotencyKey.length < 8) invalid('idempotencyKey debe tener al menos ocho caracteres.');
    return { actorId: segmentOpaqueId(row.actorId, 'actorId'), idempotencyKey,
      occurredAt: at(row.occurredAt, 'occurredAt') };
  }
  function insert(table: string, row: Row): D1PreparedStatement {
    const columns = Object.keys(row);
    return db.prepare(`INSERT INTO ${table} (${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')})`)
      .bind(...columns.map((column) => row[column]));
  }
  function snapshotInsert(row: Row): D1PreparedStatement {
    return insert('customer_segment_run_snapshots', Object.fromEntries(SNAPSHOT_COLUMNS.map((column) => [column, row[column]])));
  }
  async function definition(row: Row): Promise<SegmentDefinition> {
    const template = defineCustomerSegmentTemplate(json(row.template_json) as CustomerSegmentTemplate);
    const segment = instantiateCustomerSegment(template, json(row.parameters_json) as Record<string, number>);
    const fingerprint = digest(row.definition_fingerprint);
    if (template.id !== row.template_id || template.version !== row.template_version ||
      await segmentFingerprint({ template, parameters: segment.parameters }) !== fingerprint) invalid('Definición persistida corrupta.');
    digest(row.command_fingerprint);
    return Object.freeze({ segmentId: name(row.segment_id, 'segmentId'), version: segmentInteger(row.definition_version, 1, 'version'),
      template, segment, fingerprint, createdAt: at(row.created_at, 'createdAt'), createdBy: segmentOpaqueId(row.created_by, 'createdBy') });
  }
  async function readDefinition(segmentId: string, version?: number): Promise<SegmentDefinition | null> {
    name(segmentId, 'segmentId');
    if (version !== undefined) segmentInteger(version, 1, 'version');
    const row = await db.prepare(`SELECT * FROM customer_segment_definitions WHERE segment_id=? ${version === undefined ? '' : 'AND definition_version=?'} ORDER BY definition_version DESC LIMIT 1`)
      .bind(...(version === undefined ? [segmentId] : [segmentId, version])).first<Row>();
    return row ? definition(row) : null;
  }
  function snapshot(row: Row, run: Row): SegmentRunSnapshot {
    const recalculation = assertCustomerSegmentRecalculation({
      segmentId: name(run.segment_id, 'segmentId'), definitionVersion: segmentInteger(run.definition_version, 1, 'definitionVersion'),
      state: row.state as SegmentRunSnapshot['state'], requestedAt: at(run.requested_at, 'requestedAt'),
      startedAt: row.started_at as string | null, finishedAt: row.finished_at as string | null,
      cursor: row.cursor as string | null, totalCandidates: row.total_candidates as number,
      processedCandidates: row.processed_candidates as number, matchedCustomers: row.matched_customers as number,
      errorCode: row.error_code as string | null,
    }, clock());
    const lastPosition = segmentInteger(row.last_position, 0, 'lastPosition');
    if (lastPosition !== recalculation.processedCandidates) invalid('Cursor y contadores persistidos incoherentes.');
    const recordedAt = at(row.recorded_at, 'recordedAt');
    if (recordedAt < (recalculation.finishedAt ?? recalculation.startedAt ?? recalculation.requestedAt)) invalid('Cronología persistida incoherente.');
    const started = recalculation.startedAt !== null;
    const sourceFields = ['source_snapshot_ref', 'source_snapshot_fingerprint', 'facts_policy_id', 'facts_policy_version', 'facts_captured_at', 'currency'];
    if (!started && sourceFields.some((key) => row[key] !== null)) invalid('Snapshot sin inicio contiene hechos.');
    if (started) {
      segmentOpaqueId(row.source_snapshot_ref, 'sourceSnapshotRef'); digest(row.source_snapshot_fingerprint);
      name(row.facts_policy_id, 'factsPolicyId'); segmentInteger(row.facts_policy_version, 1, 'factsPolicyVersion');
      if (at(row.facts_captured_at, 'factsCapturedAt') > recalculation.startedAt!) invalid('Captura posterior al inicio.');
      if (typeof row.currency !== 'string' || !/^[A-Z]{3}$/u.test(row.currency)) invalid('Moneda persistida inválida.');
    }
    digest(row.command_fingerprint);
    return Object.freeze({ ...recalculation, revision: segmentInteger(row.revision, 1, 'revision'), lastPosition,
      sourceSnapshotRef: row.source_snapshot_ref as string | null, sourceSnapshotFingerprint: row.source_snapshot_fingerprint as string | null,
      factsPolicyId: row.facts_policy_id as string | null, factsPolicyVersion: row.facts_policy_version as number | null,
      factsCapturedAt: row.facts_captured_at as string | null, currency: row.currency as string | null,
      recordedAt, actorId: segmentOpaqueId(row.actor_id, 'actorId') });
  }
  const runRow = (runId: string) => {
    segmentOpaqueId(runId, 'runId');
    return db.prepare('SELECT * FROM customer_segment_runs WHERE run_id=?').bind(runId).first<Row>();
  };
  async function runView(run: Row, revision?: number): Promise<SegmentRun> {
    const row = await db.prepare(`SELECT * FROM customer_segment_run_snapshots WHERE run_id=? ${revision === undefined ? '' : 'AND revision=?'} ORDER BY revision DESC LIMIT 1`)
      .bind(...(revision === undefined ? [run.run_id] : [run.run_id, revision])).first<Row>();
    if (!row || !await readDefinition(String(run.segment_id), Number(run.definition_version))) invalid('Ejecución sin definición o fotografía.');
    digest(run.command_fingerprint);
    await verifyPopulation(run, row);
    return Object.freeze({ runId: segmentOpaqueId(run.run_id, 'runId'), segmentId: name(run.segment_id, 'segmentId'),
      definitionVersion: segmentInteger(run.definition_version, 1, 'definitionVersion'), generation: segmentInteger(run.generation, 1, 'generation'),
      requestedAt: at(run.requested_at, 'requestedAt'), requestedBy: segmentOpaqueId(run.requested_by, 'requestedBy'), snapshot: snapshot(row, run) });
  }
  async function base(runId: string, revision: number): Promise<{ run: Row; row: Row }> {
    segmentInteger(revision, 1, 'expectedRevision');
    const run = await runRow(runId);
    if (!run) return conflict();
    const row = await db.prepare('SELECT * FROM customer_segment_run_snapshots WHERE run_id=? AND revision=?').bind(runId, revision).first<Row>();
    if (!row) return conflict();
    snapshot(row, run);
    return { run, row };
  }
  async function replay(table: string, scopeColumn: string, scope: string, key: string, fingerprint: string): Promise<Row | null> {
    const row = await db.prepare(`SELECT * FROM ${table} WHERE ${scopeColumn}=? AND idempotency_key=?`).bind(scope, key).first<Row>();
    if (row && row.command_fingerprint !== fingerprint) conflict();
    return row;
  }
  async function write<T>(
    table: string, scopeColumn: string, scope: string, ctx: SegmentCommandContext,
    fingerprint: string, statements: D1PreparedStatement[], view: (row: Row) => Promise<T>,
  ): Promise<SegmentWrite<T>> {
    try {
      const results = await db.batch(statements);
      if (results.some((result) => !result.success || result.meta.changes !== 1)) throw new Error('La escritura de segmentación no confirmó todas sus filas.');
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      const versionConflict = /customer_segment_[a-z_]*conflict/u.test(message);
      const uniquenessConflict = /UNIQUE constraint failed: customer_segment_(?:definitions|runs|run_snapshots|results|publications)\./u.test(message);
      // Un error de transporte o almacenamiento sigue siendo un error aunque
      // otro escritor haya confirmado simultáneamente el mismo comando.
      if (!versionConflict && !uniquenessConflict) throw error;
      const previous = await replay(table, scopeColumn, scope, ctx.idempotencyKey, fingerprint);
      if (previous) return { outcome: 'replayed', value: await view(previous) };
      if (versionConflict) conflict();
      throw error;
    }
    const row = await replay(table, scopeColumn, scope, ctx.idempotencyKey, fingerprint);
    if (!row) throw new Error('Falta la evidencia de escritura de segmentación.');
    return { outcome: 'applied', value: await view(row) };
  }
  function nextSnapshot(previous: Row, ctx: SegmentCommandContext, fingerprint: string, changes: Row): Row {
    if (ctx.occurredAt < String(previous.recorded_at)) invalid('La transición precede a la revisión esperada.');
    return { ...previous, revision: Number(previous.revision) + 1, ...changes,
      recorded_at: ctx.occurredAt, actor_id: ctx.actorId, idempotency_key: ctx.idempotencyKey, command_fingerprint: fingerprint };
  }
  function publication(row: Row): SegmentPublication {
    digest(row.command_fingerprint);
    return Object.freeze({ segmentId: name(row.segment_id, 'segmentId'), version: segmentInteger(row.publication_version, 1, 'publicationVersion'),
      runId: segmentOpaqueId(row.run_id, 'runId'), definitionVersion: segmentInteger(row.definition_version, 1, 'definitionVersion'),
      generation: segmentInteger(row.generation, 1, 'generation'), publishedAt: at(row.published_at, 'publishedAt'), publishedBy: segmentOpaqueId(row.published_by, 'publishedBy') });
  }
  async function currentPublication(segmentId: string): Promise<SegmentPublication | null> {
    const row = await db.prepare('SELECT * FROM customer_segment_publications WHERE segment_id=? ORDER BY publication_version DESC LIMIT 1').bind(segmentId).first<Row>();
    return row ? publication(row) : null;
  }
  async function resultFacts(row: Row) {
    const facts = createCustomerSegmentFacts(json(row.facts_json) as Parameters<typeof createCustomerSegmentFacts>[0]);
    if (canonicalSegmentJson(facts) !== row.facts_json || await segmentFingerprint(facts) !== digest(row.facts_fingerprint)) invalid('Hechos persistidos corruptos.');
    segmentOpaqueId(row.customer_profile_id, 'customerProfileId'); segmentInteger(row.customer_profile_version, 1, 'customerProfileVersion');
    segmentInteger(row.position, 1, 'position');
    return facts;
  }
  async function verifyPopulation(run: Row, row: Row): Promise<void> {
    if (row.started_at === null) return;
    const rows = (await db.prepare('SELECT * FROM customer_segment_results WHERE run_id=? ORDER BY position').bind(run.run_id).all<Row>()).results;
    const candidates = [];
    let processed = 0;
    let matched = 0;
    for (const [index, result] of rows.entries()) {
      if (result.position !== index + 1) invalid('Población persistida discontinua.');
      candidates.push({ customerProfileId: result.customer_profile_id, customerProfileVersion: result.customer_profile_version,
        facts: await resultFacts(result) });
      if (result.evaluated_revision !== null && Number(result.evaluated_revision) <= Number(row.revision)) {
        if (result.matches !== 0 && result.matches !== 1) invalid('Resultado persistido inválido.');
        processed++; matched += result.matches;
      }
    }
    const source = normalizeCustomerSegmentFactsSnapshot({ ref: row.source_snapshot_ref, policyId: row.facts_policy_id,
      policyVersion: row.facts_policy_version, capturedAt: row.facts_captured_at, currency: row.currency, candidates }, clock());
    if (await segmentFingerprint(source) !== digest(row.source_snapshot_fingerprint) ||
      rows.length !== row.total_candidates || processed !== row.processed_candidates || matched !== row.matched_customers) invalid('La fotografía persistida no acredita su población o sus resultados.');
  }
  async function finish(input: SegmentCommandContext & { runId: string; expectedRevision: number; errorCode?: string }, state: 'completed' | 'failed') {
    const ctx = context(input, ['runId', 'expectedRevision', ...(state === 'failed' ? ['errorCode'] : [])]);
    segmentOpaqueId(input.runId, 'runId'); segmentInteger(input.expectedRevision, 1, 'expectedRevision');
    if (state === 'failed' && (typeof input.errorCode !== 'string' || input.errorCode.length > 200 || !/^[a-z][a-z0-9_.-]*$/u.test(input.errorCode))) invalid('errorCode inválido.');
    input = Object.freeze({ ...ctx, runId: input.runId, expectedRevision: input.expectedRevision,
      ...(state === 'failed' ? { errorCode: input.errorCode! } : {}) });
    const fingerprint = await segmentFingerprint({ operation: state, ...input, ...ctx });
    const { run, row } = await base(input.runId, input.expectedRevision);
    const previous = await replay('customer_segment_run_snapshots', 'run_id', input.runId, ctx.idempotencyKey, fingerprint);
    if (previous) return { outcome: 'replayed' as const, value: snapshot(previous, run) };
    if ((state === 'completed' && (row.state !== 'running' || row.processed_candidates !== row.total_candidates)) ||
      (state === 'failed' && row.state !== 'requested' && row.state !== 'running')) conflict();
    const next = nextSnapshot(row, ctx, fingerprint, { state, finished_at: ctx.occurredAt, cursor: null, error_code: state === 'failed' ? input.errorCode : null });
    snapshot(next, run);
    return write('customer_segment_run_snapshots', 'run_id', input.runId, ctx, fingerprint,
      [snapshotInsert(next)], async (stored) => snapshot(stored, run));
  }

  return {
    readDefinition,
    async appendDefinition(input) {
      const ctx = context(input, ['segmentId', 'expectedVersion', 'template', 'parameters']);
      const segmentId = name(input.segmentId, 'segmentId');
      const expected = segmentInteger(input.expectedVersion, 0, 'expectedVersion');
      segmentInteger(expected + 1, 1, 'version');
      const template = defineCustomerSegmentTemplate(input.template);
      name(template.id, 'template.id');
      const segment = instantiateCustomerSegment(template, input.parameters);
      // Acota el contrato técnico antes de construir una sentencia D1.
      if (canonicalSegmentJson(template).length > 16000 || template.conditions.length > 32) invalid('Template fuera del límite técnico.');
      const fingerprint = await segmentFingerprint({ operation: 'appendDefinition', ...ctx, segmentId, expectedVersion: expected, template, parameters: segment.parameters });
      const previous = await replay('customer_segment_definitions', 'segment_id', segmentId, ctx.idempotencyKey, fingerprint);
      if (previous) return { outcome: 'replayed', value: await definition(previous) };
      return write('customer_segment_definitions', 'segment_id', segmentId, ctx, fingerprint, [insert('customer_segment_definitions', {
        segment_id: segmentId, definition_version: expected + 1, template_id: template.id, template_version: template.version,
        template_json: canonicalSegmentJson(template), parameters_json: canonicalSegmentJson(segment.parameters),
        definition_fingerprint: await segmentFingerprint({ template, parameters: segment.parameters }), created_at: ctx.occurredAt,
        created_by: ctx.actorId, idempotency_key: ctx.idempotencyKey, command_fingerprint: fingerprint,
      })], definition);
    },
    async requestRun(input) {
      const ctx = context(input, ['segmentId', 'definitionVersion']);
      const segmentId = name(input.segmentId, 'segmentId');
      const definitionVersion = segmentInteger(input.definitionVersion, 1, 'definitionVersion');
      const fingerprint = await segmentFingerprint({ operation: 'requestRun', ...ctx, segmentId, definitionVersion });
      const previous = await replay('customer_segment_runs', 'segment_id', segmentId, ctx.idempotencyKey, fingerprint);
      if (previous) return { outcome: 'replayed', value: await runView(previous, 1) };
      const def = await readDefinition(segmentId);
      if (!def || def.version !== definitionVersion) conflict();
      if (ctx.occurredAt < def.createdAt) invalid('Solicitud anterior a la definición.');
      const max = await db.prepare('SELECT COALESCE(MAX(generation),0) AS generation FROM customer_segment_runs WHERE segment_id=?').bind(segmentId).first<{ generation: number }>();
      const runId = segmentOpaqueId(`segment-run:${newId()}`, 'runId');
      const run = { run_id: runId, segment_id: segmentId, definition_version: definitionVersion,
        generation: segmentInteger((max?.generation ?? 0) + 1, 1, 'generation'), requested_at: ctx.occurredAt, requested_by: ctx.actorId,
        idempotency_key: ctx.idempotencyKey, command_fingerprint: fingerprint };
      const initial: Row = { run_id: runId, revision: 1, state: 'requested', started_at: null, finished_at: null, cursor: null,
        total_candidates: 0, processed_candidates: 0, matched_customers: 0, error_code: null, source_snapshot_ref: null,
        source_snapshot_fingerprint: null, facts_policy_id: null, facts_policy_version: null, facts_captured_at: null,
        currency: null, last_position: 0, recorded_at: ctx.occurredAt, actor_id: ctx.actorId,
        idempotency_key: ctx.idempotencyKey, command_fingerprint: fingerprint };
      return write('customer_segment_runs', 'segment_id', segmentId, ctx, fingerprint,
        [insert('customer_segment_runs', run), snapshotInsert(initial)], (stored) => runView(stored, 1));
    },
    async startRun(input) {
      const ctx = context(input, ['runId', 'expectedRevision', 'snapshot']);
      const source = normalizeCustomerSegmentFactsSnapshot(input.snapshot, clock());
      segmentOpaqueId(input.runId, 'runId'); segmentInteger(input.expectedRevision, 1, 'expectedRevision');
      input = Object.freeze({ ...ctx, runId: input.runId, expectedRevision: input.expectedRevision, snapshot: source });
      if (source.capturedAt > ctx.occurredAt) invalid('Captura posterior al inicio.');
      const fingerprint = await segmentFingerprint({ operation: 'startRun', ...ctx, runId: input.runId, expectedRevision: input.expectedRevision, snapshot: source });
      const { run, row } = await base(input.runId, input.expectedRevision);
      const previous = await replay('customer_segment_run_snapshots', 'run_id', input.runId, ctx.idempotencyKey, fingerprint);
      if (previous) return { outcome: 'replayed', value: snapshot(previous, run) };
      if (row.state !== 'requested') conflict();
      const statements: D1PreparedStatement[] = [];
      for (const [index, candidate] of source.candidates.entries()) statements.push(insert('customer_segment_results', {
        run_id: input.runId, customer_profile_id: candidate.customerProfileId, position: index + 1,
        customer_profile_version: candidate.customerProfileVersion, facts_json: canonicalSegmentJson(candidate.facts),
        facts_fingerprint: await segmentFingerprint(candidate.facts), matches: null, missing_facts_json: null, evaluated_revision: null,
      }));
      const next = nextSnapshot(row, ctx, fingerprint, { state: 'running', started_at: ctx.occurredAt,
        cursor: source.candidates.length ? `segment-cursor:${newId()}` : null, total_candidates: source.candidates.length,
        source_snapshot_ref: source.ref, source_snapshot_fingerprint: await segmentFingerprint(source), facts_policy_id: source.policyId,
        facts_policy_version: source.policyVersion, facts_captured_at: source.capturedAt, currency: source.currency });
      snapshot(next, run); statements.push(snapshotInsert(next));
      return write('customer_segment_run_snapshots', 'run_id', input.runId, ctx, fingerprint, statements, async (stored) => snapshot(stored, run));
    },
    async appendProgress(input) {
      const ctx = context(input, ['runId', 'expectedRevision', 'cursor', 'limit']);
      segmentOpaqueId(input.runId, 'runId'); segmentInteger(input.expectedRevision, 1, 'expectedRevision');
      const cursor = segmentOpaqueId(input.cursor, 'cursor');
      const limit = segmentInteger(input.limit, 1, 'limit');
      if (limit > MAX_CUSTOMER_SEGMENT_CANDIDATES) invalid('Lote fuera del límite técnico.');
      input = Object.freeze({ ...ctx, runId: input.runId, expectedRevision: input.expectedRevision, cursor, limit });
      const { run, row } = await base(input.runId, input.expectedRevision);
      if (row.state !== 'running' || row.cursor !== cursor) conflict();
      const def = await readDefinition(String(run.segment_id), Number(run.definition_version));
      if (!def) invalid('Definición de ejecución ausente.');
      const rows = (await db.prepare('SELECT * FROM customer_segment_results WHERE run_id=? AND position>? ORDER BY position LIMIT ?')
        .bind(input.runId, row.last_position, limit).all<Row>()).results;
      if (rows.length === 0) conflict();
      const evaluations = [];
      for (const [index, result] of rows.entries()) {
        if (result.position !== Number(row.last_position) + index + 1) invalid('Población persistida discontinua.');
        const facts = await resultFacts(result);
        evaluations.push({ customerProfileId: String(result.customer_profile_id), position: Number(result.position),
          facts, ...evaluateCustomerSegment(def.segment, facts) });
      }
      const fingerprint = await segmentFingerprint({ operation: 'appendProgress', ...ctx, runId: input.runId, expectedRevision: input.expectedRevision, cursor, limit, evaluations });
      const previous = await replay('customer_segment_run_snapshots', 'run_id', input.runId, ctx.idempotencyKey, fingerprint);
      if (previous) return { outcome: 'replayed', value: snapshot(previous, run) };
      const revision = Number(row.revision) + 1;
      const processed = Number(row.processed_candidates) + evaluations.length;
      const next = nextSnapshot(row, ctx, fingerprint, { processed_candidates: processed, last_position: processed,
        matched_customers: Number(row.matched_customers) + evaluations.filter((item) => item.matches).length,
        cursor: processed < Number(row.total_candidates) ? `segment-cursor:${newId()}` : null });
      snapshot(next, run);
      const statements = evaluations.map((item) => db.prepare(`UPDATE customer_segment_results SET matches=?,missing_facts_json=?,evaluated_revision=?
        WHERE run_id=? AND customer_profile_id=? AND evaluated_revision IS NULL`)
        .bind(item.matches ? 1 : 0, canonicalSegmentJson(item.missingFacts), revision, input.runId, item.customerProfileId));
      statements.push(snapshotInsert(next));
      return write('customer_segment_run_snapshots', 'run_id', input.runId, ctx, fingerprint, statements, async (stored) => snapshot(stored, run));
    },
    completeRun: (input) => finish(input, 'completed'),
    failRun: (input) => finish(input, 'failed'),
    async publish(input) {
      const ctx = context(input, ['segmentId', 'runId', 'expectedPublicationVersion']);
      const segmentId = name(input.segmentId, 'segmentId'); segmentOpaqueId(input.runId, 'runId');
      const expected = segmentInteger(input.expectedPublicationVersion, 0, 'expectedPublicationVersion');
      segmentInteger(expected + 1, 1, 'publicationVersion');
      input = Object.freeze({ ...ctx, segmentId, runId: input.runId, expectedPublicationVersion: expected });
      const fingerprint = await segmentFingerprint({ operation: 'publish', ...ctx, segmentId, runId: input.runId, expectedPublicationVersion: expected });
      const previous = await replay('customer_segment_publications', 'segment_id', segmentId, ctx.idempotencyKey, fingerprint);
      if (previous) return { outcome: 'replayed', value: publication(previous), current: (await currentPublication(segmentId))! };
      const run = await runRow(input.runId);
      if (!run || run.segment_id !== segmentId) conflict();
      const view = await runView(run);
      if (view.snapshot.state !== 'completed') conflict();
      if (ctx.occurredAt < view.snapshot.finishedAt!) invalid('Publicación anterior a la finalización.');
      const result = await write('customer_segment_publications', 'segment_id', segmentId, ctx, fingerprint,
        [insert('customer_segment_publications', { segment_id: segmentId, publication_version: expected + 1, run_id: input.runId,
          definition_version: view.definitionVersion, generation: view.generation, published_at: ctx.occurredAt, published_by: ctx.actorId,
          idempotency_key: ctx.idempotencyKey, command_fingerprint: fingerprint })], async (stored) => publication(stored));
      return { ...result, current: (await currentPublication(segmentId))! };
    },
    async readRun(runId) { const row = await runRow(runId); return row ? runView(row) : null; },
    async readSnapshots(runId) {
      const run = await runRow(runId); if (!run) return [];
      const rows = (await db.prepare('SELECT * FROM customer_segment_run_snapshots WHERE run_id=? ORDER BY revision').bind(runId).all<Row>()).results;
      if (rows.length) await verifyPopulation(run, rows[rows.length - 1]!);
      return Object.freeze(rows.map((row, index) => {
        if (row.revision !== index + 1) invalid('Historial de revisiones discontinuo.');
        return snapshot(row, run);
      }));
    },
    async readMembership(segmentId, customerProfileId) {
      name(segmentId, 'segmentId'); segmentOpaqueId(customerProfileId, 'customerProfileId');
      // Todas las partes se leen en el mismo corte transaccional.
      const results = await db.batch<Row>([
        db.prepare('SELECT * FROM customer_segment_definitions WHERE segment_id=? ORDER BY definition_version DESC LIMIT 1').bind(segmentId),
        db.prepare('SELECT * FROM customer_segment_publications WHERE segment_id=? ORDER BY publication_version DESC LIMIT 1').bind(segmentId),
        db.prepare('SELECT id,status,merged_into_profile_id,version FROM customer_profiles WHERE id=?').bind(customerProfileId),
        db.prepare(`SELECT r.* FROM customer_segment_results r WHERE r.customer_profile_id=? AND r.run_id=(SELECT run_id FROM customer_segment_publications WHERE segment_id=? ORDER BY publication_version DESC LIMIT 1)`).bind(customerProfileId, segmentId),
        db.prepare(`SELECT s.* FROM customer_segment_run_snapshots s WHERE s.run_id=(SELECT run_id FROM customer_segment_publications WHERE segment_id=? ORDER BY publication_version DESC LIMIT 1) ORDER BY revision DESC LIMIT 1`).bind(segmentId),
        db.prepare(`SELECT r.* FROM customer_segment_runs r WHERE r.run_id=(SELECT run_id FROM customer_segment_publications WHERE segment_id=? ORDER BY publication_version DESC LIMIT 1)`).bind(segmentId),
      ]);
      if (results.length !== 6 || results.some((entry) => !entry.success || !Array.isArray(entry.results))) {
        throw new Error('D1 no confirmó la lectura consistente de pertenencia.');
      }
      const [defRow, publicationRow, profile, result, completed, run] = results.map((entry) => entry.results[0]);
      if (!publicationRow) return { state: 'unpublished' };
      if (!defRow || !completed || !run || completed.state !== 'completed') invalid('Publicación sin ejecución completa.');
      const def = await definition(defRow); const pub = publication(publicationRow);
      snapshot(completed, run);
      if (run.run_id !== pub.runId || run.segment_id !== pub.segmentId || run.definition_version !== pub.definitionVersion || run.generation !== pub.generation) invalid('Identidad de publicación incoherente.');
      await verifyPopulation(run, completed);
      if (pub.definitionVersion !== def.version) return { state: 'stale', reason: 'definition_changed' };
      if (!profile) return { state: 'stale', reason: 'profile_missing' };
      if (profile.status !== 'active' || profile.merged_into_profile_id !== null || (result && profile.version !== result.customer_profile_version)) return { state: 'stale', reason: 'profile_changed' };
      if (!result) return { state: 'not_in_snapshot', publication: pub };
      const evaluated = evaluateCustomerSegment(def.segment, await resultFacts(result));
      if (result.matches !== Number(evaluated.matches) || canonicalSegmentJson(evaluated.missingFacts) !== result.missing_facts_json ||
        !Number.isSafeInteger(result.evaluated_revision) || Number(result.evaluated_revision) > Number(completed.revision)) invalid('Resultado publicado corrupto.');
      return { state: 'evaluated', matches: evaluated.matches, missingFacts: evaluated.missingFacts, publication: pub };
    },
  };
}
