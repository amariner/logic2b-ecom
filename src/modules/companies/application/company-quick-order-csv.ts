import { defineCompanyQuickOrderList, type CompanyQuickOrderCatalogRef, type CompanyQuickOrderList,
  type CompanyQuickOrderListLine } from '../domain/company-quick-order';
import { isCompanyQuickOrderSku } from '../domain/company-quick-order-sku';

export const COMPANY_QUICK_ORDER_CSV_LIMITS = /* @__PURE__ */ Object.freeze({
  textUtf16Units: 65536, textUtf8Bytes: 65536, records: 101, dataRows: 100,
  fieldsPerRecord: 32, fieldUtf16Units: 65536, diagnostics: 200,
});
const PROFILE = 'company-quick-order-csv-v1';
export type CompanyQuickOrderCsvPosition = Readonly<{ offset: number; line: number; column: number }>;
export type CompanyQuickOrderCsvRange = Readonly<{ start: CompanyQuickOrderCsvPosition; end: CompanyQuickOrderCsvPosition }>;
/** El rango conserva comillas/escapes originales; value contiene únicamente su decodificación literal. */
export type CompanyQuickOrderCsvField = Readonly<{ value: string; range: CompanyQuickOrderCsvRange }>;
export type CompanyQuickOrderCsvRecord = Readonly<{
  recordNumber: number; range: CompanyQuickOrderCsvRange; fields: readonly CompanyQuickOrderCsvField[];
}>;
export type CompanyQuickOrderCsvRow = Readonly<{ position: number; lineId: string; record: CompanyQuickOrderCsvRecord }>;
export type CompanyQuickOrderCsvMetadata = Readonly<{ id: string; version: number; catalogRef: CompanyQuickOrderCatalogRef }>;
export type CompanyQuickOrderCsvTextInfo = Readonly<{ utf16Length: number; utf8Bytes: number | null; leadingBom: boolean }>;
type DiagnosticLocation = Readonly<{
  at: CompanyQuickOrderCsvPosition | null; recordNumber: number | null; fieldNumber: number | null;
}>;
export type CompanyQuickOrderCsvDiagnostic = DiagnosticLocation & (
  | Readonly<{ category: 'limit'; code: 'text_utf16_limit' | 'text_utf8_limit' | 'record_limit' | 'column_limit' }>
  | Readonly<{ category: 'syntax'; code: 'invalid_utf16' | 'bare_cr' | 'unexpected_quote' | 'unexpected_after_quote' | 'unclosed_quote' }>
  | Readonly<{ category: 'header'; code: 'header_missing' | 'header_mismatch' }>
  | Readonly<{ category: 'row'; code: 'column_count' }>
  | Readonly<{ category: 'field'; code: 'invalid_sku' | 'invalid_quantity' | 'quantity_out_of_range' }>
);
type ResultBase = Readonly<{
  source: 'fixture'; profile: typeof PROFILE; metadata: CompanyQuickOrderCsvMetadata;
  textInfo: CompanyQuickOrderCsvTextInfo; rows: readonly CompanyQuickOrderCsvRow[];
  diagnostics: readonly CompanyQuickOrderCsvDiagnostic[];
}>;
/** Parsed acredita solo una intención íntegra de este perfil, sin resolver identidad ni autorizar un pedido. */
export type CompanyQuickOrderCsvResult = ResultBase & (
  | Readonly<{ outcome: 'parsed'; header: CompanyQuickOrderCsvRecord; list: CompanyQuickOrderList }>
  | Readonly<{ outcome: 'invalid'; header: CompanyQuickOrderCsvRecord | null; list: null }>
);
export type CompanyQuickOrderCsvContractReason = 'invalid_data' | 'normalization_failure';
const ERROR_MESSAGES: Readonly<Record<CompanyQuickOrderCsvContractReason, string>> = /* @__PURE__ */ Object.freeze({
  invalid_data: 'Los datos no cumplen el contrato de entrada CSV de ejemplo.',
  normalization_failure: 'La entrada no se pudo transformar en una lista estructurada de ejemplo.',
});
export class CompanyQuickOrderCsvContractError extends Error {
  readonly code = 'company_quick_order_csv_contract_invalid';
  readonly reason: CompanyQuickOrderCsvContractReason;
  constructor(reason: CompanyQuickOrderCsvContractReason) {
    const safeReason = typeof reason === 'string' && Object.hasOwn(ERROR_MESSAGES, reason) ? reason : 'invalid_data';
    super(ERROR_MESSAGES[safeReason]); this.name = 'CompanyQuickOrderCsvContractError'; this.reason = safeReason;
  }
}
function invalid(reason: CompanyQuickOrderCsvContractReason = 'invalid_data'): never {
  throw new CompanyQuickOrderCsvContractError(reason);
}
function boundary<T>(operation: () => T): T {
  try { return operation(); }
  catch (error) {
    let reason: CompanyQuickOrderCsvContractReason = 'invalid_data';
    try {
      if (error instanceof CompanyQuickOrderCsvContractError) {
        const descriptor = Object.getOwnPropertyDescriptor(error, 'reason');
        if (descriptor && 'value' in descriptor && typeof descriptor.value === 'string' && Object.hasOwn(ERROR_MESSAGES, descriptor.value)) {
          reason = descriptor.value as CompanyQuickOrderCsvContractReason;
        }
      }
    } catch { /* No propagar causa, mensajes ni trampas de errores externos. */ }
    throw new CompanyQuickOrderCsvContractError(reason);
  }
}
function record(input: unknown, keys: readonly string[]): Readonly<Record<string, unknown>> {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) return invalid();
  const prototype = Object.getPrototypeOf(input);
  if (prototype !== Object.prototype && prototype !== null) return invalid();
  const actual = Reflect.ownKeys(input);
  if (actual.length !== keys.length) return invalid();
  const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of actual) {
    const descriptor = Object.getOwnPropertyDescriptor(input, key);
    if (typeof key !== 'string' || !keys.includes(key) || !descriptor?.enumerable || !('value' in descriptor)) return invalid();
    result[key] = descriptor.value;
  }
  return Object.freeze(result);
}
function position(offset: number, line: number, column: number): CompanyQuickOrderCsvPosition {
  return Object.freeze({ offset, line, column });
}
function range(start: CompanyQuickOrderCsvPosition, end: CompanyQuickOrderCsvPosition): CompanyQuickOrderCsvRange {
  return Object.freeze({ start, end });
}

/** Antes de UTF-8 se comprueba UTF-16; no reemplazar surrogates aislados por U+FFFD. */
function measureText(text: string): Readonly<{ utf8Bytes: number | null; invalidAt: CompanyQuickOrderCsvPosition | null }> {
  let offset = 0; let line = 1; let column = 1; let bytes = 0;
  while (offset < text.length) {
    const code = text.charCodeAt(offset);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = text.charCodeAt(offset + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return { utf8Bytes: null, invalidAt: position(offset, line, column) };
      bytes += 4; offset += 2; column += 2;
    } else if (code >= 0xdc00 && code <= 0xdfff) return { utf8Bytes: null, invalidAt: position(offset, line, column) };
    else if (code === 13 && text.charCodeAt(offset + 1) === 10) { bytes += 2; offset += 2; line++; column = 1; }
    else if (code === 10) { bytes++; offset++; line++; column = 1; }
    else { bytes += code < 0x80 ? 1 : code < 0x800 ? 2 : 3; offset++; column++; }
  }
  return { utf8Bytes: bytes, invalidAt: null };
}
type ScanResult = Readonly<{
  records: readonly CompanyQuickOrderCsvRecord[]; diagnostic: CompanyQuickOrderCsvDiagnostic | null;
  end: CompanyQuickOrderCsvPosition;
}>;
function scan(text: string, leadingBom: boolean): ScanResult {
  let offset = leadingBom ? 1 : 0; let line = 1; let column = offset + 1;
  const records: CompanyQuickOrderCsvRecord[] = [];
  const here = () => position(offset, line, column);
  const advance = () => {
    if (text[offset] === '\r' && text[offset + 1] === '\n') { offset += 2; line++; column = 1; }
    else if (text[offset] === '\n') { offset++; line++; column = 1; }
    else { offset++; column++; }
  };
  const failure = (diagnostic: CompanyQuickOrderCsvDiagnostic): ScanResult => ({
    records: Object.freeze([]), diagnostic: Object.freeze(diagnostic), end: here(),
  });
  while (offset < text.length) {
    const recordNumber = records.length + 1;
    if (recordNumber > COMPANY_QUICK_ORDER_CSV_LIMITS.records) return failure({
      category: 'limit', code: 'record_limit', at: here(), recordNumber, fieldNumber: null,
    });
    const start = here(); const fields: CompanyQuickOrderCsvField[] = [];
    while (true) {
      const fieldNumber = fields.length + 1;
      if (fieldNumber > COMPANY_QUICK_ORDER_CSV_LIMITS.fieldsPerRecord) return failure({
        category: 'limit', code: 'column_limit', at: here(), recordNumber, fieldNumber,
      });
      const fieldStart = here(); let value = '';
      if (text[offset] === '"') {
        advance(); let closed = false;
        while (offset < text.length) {
          if (text[offset] === '\r' && text[offset + 1] !== '\n') return failure({
            category: 'syntax', code: 'bare_cr', at: here(), recordNumber, fieldNumber,
          });
          if (text[offset] === '"') {
            if (text[offset + 1] === '"') { value += '"'; advance(); advance(); }
            else { advance(); closed = true; break; }
          } else { const before = offset; advance(); value += text.slice(before, offset); }
        }
        if (!closed) return failure({ category: 'syntax', code: 'unclosed_quote', at: here(), recordNumber, fieldNumber });
        if (text[offset] === '\r' && text[offset + 1] !== '\n') return failure({
          category: 'syntax', code: 'bare_cr', at: here(), recordNumber, fieldNumber,
        });
        if (offset < text.length && text[offset] !== ',' && text[offset] !== '\n' && text[offset] !== '\r') return failure({
          category: 'syntax', code: 'unexpected_after_quote', at: here(), recordNumber, fieldNumber,
        });
      } else {
        while (offset < text.length && text[offset] !== ',' && text[offset] !== '\n' && text[offset] !== '\r') {
          if (text[offset] === '"') return failure({ category: 'syntax', code: 'unexpected_quote', at: here(), recordNumber, fieldNumber });
          value += text[offset]; advance();
        }
        if (text[offset] === '\r' && text[offset + 1] !== '\n') return failure({
          category: 'syntax', code: 'bare_cr', at: here(), recordNumber, fieldNumber,
        });
      }
      fields.push(Object.freeze({ value, range: range(fieldStart, here()) }));
      if (text[offset] === ',') { advance(); continue; }
      records.push(Object.freeze({ recordNumber, range: range(start, here()), fields: Object.freeze(fields) }));
      if (offset < text.length) advance();
      break;
    }
  }
  return { records: Object.freeze(records), diagnostic: null, end: here() };
}
function quantity(value: string): number | 'invalid_quantity' | 'quantity_out_of_range' {
  if (value.length === 0 || (value.length > 1 && value[0] === '0')) return 'invalid_quantity';
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if (code < 48 || code > 57) return 'invalid_quantity';
  }
  const maximum = '9007199254740991';
  if (value.length > maximum.length || (value.length === maximum.length && value > maximum)) return 'quantity_out_of_range';
  return Number(value);
}

export function parseCompanyQuickOrderCsv(input: unknown): CompanyQuickOrderCsvResult {
  return boundary(() => {
    const row = record(input, ['schemaVersion', 'source', 'profile', 'id', 'version', 'catalogRef', 'text']);
    if (row.schemaVersion !== 1 || row.source !== 'fixture' || row.profile !== PROFILE || typeof row.text !== 'string') return invalid();
    const text = row.text;
    // El contrato estructurado conserva autoridad sobre toda la metadata, incluido capturedAt año0000.
    const empty = defineCompanyQuickOrderList({ schemaVersion: 1, source: 'fixture', profile: 'company-quick-order-identity-v1',
      id: row.id, version: row.version, origin: 'structured', catalogRef: row.catalogRef, lines: [] });
    const metadata: CompanyQuickOrderCsvMetadata = Object.freeze({ id: empty.id, version: empty.version, catalogRef: empty.catalogRef });
    const leadingBom = text[0] === '\ufeff';
    const info = (utf8Bytes: number | null): CompanyQuickOrderCsvTextInfo => Object.freeze({ utf16Length: text.length, utf8Bytes, leadingBom });
    const failed = (textInfo: CompanyQuickOrderCsvTextInfo, diagnostics: readonly CompanyQuickOrderCsvDiagnostic[],
      header: CompanyQuickOrderCsvRecord | null = null, rows: readonly CompanyQuickOrderCsvRow[] = []): CompanyQuickOrderCsvResult => Object.freeze({
      source: 'fixture', profile: PROFILE, outcome: 'invalid', metadata, textInfo, header,
      rows: Object.freeze(rows), diagnostics: Object.freeze(diagnostics.map(item => Object.freeze(item))), list: null,
    });
    if (text.length > COMPANY_QUICK_ORDER_CSV_LIMITS.textUtf16Units) return failed(info(null), [{
      category: 'limit', code: 'text_utf16_limit', at: null, recordNumber: null, fieldNumber: null,
    }]);
    const measurement = measureText(text);
    if (measurement.invalidAt) return failed(info(null), [{
      category: 'syntax', code: 'invalid_utf16', at: measurement.invalidAt, recordNumber: null, fieldNumber: null,
    }]);
    const textInfo = info(measurement.utf8Bytes);
    if (measurement.utf8Bytes! > COMPANY_QUICK_ORDER_CSV_LIMITS.textUtf8Bytes) return failed(textInfo, [{
      category: 'limit', code: 'text_utf8_limit', at: null, recordNumber: null, fieldNumber: null,
    }]);
    const scanned = scan(text, leadingBom);
    if (scanned.diagnostic) return failed(textInfo, [scanned.diagnostic]);
    const header = scanned.records[0];
    if (!header) return failed(textInfo, [{ category: 'header', code: 'header_missing', at: scanned.end, recordNumber: 1, fieldNumber: null }]);
    const rows: readonly CompanyQuickOrderCsvRow[] = Object.freeze(scanned.records.slice(1).map((record, index) => Object.freeze({
      position: index + 1, lineId: `csv.row.${index + 1}`, record,
    })));
    if (header.fields.length !== 2 || header.fields[0]!.value !== 'sku' || header.fields[1]!.value !== 'quantity_units') return failed(textInfo, [{
      category: 'header', code: 'header_mismatch', at: header.range.start, recordNumber: 1, fieldNumber: null,
    }], header, rows);
    const diagnostics: CompanyQuickOrderCsvDiagnostic[] = []; const lines: CompanyQuickOrderListLine[] = [];
    for (const item of rows) {
      const record = item.record;
      if (record.fields.length !== 2) {
        diagnostics.push(Object.freeze({ category: 'row', code: 'column_count', at: record.range.start, recordNumber: record.recordNumber, fieldNumber: null }));
        continue;
      }
      const sku = record.fields[0]!; const count = record.fields[1]!;
      const validSku = isCompanyQuickOrderSku(sku.value);
      if (!validSku) diagnostics.push(Object.freeze({ category: 'field', code: 'invalid_sku', at: sku.range.start, recordNumber: record.recordNumber, fieldNumber: 1 }));
      const quantityUnits = quantity(count.value);
      if (typeof quantityUnits !== 'number') diagnostics.push(Object.freeze({ category: 'field', code: quantityUnits, at: count.range.start, recordNumber: record.recordNumber, fieldNumber: 2 }));
      else if (validSku) lines.push(Object.freeze({ id: item.lineId, sku: sku.value, quantityUnits }));
    }
    if (diagnostics.length > 0) return failed(textInfo, diagnostics, header, rows);
    let list: CompanyQuickOrderList;
    try { list = defineCompanyQuickOrderList({ ...empty, lines }); }
    catch { return invalid('normalization_failure'); }
    return Object.freeze({ source: 'fixture', profile: PROFILE, outcome: 'parsed', metadata, textInfo, header, rows,
      diagnostics: Object.freeze([]), list });
  });
}
