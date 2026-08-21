import type {
  CustomerOwnedWritePrecondition,
  CustomerResourceAccessDecision,
  CustomerResourceAccessRequest,
  CustomerResourceOwnership,
  CustomerResourceTarget,
} from '../domain/resource-ownership';

/**
 * Resuelve la asociación canónica en servidor. Nunca busca por email, número
 * de pedido, dirección ni otro dato que el cliente pueda usar como prueba.
 */
export interface CustomerResourceOwnershipReader {
  resolve(target: CustomerResourceTarget): Promise<CustomerResourceOwnership | null>;
}

export type CustomerOrderAccessView = Readonly<{
  publicRef: string;
  orderNumber: string;
  status: string;
  totalCents: number;
  currency: string;
  createdAt: string;
  updatedAt: string;
  tracking: Readonly<{ carrier: string; number: string }> | null;
}>;

/**
 * Lee el DTO mínimo solo si owner y versión siguen siendo los autorizados.
 * La precondición forma parte del SQL para que una reasignación concurrente
 * convierta la lectura en ausencia, nunca en una fuga al owner anterior.
 */
export interface CustomerOwnedOrderReader {
  readOwned(input: Readonly<{
    target: CustomerResourceTarget;
    ownerProfileId: string;
    expectedOwnershipVersion: number;
  }>): Promise<CustomerOrderAccessView | null>;
}

export type CustomerOwnedMutationOutcome<TResult> =
  | Readonly<{ outcome: 'applied' | 'replayed'; result: TResult }>
  | Readonly<{ outcome: 'denied' | 'ownership_changed'; result: null }>;

/**
 * Puerto que deberán implementar CUS-005/CUS-006 para mutar. La comprobación
 * de owner/version y la escritura ocurren en una única transacción; hacer
 * `resolve` y luego escribir queda fuera del contrato por riesgo TOCTOU.
 */
export interface CustomerOwnedResourceWriter<TCommand, TResult> {
  executeOwned(input: Readonly<{
    command: TCommand;
    precondition: CustomerOwnedWritePrecondition;
    idempotencyKey: string;
    occurredAt: string;
  }>): Promise<CustomerOwnedMutationOutcome<TResult>>;
}

/** Auditoría tipada y sin PII, bearer material ni texto libre. */
export interface CustomerResourceAccessAuditWriter {
  record(input: Readonly<{
    auditId: string;
    correlationId: string;
    sessionId: string;
    profileId: string;
    decision: CustomerResourceAccessDecision;
    occurredAt: string;
  }>): Promise<'recorded' | 'replayed'>;
}

/** Composición futura: sesión activa + policy/gates + owner canónico. */
export interface CustomerResourceAuthorizer {
  authorize(request: Omit<CustomerResourceAccessRequest, 'ownership'>): Promise<CustomerResourceAccessDecision>;
}
