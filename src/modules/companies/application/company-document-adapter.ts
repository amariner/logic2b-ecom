import type { CompanyDocumentResponse } from '../domain/company-document-evidence';

/** Lookup de evidencia sintética inyectada; no consulta documentos ni proveedores. */
export interface CompanyDocumentAdapter {
  readonly source: 'fixture';
  readonly adapterId: string;
  read(request: unknown): CompanyDocumentResponse;
}
