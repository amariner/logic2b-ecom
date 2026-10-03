import {
  CustomerSegmentationContractError, MAX_CUSTOMER_SEGMENT_CANDIDATES,
  normalizeCustomerSegmentFactsSnapshot, segmentFingerprint, segmentInteger,
  segmentOpaqueId, segmentRecord, segmentTimestamp,
  type CustomerSegmentFactsSnapshot, type CustomerSegmentFactsSource,
} from './customer-segmentation-contract';
import { defineCustomerSegmentFactsPolicy } from './customer-segmentation-facts';
import type {
  CustomerSegmentationRepository, SegmentRun, SegmentRunSnapshot, SegmentWrite,
} from './customer-segmentation-repository';

export type CustomerSegmentAdvance = Readonly<{
  runId: string;
  actorId: string;
  limit: number;
  signal?: AbortSignal;
}>;
export type CustomerSegmentExecutionResult = Readonly<{
  outcome: 'applied' | 'replayed' | 'unchanged' | 'reconciled';
  run: SegmentRun;
}>;
export type CustomerSegmentPublicationCommand = Parameters<CustomerSegmentationRepository['publish']>[0];

function invalid(message: string): never { throw new CustomerSegmentationContractError(message); }
function aborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new DOMException('La ejecución se ha cancelado.', 'AbortError');
}
function isConflict(error: unknown): boolean {
  // El código pertenece al puerto. No se importa infraestructura en aplicación
  // ni se interpretan mensajes SQL o errores de transporte como un conflicto.
  return error instanceof Error && Object.getOwnPropertyDescriptor(error, 'code')?.value === 'customer_segmentation_conflict';
}

/** Coordinador interno, sin bucles, publicación implícita ni registro de jobs. */
export function createCustomerSegmentExecution(options: Readonly<{
  repository: CustomerSegmentationRepository;
  source: CustomerSegmentFactsSource;
  policy: unknown;
  now: () => number;
}>) {
  const { repository, source, now } = options;
  const policy = defineCustomerSegmentFactsPolicy(options.policy);
  const policyFingerprint = () => segmentFingerprint(policy);
  function clock(): number {
    const value = now();
    if (typeof value !== 'number' || !Number.isFinite(new Date(value).getTime())) invalid('Reloj de ejecución inválido.');
    return value;
  }
  function commandAt(run: SegmentRun, capturedAt?: string): string {
    const at = new Date(clock()).toISOString();
    segmentTimestamp(at, Date.parse(at), 'occurredAt');
    if (at < run.snapshot.recordedAt || (capturedAt !== undefined && at < capturedAt)) {
      invalid('El reloj precede a la revisión o captura confirmada.');
    }
    return at;
  }
  async function readRun(runId: string, signal?: AbortSignal): Promise<SegmentRun> {
    const run = await repository.readRun(runId);
    aborted(signal);
    if (!run) return invalid('La ejecución solicitada no existe.');
    return run;
  }
  async function assertPolicy(run: SegmentRun): Promise<void> {
    const ref = run.snapshot.sourceSnapshotRef;
    const matched = typeof ref === 'string' ? /^source:([a-f0-9]{64}):([a-f0-9]{64})$/.exec(ref) : null;
    if (!matched || matched[1] !== await policyFingerprint() ||
      run.snapshot.factsPolicyId !== policy.id || run.snapshot.factsPolicyVersion !== policy.version ||
      run.snapshot.currency !== policy.currency) invalid('La política de la ejecución no coincide con la política esperada.');
    // readRun acredita la población persistida y sourceSnapshotFingerprint.
    // El inicio verifica además la huella del contenido completo sin ref.
  }
  async function capturedSnapshot(input: unknown, nowMs: number): Promise<CustomerSegmentFactsSnapshot> {
    const snapshot = normalizeCustomerSegmentFactsSnapshot(input, nowMs);
    const { ref, ...content } = snapshot;
    const expected = `source:${await policyFingerprint()}:${await segmentFingerprint(content)}`;
    if (ref !== expected || snapshot.policyId !== policy.id || snapshot.policyVersion !== policy.version || snapshot.currency !== policy.currency) {
      invalid('La fuente no acredita la política y el contenido esperados.');
    }
    return snapshot;
  }
  async function writeTransition(
    run: SegmentRun,
    operation: 'startRun' | 'appendProgress' | 'completeRun' | 'failRun',
    actorId: string,
    args: Readonly<{ snapshot?: CustomerSegmentFactsSnapshot; cursor?: string; limit?: number; errorCode?: string }>,
    signal?: AbortSignal,
  ): Promise<CustomerSegmentExecutionResult> {
    const payload = Object.freeze({ runId: run.runId, expectedRevision: run.snapshot.revision,
      actorId, occurredAt: commandAt(run, args.snapshot?.capturedAt), ...args });
    const key = `segment-execution:${operation.toLowerCase()}:${await segmentFingerprint({ operation, ...payload })}`;
    const command = Object.freeze({ ...payload, idempotencyKey: key });
    aborted(signal);
    let written: SegmentWrite<SegmentRunSnapshot>;
    try {
      switch (operation) {
        case 'startRun':
          written = await repository.startRun(Object.freeze({ ...command, snapshot: args.snapshot! }));
          break;
        case 'appendProgress':
          written = await repository.appendProgress(Object.freeze({ ...command, cursor: args.cursor!, limit: args.limit! }));
          break;
        case 'completeRun':
          written = await repository.completeRun(command);
          break;
        case 'failRun':
          written = await repository.failRun(Object.freeze({ ...command, errorCode: args.errorCode! }));
          break;
      }
    } catch (error) {
      if (!isConflict(error)) throw error;
      aborted(signal);
      const winner = await readRun(run.runId, signal);
      if (winner.snapshot.state === 'running' || winner.snapshot.state === 'completed') {
        await assertPolicy(winner);
        aborted(signal);
      }
      return Object.freeze({ outcome: 'reconciled', run: winner });
    }
    aborted(signal);
    return Object.freeze({ outcome: written.outcome, run: Object.freeze({ ...run, snapshot: written.value }) });
  }

  return Object.freeze({
    async advance(input: CustomerSegmentAdvance): Promise<CustomerSegmentExecutionResult> {
      const hasSignal = input !== null && typeof input === 'object' && Object.prototype.hasOwnProperty.call(input, 'signal');
      const row = segmentRecord(input, ['runId', 'actorId', 'limit', ...(hasSignal ? ['signal'] : [])], 'advance');
      const runId = segmentOpaqueId(row.runId, 'advance.runId');
      const actorId = segmentOpaqueId(row.actorId, 'advance.actorId');
      const limit = segmentInteger(row.limit, 1, 'advance.limit');
      if (limit > MAX_CUSTOMER_SEGMENT_CANDIDATES) invalid('advance.limit supera el límite técnico.');
      if (row.signal !== undefined && !(row.signal instanceof AbortSignal)) invalid('advance.signal no es una señal de cancelación.');
      const signal = row.signal as AbortSignal | undefined;
      aborted(signal);
      clock();
      const run = await readRun(runId, signal);
      if (run.snapshot.state === 'completed' || run.snapshot.state === 'failed') {
        return Object.freeze({ outcome: 'unchanged', run });
      }
      if (run.snapshot.state === 'running') {
        await assertPolicy(run);
        aborted(signal);
      }
      const currentDefinition = await repository.readDefinition(run.segmentId);
      aborted(signal);
      if (!currentDefinition) return invalid('La definición de la ejecución no existe.');
      if (currentDefinition.version !== run.definitionVersion) {
        return writeTransition(run, 'failRun', actorId, { errorCode: 'definition_superseded' }, signal);
      }
      if (run.snapshot.state === 'requested') {
        let snapshot: CustomerSegmentFactsSnapshot;
        try {
          const captured = await source.capture();
          aborted(signal);
          snapshot = await capturedSnapshot(captured, clock());
          aborted(signal);
        } catch (error) {
          aborted(signal);
          if (error instanceof DOMException && error.name === 'AbortError') throw error;
          return writeTransition(run, 'failRun', actorId, { errorCode: error instanceof CustomerSegmentationContractError
            ? 'facts_capture_invalid' : 'facts_capture_unavailable' }, signal);
        }
        return writeTransition(run, 'startRun', actorId, { snapshot }, signal);
      }
      if (run.snapshot.cursor !== null) {
        return writeTransition(run, 'appendProgress', actorId, { cursor: run.snapshot.cursor, limit }, signal);
      }
      if (run.snapshot.processedCandidates !== run.snapshot.totalCandidates) invalid('La ejecución no acredita el procesamiento completo.');
      return writeTransition(run, 'completeRun', actorId, {}, signal);
    },
    async publish(input: CustomerSegmentPublicationCommand) {
      const row = segmentRecord(input, [
        'segmentId', 'runId', 'expectedPublicationVersion', 'actorId', 'occurredAt', 'idempotencyKey',
      ], 'publish');
      const command = Object.freeze({
        segmentId: segmentOpaqueId(row.segmentId, 'publish.segmentId'),
        runId: segmentOpaqueId(row.runId, 'publish.runId'),
        expectedPublicationVersion: segmentInteger(row.expectedPublicationVersion, 0, 'publish.expectedPublicationVersion'),
        actorId: segmentOpaqueId(row.actorId, 'publish.actorId'),
        occurredAt: segmentTimestamp(row.occurredAt, clock(), 'publish.occurredAt'),
        idempotencyKey: segmentOpaqueId(row.idempotencyKey, 'publish.idempotencyKey'),
      });
      if (command.idempotencyKey.length < 8) invalid('publish.idempotencyKey debe tener al menos ocho caracteres.');
      if (!/^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/.test(command.segmentId)) invalid('publish.segmentId no es canónico.');
      segmentInteger(command.expectedPublicationVersion + 1, 1, 'publish.publicationVersion');
      const run = await readRun(command.runId);
      if (run.segmentId !== command.segmentId || run.snapshot.state !== 'completed') invalid('La publicación exige una ejecución completa del segmento indicado.');
      await assertPolicy(run);
      if (!await repository.readDefinition(run.segmentId)) invalid('La definición de publicación no existe.');
      // El puerto resuelve replay antes del CAS de definición/generación. Así
      // una publicación histórica exacta sigue recuperable tras otra versión;
      // una escritura nueva obsoleta pierde la guarda SQL y nunca la reemplaza.
      return repository.publish(command);
    },
  });
}
