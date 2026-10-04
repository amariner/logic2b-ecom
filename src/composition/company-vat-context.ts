import {
  CompanyDirectoryContractError, selectCompanyDirectoryEntry, type CompanyDirectoryEntry,
} from '../modules/companies';
import {
  defineVatIdQuery, evaluateVatIdEvidence, type VatIdEvidenceEvaluation, type VatIdQuery,
} from '../modules/taxes';

type CompanyVatContext = Readonly<{
  directoryRef: CompanyDirectoryEntry['directoryRef'];
  companyId: string;
  companyState: CompanyDirectoryEntry['company']['state'];
}>;

export type CompanyVatEvidenceResult = CompanyVatContext & (
  | Readonly<{ status: 'not_declared'; query: null; evaluation: null }>
  | Readonly<{ status: 'not_checked'; query: VatIdQuery; evaluation: null }>
  | Readonly<{ status: 'evaluated'; query: VatIdQuery; evaluation: VatIdEvidenceEvaluation }>
);

function record(input: unknown, expected: readonly string[]): Record<string, unknown> {
  try {
    if (input === null || typeof input !== 'object' || Array.isArray(input)) throw new Error();
    const prototype = Object.getPrototypeOf(input);
    if (prototype !== Object.prototype && prototype !== null) throw new Error();
    const keys = Reflect.ownKeys(input);
    if (keys.length !== expected.length) throw new Error();
    const copy: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    for (const key of keys) {
      const descriptor = Object.getOwnPropertyDescriptor(input, key)!;
      if (typeof key !== 'string' || !expected.includes(key) || !descriptor.enumerable || !('value' in descriptor)) throw new Error();
      copy[key] = descriptor.value;
    }
    return Object.freeze(copy);
  } catch {
    throw new CompanyDirectoryContractError('invalid_data');
  }
}

/**
 * Evidencia de una declaración VAT, sin conceder autenticación, rol o exención.
 * La identidad de consulta es company.id + país + identificador; una revisión
 * editorial del directorio no invalida esa declaración ni amplía su vigencia.
 * directoryRef conserva la referencia declarada del directorio, sin autenticar al titular de un VAT.
 */
export function evaluateCompanyVatEvidence(input: unknown): CompanyVatEvidenceResult {
  const row = record(input, ['directory', 'companyId', 'assessment']);
  let entry: CompanyDirectoryEntry;
  try {
    entry = selectCompanyDirectoryEntry({ directory: row.directory, companyId: row.companyId });
  } catch (error) {
    if (error instanceof CompanyDirectoryContractError) throw error;
    throw new CompanyDirectoryContractError('invalid_data');
  }
  const context = { directoryRef: entry.directoryRef, companyId: entry.company.id, companyState: entry.company.state };
  if (entry.company.vatId === null) {
    if (row.assessment !== null) throw new CompanyDirectoryContractError('vat_declaration_missing');
    return Object.freeze({ ...context, status: 'not_declared', query: null, evaluation: null });
  }
  let query: VatIdQuery;
  try {
    query = defineVatIdQuery({ schemaVersion: 1, id: entry.company.id,
      countryCode: entry.company.vatId.countryCode, identifier: entry.company.vatId.identifier });
  } catch {
    throw new CompanyDirectoryContractError('vat_evidence_invalid');
  }
  if (row.assessment === null) return Object.freeze({ ...context, status: 'not_checked', query, evaluation: null });
  const assessment = record(row.assessment, ['expectedAdapterId', 'at', 'response']);
  try {
    const evaluation = evaluateVatIdEvidence({ expectedAdapterId: assessment.expectedAdapterId,
      query, at: assessment.at, response: assessment.response });
    return Object.freeze({ ...context, status: 'evaluated', query, evaluation });
  } catch {
    // No propaga mensajes, causas ni valores del contrato fiscal o de entradas hostiles.
    throw new CompanyDirectoryContractError('vat_evidence_invalid');
  }
}
