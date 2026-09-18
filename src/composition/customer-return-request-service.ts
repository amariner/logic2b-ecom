import { planReturnRequest, RETURN_POLICY, RETURN_REASONS, type ReturnReason, type ReturnRequestLineDraft } from '../modules/fulfillment';
import type {
  CustomerReturnRequestOutcome,
  CustomerReturnRequestRepository,
} from '../modules/customers/application/customer-return-request-repository';

export interface CustomerReturnRequestService {
  listOwned(ownerProfileId: string): ReturnType<CustomerReturnRequestRepository['listOwned']>;
  readOwned(ownerProfileId: string, publicRef: string): ReturnType<CustomerReturnRequestRepository['readOwned']>;
  listEligibilityOwned(ownerProfileId: string, observedAt: string): ReturnType<CustomerReturnRequestRepository['listEligibilityOwned']>;
  createOwned(input: Readonly<{
    orderPublicRef: string;
    ownerProfileId: string;
    expectedOwnershipVersion: number;
    reason: ReturnReason;
    lines: readonly ReturnRequestLineDraft[];
    idempotencyKey: string;
    occurredAt: string;
  }>): Promise<CustomerReturnRequestOutcome>;
}

function assertKey(value: string): void {
  if (value.trim() !== value || value.length < 8 || value.length > 200 || /[\u0000-\u001f\u007f]/u.test(value)) {
    throw new RangeError('Idempotency-Key invalida.');
  }
}

async function fingerprint(value: unknown): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(value)));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function createCustomerReturnRequestService(
  repository: CustomerReturnRequestRepository,
  idFactory: () => string = () => crypto.randomUUID().toLowerCase(),
): CustomerReturnRequestService {
  return Object.freeze({
    listOwned: repository.listOwned,
    readOwned: repository.readOwned,
    listEligibilityOwned: repository.listEligibilityOwned,
    async createOwned(input: Parameters<CustomerReturnRequestService['createOwned']>[0]) {
      assertKey(input.idempotencyKey);
      if (!RETURN_REASONS.includes(input.reason) || !Number.isSafeInteger(input.expectedOwnershipVersion) || input.expectedOwnershipVersion < 1) {
        throw new RangeError('Solicitud de devolucion invalida.');
      }
      if (input.lines.length < 1 || input.lines.length > RETURN_POLICY.maxLines ||
          !Number.isFinite(Date.parse(input.occurredAt)) ||
          input.lines.some((line) => !Number.isSafeInteger(line.orderItemId) || line.orderItemId < 1 ||
            !Number.isSafeInteger(line.quantity) || line.quantity < 1) ||
          new Set(input.lines.map((line) => line.orderItemId)).size !== input.lines.length) {
        throw new RangeError('Lineas de solicitud invalidas.');
      }
      const canonicalLines = input.lines.toSorted((left, right) => left.orderItemId - right.orderItemId);
      const payloadFingerprint = await fingerprint(Object.freeze({
        v: 1,
        orderPublicRef: input.orderPublicRef,
        ownerProfileId: input.ownerProfileId,
        expectedOwnershipVersion: input.expectedOwnershipVersion,
        reason: input.reason,
        lines: canonicalLines.map((line) => ({ orderItemId: line.orderItemId, quantity: line.quantity })),
      }));
      const replayInput = { ...input, payloadFingerprint };
      const existing = await repository.replayOwned(replayInput);
      if (existing !== null) return existing;
      const eligibility = await repository.eligibilityOwned(input);
      let plannedLines: ReturnType<typeof planReturnRequest>;
      try {
        plannedLines = planReturnRequest({ now: input.occurredAt, lines: canonicalLines, eligibility });
      } catch (error) {
        if (!(error instanceof RangeError)) throw error;
        // Otra petición puede consumir las unidades entre el replay y la lectura.
        const raced = await repository.replayOwned(replayInput);
        if (raced !== null) return raced;
        throw error;
      }
      const token = idFactory().replaceAll('-', '');
      return repository.createOwned({
        ...input,
        id: `rma_customer_${token}`,
        returnNumber: `RMA-C-${token.slice(-16).toUpperCase()}`,
        lineIds: plannedLines.map((_, index) => `rml_customer_${token}_${index + 1}`),
        plannedLines,
        payloadFingerprint,
      });
    },
  });
}
