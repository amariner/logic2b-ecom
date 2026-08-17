import type {
  DataRightsCommand,
  DataRightsEvidence,
  DataRightsPlanDecision,
  DataRightsRequestKind,
  DataRightsState,
  DataRightsSubject,
  DataRightsWriteOutcome,
} from '../domain/data-rights';

export interface DataRightsRepository {
  history(requestId: string): Promise<readonly DataRightsEvidence[]>;
  current(requestId: string): Promise<DataRightsState | null>;
  append(command: DataRightsCommand): Promise<DataRightsWriteOutcome>;
}

/** Preview puro por propietario; la ejecución real queda fuera de R5.3a. */
export interface DataRightsOwner {
  readonly ownerId: string;
  readonly supports: Readonly<{
    access: boolean;
    rectification: boolean;
    restriction: boolean;
    erasure: boolean;
  }>;
  preview(input: Readonly<{
    requestId: string;
    subject: DataRightsSubject;
    requestKind: DataRightsRequestKind;
    requestPayloadReference: string | null;
  }>): Promise<DataRightsPlanDecision>;
}
