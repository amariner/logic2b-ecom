import type {
  CalculatedCustomerSegment, CustomerSegmentRecalculation, CustomerSegmentTemplate,
} from '../domain/customer-segmentation';
import type { CustomerSegmentFactsSnapshot } from './customer-segmentation-contract';

export type SegmentCommandContext = Readonly<{
  actorId: string;
  idempotencyKey: string;
  occurredAt: string;
}>;
export type SegmentDefinition = Readonly<{
  segmentId: string;
  version: number;
  template: CustomerSegmentTemplate;
  segment: CalculatedCustomerSegment;
  fingerprint: string;
  createdAt: string;
  createdBy: string;
}>;
export type SegmentRunSnapshot = CustomerSegmentRecalculation & Readonly<{
  revision: number;
  lastPosition: number;
  sourceSnapshotRef: string | null;
  sourceSnapshotFingerprint: string | null;
  factsPolicyId: string | null;
  factsPolicyVersion: number | null;
  factsCapturedAt: string | null;
  currency: string | null;
  recordedAt: string;
  actorId: string;
}>;
export type SegmentRun = Readonly<{
  runId: string;
  segmentId: string;
  definitionVersion: number;
  generation: number;
  requestedAt: string;
  requestedBy: string;
  snapshot: SegmentRunSnapshot;
}>;
export type SegmentPublication = Readonly<{
  segmentId: string;
  version: number;
  runId: string;
  definitionVersion: number;
  generation: number;
  publishedAt: string;
  publishedBy: string;
}>;
export type SegmentWrite<T> = Readonly<{ outcome: 'applied' | 'replayed'; value: T }>;
export type SegmentMembership =
  | Readonly<{ state: 'unpublished' }>
  | Readonly<{ state: 'stale'; reason: 'definition_changed' | 'profile_changed' | 'profile_missing' }>
  | Readonly<{ state: 'not_in_snapshot'; publication: SegmentPublication }>
  | Readonly<{ state: 'evaluated'; matches: boolean; missingFacts: readonly string[]; publication: SegmentPublication }>;

export interface CustomerSegmentationRepository {
  appendDefinition(input: SegmentCommandContext & Readonly<{
    segmentId: string; expectedVersion: number; template: CustomerSegmentTemplate;
    parameters: Readonly<Record<string, number>>;
  }>): Promise<SegmentWrite<SegmentDefinition>>;
  requestRun(input: SegmentCommandContext & Readonly<{
    segmentId: string; definitionVersion: number;
  }>): Promise<SegmentWrite<SegmentRun>>;
  startRun(input: SegmentCommandContext & Readonly<{
    runId: string; expectedRevision: number; snapshot: CustomerSegmentFactsSnapshot;
  }>): Promise<SegmentWrite<SegmentRunSnapshot>>;
  appendProgress(input: SegmentCommandContext & Readonly<{
    runId: string; expectedRevision: number; cursor: string; limit: number;
  }>): Promise<SegmentWrite<SegmentRunSnapshot>>;
  completeRun(input: SegmentCommandContext & Readonly<{
    runId: string; expectedRevision: number;
  }>): Promise<SegmentWrite<SegmentRunSnapshot>>;
  failRun(input: SegmentCommandContext & Readonly<{
    runId: string; expectedRevision: number; errorCode: string;
  }>): Promise<SegmentWrite<SegmentRunSnapshot>>;
  publish(input: SegmentCommandContext & Readonly<{
    segmentId: string; runId: string; expectedPublicationVersion: number;
  }>): Promise<SegmentWrite<SegmentPublication> & Readonly<{ current: SegmentPublication }>>;
  readDefinition(segmentId: string, version?: number): Promise<SegmentDefinition | null>;
  readRun(runId: string): Promise<SegmentRun | null>;
  readSnapshots(runId: string): Promise<readonly SegmentRunSnapshot[]>;
  readMembership(segmentId: string, customerProfileId: string): Promise<SegmentMembership>;
}
