import {
  CUSTOMER_SEGMENT_FACTS,
  assertCustomerSegmentRecalculation,
  createCustomerSegmentFacts,
  defineCustomerSegmentTemplate,
  evaluateCustomerSegment,
  instantiateCustomerSegment,
  type CustomerSegmentFacts,
  type CustomerSegmentRecalculationState,
  type CustomerSegmentTemplate,
} from '../domain/customer-segmentation';
import {
  canonicalSegmentJson,
  segmentFingerprint,
} from './customer-segmentation-contract';

type Row = Record<string, string | number | null>;

/** Columnas cerradas: el backup no arrastra campos futuros sin revisar su replay. */
export const CUSTOMER_SEGMENT_BACKUP_COLUMNS = Object.freeze({
  customer_segment_definitions: [
    'segment_id', 'definition_version', 'template_id', 'template_version',
    'template_json', 'parameters_json', 'definition_fingerprint', 'created_at',
    'created_by', 'idempotency_key', 'command_fingerprint',
  ],
  customer_segment_runs: [
    'run_id', 'segment_id', 'definition_version', 'generation', 'requested_at',
    'requested_by', 'idempotency_key', 'command_fingerprint',
  ],
  customer_segment_run_snapshots: [
    'run_id', 'revision', 'state', 'started_at', 'finished_at', 'cursor',
    'total_candidates', 'processed_candidates', 'matched_customers', 'error_code',
    'source_snapshot_ref', 'source_snapshot_fingerprint', 'facts_policy_id',
    'facts_policy_version', 'facts_captured_at', 'currency', 'last_position',
    'recorded_at', 'actor_id', 'idempotency_key', 'command_fingerprint',
  ],
  customer_segment_results: [
    'run_id', 'customer_profile_id', 'position', 'customer_profile_version',
    'facts_json', 'facts_fingerprint', 'matches', 'missing_facts_json', 'evaluated_revision',
  ],
  customer_segment_publications: [
    'segment_id', 'publication_version', 'run_id', 'definition_version', 'generation',
    'published_at', 'published_by', 'idempotency_key', 'command_fingerprint',
  ],
} satisfies Record<string, readonly string[]>);

export type CustomerSegmentBackupTable = keyof typeof CUSTOMER_SEGMENT_BACKUP_COLUMNS;
export const CUSTOMER_SEGMENT_BACKUP_TABLES = Object.freeze(
  Object.keys(CUSTOMER_SEGMENT_BACKUP_COLUMNS) as CustomerSegmentBackupTable[],
);

const INTEGERS = new Set([
  'definition_version', 'template_version', 'generation', 'revision', 'total_candidates',
  'processed_candidates', 'matched_customers', 'facts_policy_version', 'last_position',
  'position', 'customer_profile_version', 'matches', 'evaluated_revision', 'publication_version',
]);
const NULLABLE = new Set([
  'started_at', 'finished_at', 'cursor', 'error_code', 'source_snapshot_ref',
  'source_snapshot_fingerprint', 'facts_policy_id', 'facts_policy_version',
  'facts_captured_at', 'currency', 'matches', 'missing_facts_json', 'evaluated_revision',
]);
const ZERO_ALLOWED = new Set(['total_candidates', 'processed_candidates', 'matched_customers', 'last_position', 'matches']);
const SOURCE_FIELDS = [
  'source_snapshot_ref', 'source_snapshot_fingerprint', 'facts_policy_id',
  'facts_policy_version', 'facts_captured_at', 'currency',
] as const;

function invalid(message: string): never {
  throw new RangeError(`Backup de segmentación inválido: ${message}`);
}

function text(row: Row, field: string): string {
  const value = row[field];
  if (typeof value !== 'string') invalid(`${field} debe ser texto.`);
  return value;
}

function number(row: Row, field: string): number {
  const value = row[field];
  if (typeof value !== 'number') invalid(`${field} debe ser un entero.`);
  return value;
}

function sorted(rows: readonly Row[], field: string): Row[] {
  return [...rows].sort((a, b) => number(a, field) - number(b, field));
}

function parseJson(row: Row, field: string): unknown {
  const raw = text(row, field);
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { invalid(`${field} no contiene JSON.`); }
  if (canonicalSegmentJson(parsed) !== raw) invalid(`${field} no usa serialización canónica.`);
  return parsed;
}

function validateRows(table: CustomerSegmentBackupTable, rows: Row[]): void {
  const columns: readonly string[] = CUSTOMER_SEGMENT_BACKUP_COLUMNS[table];
  for (const row of rows) {
    if (!row || typeof row !== 'object' || Array.isArray(row) ||
      Object.keys(row).length !== columns.length || Object.keys(row).some((key) => !columns.includes(key))) {
      invalid(`${table} contiene columnas desconocidas o ausentes.`);
    }
    for (const field of columns) {
      const value = row[field];
      if (value === null && NULLABLE.has(field)) continue;
      if (INTEGERS.has(field)) {
        if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < (ZERO_ALLOWED.has(field) ? 0 : 1)) {
          invalid(`${table}.${field} no es un entero seguro válido.`);
        }
      } else if (typeof value !== 'string' || value.length === 0 || /[\u0000-\u001f]/.test(value)) {
        invalid(`${table}.${field} no es texto válido.`);
      }
      if (field.endsWith('_fingerprint') && !/^[0-9a-f]{64}$/.test(String(value))) {
        invalid(`${table}.${field} no es una huella SHA-256.`);
      }
      if (field.endsWith('_at') && (typeof value !== 'string' ||
        !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value)) {
        invalid(`${table}.${field} no es una fecha UTC canónica.`);
      }
    }
  }
}

function unique(rows: readonly Row[], key: (row: Row) => string, description: string): void {
  if (new Set(rows.map(key)).size !== rows.length) invalid(`${description} duplicado.`);
}

function consecutive(rows: readonly Row[], field: string): void {
  rows.forEach((row, index) => {
    if (row[field] !== index + 1) invalid(`${field} contiene huecos.`);
  });
}

function literal(value: Row[string] | undefined): string {
  if (value === null || value === undefined) return 'NULL';
  return typeof value === 'number' ? String(value) : `'${value.replaceAll("'", "''")}'`;
}

function insert(table: CustomerSegmentBackupTable, row: Row): string {
  const columns = CUSTOMER_SEGMENT_BACKUP_COLUMNS[table];
  return `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns.map((column) => literal(row[column])).join(', ')});`;
}

/**
 * Reproduce el historial bajo los triggers de 0045, sin desactivarlos. Las
 * sentencias forman parte de la misma restauración transaccional que el resto
 * del backup: los UPDATE de un lote preceden a su fotografía confirmadora.
 */
export function buildCustomerSegmentRestoreSql(tables: Record<string, Row[]>): string[] {
  const present = CUSTOMER_SEGMENT_BACKUP_TABLES.filter((table) => Object.hasOwn(tables, table));
  if (present.length === 0) return [];
  if (present.length !== CUSTOMER_SEGMENT_BACKUP_TABLES.length) invalid('faltan tablas del corte consistente.');
  for (const table of CUSTOMER_SEGMENT_BACKUP_TABLES) {
    if (!Array.isArray(tables[table])) invalid(`${table} no contiene filas.`);
    validateRows(table, tables[table]!);
  }
  const definitions = tables.customer_segment_definitions!;
  const runs = tables.customer_segment_runs!;
  const snapshots = tables.customer_segment_run_snapshots!;
  const results = tables.customer_segment_results!;
  const publications = tables.customer_segment_publications!;
  unique(definitions, (row) => `${row.segment_id}/${row.definition_version}`, 'definición');
  unique(definitions, (row) => `${row.segment_id}/${row.idempotency_key}`, 'idempotencia de definición');
  unique(runs, (row) => text(row, 'run_id'), 'ejecución');
  unique(runs, (row) => `${row.segment_id}/${row.idempotency_key}`, 'idempotencia de solicitud');
  unique(snapshots, (row) => `${row.run_id}/${row.revision}`, 'revisión');
  unique(snapshots, (row) => `${row.run_id}/${row.idempotency_key}`, 'idempotencia de fotografía');
  unique(snapshots.filter((row) => row.cursor !== null), (row) => text(row, 'cursor'), 'cursor');
  unique(results, (row) => `${row.run_id}/${row.customer_profile_id}`, 'candidato');
  unique(publications, (row) => `${row.segment_id}/${row.publication_version}`, 'publicación');
  unique(publications, (row) => `${row.segment_id}/${row.idempotency_key}`, 'idempotencia de publicación');
  const byDefinition = new Map(definitions.map((row) => [`${row.segment_id}/${row.definition_version}`, row]));
  const byRun = new Map(runs.map((row) => [text(row, 'run_id'), row]));
  const profiles = tables.customer_profiles ? new Set(tables.customer_profiles.map((row) => row.id)) : null;
  for (const row of runs) {
    if (!byDefinition.has(`${row.segment_id}/${row.definition_version}`)) invalid('ejecución sin definición.');
  }
  for (const row of [...snapshots, ...results, ...publications]) {
    if (!byRun.has(text(row, 'run_id'))) invalid('evidencia sin ejecución.');
  }
  if (profiles && results.some((row) => !profiles.has(row.customer_profile_id))) invalid('candidato sin perfil histórico.');
  const templates = new Map<string, string>();
  const sourceFingerprints = new Map<string, string>();
  const sql: string[] = [];
  for (const segmentId of [...new Set(definitions.map((row) => text(row, 'segment_id')))].sort()) {
    const segmentDefinitions = sorted(definitions.filter((row) => row.segment_id === segmentId), 'definition_version');
    const segmentRuns = sorted(runs.filter((row) => row.segment_id === segmentId), 'generation');
    const segmentPublications = sorted(publications.filter((row) => row.segment_id === segmentId), 'publication_version');
    consecutive(segmentDefinitions, 'definition_version');
    consecutive(segmentRuns, 'generation');
    consecutive(segmentPublications, 'publication_version');
    for (const [rows, field] of [[segmentDefinitions, 'created_at'], [segmentPublications, 'published_at']] as const) {
      rows.forEach((row, index) => {
        if (index > 0 && text(row, field) < text(rows[index - 1]!, field)) invalid('versiones fuera de orden temporal.');
      });
    }
    for (const rows of [segmentRuns, segmentPublications]) {
      let previousDefinition = 0;
      for (const row of rows) {
        if (number(row, 'definition_version') < previousDefinition) invalid('las definiciones retroceden en el historial.');
        previousDefinition = number(row, 'definition_version');
      }
    }
    let publishedGeneration = 0;
    for (const publication of segmentPublications) {
      const run = byRun.get(text(publication, 'run_id'))!;
      if (run.segment_id !== segmentId || run.definition_version !== publication.definition_version ||
        run.generation !== publication.generation || number(publication, 'generation') <= publishedGeneration) {
        invalid('publicación incoherente con la ejecución o su generación.');
      }
      publishedGeneration = number(publication, 'generation');
    }
    for (const definition of segmentDefinitions) {
      const template = defineCustomerSegmentTemplate(parseJson(definition, 'template_json') as CustomerSegmentTemplate);
      if (template.id !== definition.template_id || template.version !== definition.template_version) invalid('template incoherente.');
      const templateKey = `${template.id}/${template.version}`;
      const previousTemplate = templates.get(templateKey);
      if (previousTemplate !== undefined && previousTemplate !== definition.template_json) invalid('template reutilizado con otro contenido.');
      templates.set(templateKey, text(definition, 'template_json'));
      const segment = instantiateCustomerSegment(template, parseJson(definition, 'parameters_json') as Record<string, number>);
      sql.push(insert('customer_segment_definitions', definition));
      for (const run of segmentRuns.filter((row) => row.definition_version === definition.definition_version)) {
        if (text(run, 'requested_at') < text(definition, 'created_at')) invalid('solicitud anterior a su definición.');
        const runSnapshots = sorted(snapshots.filter((row) => row.run_id === run.run_id), 'revision');
        const runResults = sorted(results.filter((row) => row.run_id === run.run_id), 'position');
        if (runSnapshots.length === 0 || runSnapshots[0]!.state !== 'requested') invalid('ejecución sin fotografía inicial.');
        consecutive(runSnapshots, 'revision');
        consecutive(runResults, 'position');
        for (const result of runResults) {
          const parsedFacts = parseJson(result, 'facts_json') as CustomerSegmentFacts;
          if (parsedFacts === null || typeof parsedFacts !== 'object' ||
            Object.keys(parsedFacts).length !== CUSTOMER_SEGMENT_FACTS.length ||
            CUSTOMER_SEGMENT_FACTS.some((fact) => !Object.hasOwn(parsedFacts, fact))) invalid('hechos incompletos.');
          const facts = createCustomerSegmentFacts(parsedFacts);
          const pending = result.evaluated_revision === null;
          if (pending !== (result.matches === null) || pending !== (result.missing_facts_json === null)) invalid('resultado parcialmente evaluado.');
          if (!pending) {
            const evaluation = evaluateCustomerSegment(segment, facts);
            if (result.matches !== Number(evaluation.matches) ||
              canonicalSegmentJson(evaluation.missingFacts) !== text(result, 'missing_facts_json')) invalid('resultado distinto del evaluador.');
            if (!runSnapshots.some((snapshot) => snapshot.revision === result.evaluated_revision && snapshot.state === 'running') ||
              number(result, 'evaluated_revision') <= 2) invalid('resultado sin fotografía de progreso.');
          }
        }
        let prior: Row | undefined;
        let source: Row | undefined;
        for (const snapshot of runSnapshots) {
          assertCustomerSegmentRecalculation({
            segmentId, definitionVersion: number(run, 'definition_version'),
            state: text(snapshot, 'state') as CustomerSegmentRecalculationState,
            requestedAt: text(run, 'requested_at'), startedAt: snapshot.started_at as string | null,
            finishedAt: snapshot.finished_at as string | null, cursor: snapshot.cursor as string | null,
            totalCandidates: number(snapshot, 'total_candidates'),
            processedCandidates: number(snapshot, 'processed_candidates'),
            matchedCustomers: number(snapshot, 'matched_customers'), errorCode: snapshot.error_code as string | null,
          });
          if (text(snapshot, 'recorded_at') < (prior ? text(prior, 'recorded_at') : text(run, 'requested_at'))) invalid('fotografías fuera de orden temporal.');
          if (prior && (prior.state === 'completed' || prior.state === 'failed' || snapshot.state === 'requested')) invalid('transición de estado inválida.');
          if (prior?.state === 'requested' && snapshot.state !== 'running' && snapshot.state !== 'failed') invalid('inicio ausente.');
          if (prior?.state === 'requested' && snapshot.state === 'failed' && snapshot.started_at !== null) invalid('fallo inicial con inicio inventado.');
          if (snapshot.state === 'running' && ((snapshot.cursor === null) !== (snapshot.processed_candidates === snapshot.total_candidates))) invalid('cursor incoherente con el progreso.');
          if (prior?.state === 'running' && snapshot.state === 'running' && number(snapshot, 'processed_candidates') <= number(prior, 'processed_candidates')) invalid('fotografía sin progreso.');
          if (prior?.state === 'running' && (snapshot.state === 'completed' || snapshot.state === 'failed') &&
            (snapshot.processed_candidates !== prior.processed_candidates || snapshot.matched_customers !== prior.matched_customers)) invalid('cierre con progreso no confirmado.');
          for (const field of ['started_at', 'finished_at']) {
            if (snapshot[field] !== null && text(snapshot, field) > text(snapshot, 'recorded_at')) invalid('evidencia registrada antes del evento.');
          }
          if (snapshot.started_at === null) {
            if (SOURCE_FIELDS.some((field) => snapshot[field] !== null) || number(snapshot, 'last_position') !== 0) invalid('fuente antes del inicio.');
          } else {
            if (SOURCE_FIELDS.some((field) => snapshot[field] === null)) invalid('fuente incompleta.');
            if (!/^[A-Z]{3}$/.test(text(snapshot, 'currency'))) invalid('moneda inválida.');
            if (text(snapshot, 'facts_captured_at') > text(snapshot, 'started_at')) invalid('captura posterior al inicio.');
            if (source && [...SOURCE_FIELDS, 'started_at', 'total_candidates'].some((field) => source![field] !== snapshot[field])) invalid('fuente modificada.');
            source ??= snapshot;
            const ref = text(snapshot, 'source_snapshot_ref');
            const fingerprint = text(snapshot, 'source_snapshot_fingerprint');
            if (sourceFingerprints.has(ref) && sourceFingerprints.get(ref) !== fingerprint) invalid('referencia de fuente reutilizada.');
            sourceFingerprints.set(ref, fingerprint);
            if (snapshot.total_candidates !== runResults.length) invalid('población incompleta.');
          }
          const evaluated = runResults.filter((result) => result.evaluated_revision !== null &&
            number(result, 'evaluated_revision') <= number(snapshot, 'revision'));
          consecutive(evaluated, 'position');
          if (snapshot.processed_candidates !== evaluated.length || snapshot.last_position !== evaluated.length ||
            snapshot.matched_customers !== evaluated.filter((row) => row.matches === 1).length) invalid('contadores distintos de los resultados.');
          prior = snapshot;
        }
        if (!source && runResults.length > 0) invalid('candidatos sin inicio.');
        sql.push(insert('customer_segment_runs', run));
        sql.push(insert('customer_segment_run_snapshots', runSnapshots[0]!));
        for (const result of runResults) {
          sql.push(insert('customer_segment_results', { ...result, matches: null, missing_facts_json: null, evaluated_revision: null }));
        }
        for (const snapshot of runSnapshots.slice(1)) {
          for (const result of runResults.filter((row) => row.evaluated_revision === snapshot.revision)) {
            sql.push(`UPDATE customer_segment_results SET matches = ${literal(result.matches)}, missing_facts_json = ${literal(result.missing_facts_json)}, evaluated_revision = ${literal(result.evaluated_revision)} WHERE run_id = ${literal(result.run_id)} AND customer_profile_id = ${literal(result.customer_profile_id)} AND evaluated_revision IS NULL;`);
          }
          sql.push(insert('customer_segment_run_snapshots', snapshot));
        }
      }
      for (const publication of segmentPublications.filter((row) => row.definition_version === definition.definition_version)) {
        const last = sorted(snapshots.filter((row) => row.run_id === publication.run_id), 'revision').at(-1);
        if (last?.state !== 'completed' || text(publication, 'published_at') < text(last, 'finished_at')) invalid('publicación sin ejecución completada.');
        sql.push(insert('customer_segment_publications', publication));
      }
    }
  }
  if (publications.some((row) => !byDefinition.has(`${row.segment_id}/${row.definition_version}`))) invalid('publicación sin definición.');
  return sql;
}

/** Verifica el contenido criptográfico del corte ya validado antes de exportar. */
export async function assertCustomerSegmentBackupFingerprints(tables: Record<string, Row[]>): Promise<void> {
  for (const definition of tables.customer_segment_definitions ?? []) {
    const template = defineCustomerSegmentTemplate(parseJson(definition, 'template_json') as CustomerSegmentTemplate);
    const segment = instantiateCustomerSegment(template, parseJson(definition, 'parameters_json') as Record<string, number>);
    if (await segmentFingerprint({ template, parameters: segment.parameters }) !== definition.definition_fingerprint) {
      invalid('la huella de definición no acredita su contenido.');
    }
  }
  for (const result of tables.customer_segment_results ?? []) {
    if (await segmentFingerprint(createCustomerSegmentFacts(parseJson(result, 'facts_json') as CustomerSegmentFacts)) !== result.facts_fingerprint) {
      invalid('la huella de hechos no acredita su contenido.');
    }
  }
  for (const run of tables.customer_segment_runs ?? []) {
    const source = (tables.customer_segment_run_snapshots ?? []).find((row) => row.run_id === run.run_id && row.started_at !== null);
    if (!source) continue;
    const candidates = sorted((tables.customer_segment_results ?? []).filter((row) => row.run_id === run.run_id), 'position')
      .map((row) => ({
        customerProfileId: text(row, 'customer_profile_id'),
        customerProfileVersion: number(row, 'customer_profile_version'),
        facts: createCustomerSegmentFacts(parseJson(row, 'facts_json') as CustomerSegmentFacts),
      }));
    const fingerprint = await segmentFingerprint({
      ref: source.source_snapshot_ref, policyId: source.facts_policy_id,
      policyVersion: source.facts_policy_version, capturedAt: source.facts_captured_at,
      currency: source.currency, candidates,
    });
    if (fingerprint !== source.source_snapshot_fingerprint) invalid('la huella del conjunto no acredita su población y metadatos.');
  }
}
