import type { CustomerSegmentFactsPolicy } from './customer-segmentation-facts';
import type { SegmentCommandContext, SegmentWrite } from './customer-segmentation-repository';

/** Identidad reservada para QA; no registra un consumidor en la plataforma. */
export const CUSTOMER_SEGMENT_STEP_JOB_ID = 'customers.advance-segment';

type SegmentExecutionEvidence = Readonly<{
  createdAt: string;
  createdBy: string;
  idempotencyKey: string;
  commandFingerprint: string;
}>;

export type RegisteredCustomerSegmentFactsPolicy = SegmentExecutionEvidence & Readonly<{
  policy: CustomerSegmentFactsPolicy;
  fingerprint: string;
}>;

export type CustomerSegmentExecutionPlan = SegmentExecutionEvidence & Readonly<{
  runId: string;
  policyId: string;
  policyVersion: number;
  policyFingerprint: string;
  batchSize: number;
}>;

export type CustomerSegmentJobIntent = SegmentExecutionEvidence & Readonly<{
  jobRunId: string;
  runId: string;
  expectedRevision: number;
  scheduledFor: string;
}>;

/** Evidencia durable interna. La cola efímera se recupera solo por petición explícita. */
export interface CustomerSegmentExecutionStore {
  registerPolicy(input: SegmentCommandContext & Readonly<{
    policy: CustomerSegmentFactsPolicy;
  }>): Promise<SegmentWrite<RegisteredCustomerSegmentFactsPolicy>>;
  readPolicy(policyId: string, policyVersion: number): Promise<RegisteredCustomerSegmentFactsPolicy | null>;
  attachPlan(input: SegmentCommandContext & Readonly<{
    runId: string;
    policyId: string;
    policyVersion: number;
    batchSize: number;
  }>): Promise<SegmentWrite<CustomerSegmentExecutionPlan>>;
  readPlan(runId: string): Promise<CustomerSegmentExecutionPlan | null>;
  enqueueStep(input: SegmentCommandContext & Readonly<{
    runId: string;
    expectedRevision: number;
    scheduledFor: string;
  }>): Promise<SegmentWrite<CustomerSegmentJobIntent>>;
  readJobIntent(jobRunId: string): Promise<CustomerSegmentJobIntent | null>;
  /** No altera la intención ni recrea intentos, locks o errores perdidos. */
  recoverStep(input: Readonly<{ jobRunId: string }>): Promise<SegmentWrite<CustomerSegmentJobIntent>>;
}
