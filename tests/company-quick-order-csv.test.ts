import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  COMPANY_QUICK_ORDER_CSV_LIMITS, CompanyQuickOrderCsvContractError, parseCompanyQuickOrderCsv,
  defineCompanyQuickOrderList, previewCompanyQuickOrderList, type CompanyQuickOrderCsvResult,
  type CompanyQuickOrderCsvContractReason,
} from '../src/modules/companies';
import * as listContract from '../src/modules/companies/domain/company-quick-order';
import * as skuContract from '../src/modules/companies/domain/company-quick-order-sku';

const HEADER = 'sku,quantity_units';
function input(text = `${HEADER}\nKIT-A,2\nKIT-A,3\nKIT-B,0\n`) {
  return { schemaVersion: 1, source: 'fixture', profile: 'company-quick-order-csv-v1', id: 'csv.example', version: 2,
    catalogRef: { ref: 'catalog.example', capturedAt: '2026-10-03T10:00:00.000Z' }, text };
}
function parse(text?: string) { return parseCompanyQuickOrderCsv(input(text)); }
function point(offset: number, line: number, column: number) { return { offset, line, column }; }
function codes(result: CompanyQuickOrderCsvResult) { return result.diagnostics.map(item => item.code); }
function expectError(operation: () => unknown, reason: CompanyQuickOrderCsvContractReason = 'invalid_data') {
  try { operation(); } catch (error) {
    expect(error).toBeInstanceOf(CompanyQuickOrderCsvContractError);
    expect(error).toMatchObject({ code: 'company_quick_order_csv_contract_invalid', reason });
    expect(error).not.toHaveProperty('cause');
    return error as CompanyQuickOrderCsvContractError;
  }
  throw new Error('Se esperaba un error de contrato.');
}
function assertFrozen(value: unknown): void {
  if (value !== null && typeof value === 'object') { expect(Object.isFrozen(value)).toBe(true); Object.values(value).forEach(assertFrozen); }
}
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('CSV fixture hacia intención estructurada completa', () => {
  it('delegates metadata and the final whole list to the real normalizer without changing its origin', () => {
    const normalize = vi.spyOn(listContract, 'defineCompanyQuickOrderList');
    const result = parse();
    expect(result.outcome).toBe('parsed'); expect(result.diagnostics).toEqual([]);
    expect(normalize).toHaveBeenCalledTimes(2);
    expect(normalize.mock.calls[0]![0]).toMatchObject({ id: 'csv.example', version: 2, origin: 'structured', lines: [] });
    expect(result.list).toBe(normalize.mock.results[1]!.value);
    expect(result.list).toEqual(defineCompanyQuickOrderList({ schemaVersion: 1, source: 'fixture', profile: 'company-quick-order-identity-v1',
      id: 'csv.example', version: 2, catalogRef: input().catalogRef, origin: 'structured', lines: [
        { id: 'csv.row.1', sku: 'KIT-A', quantityUnits: 2 }, { id: 'csv.row.2', sku: 'KIT-A', quantityUnits: 3 },
        { id: 'csv.row.3', sku: 'KIT-B', quantityUnits: 0 },
      ] }));
    expect(result.rows.map(row => [row.position, row.lineId, row.record.recordNumber])).toEqual([
      [1, 'csv.row.1', 2], [2, 'csv.row.2', 3], [3, 'csv.row.3', 4],
    ]);
    expect(Object.keys(result).sort()).toEqual(['diagnostics', 'header', 'list', 'metadata', 'outcome', 'profile', 'rows', 'source', 'textInfo']);
    assertFrozen(result);
  });

  it.each([HEADER, `${HEADER}\n`, `${HEADER}\r\n`, `\ufeff"sku","quantity_units"\r\n`])('accepts decoded header and an empty complete intention: %j', text => {
    const result = parse(text);
    expect(result).toMatchObject({ outcome: 'parsed', rows: [], diagnostics: [], list: { origin: 'structured', lines: [] } });
    expect(result.header!.fields.map(field => field.value)).toEqual(['sku', 'quantity_units']);
  });

  it('decodes only CSV syntax, preserving spaces, punctuation, quotes, formula-like strings and Unicode distinctions', () => {
    const result = parse(`${HEADER}\n" KIT-A",1\r\n"SKU,AZUL",2\n"SKU""X","1"\n00042,0\n=A1+1,1\n__proto__,2\nÁ-1,3\nA\u0301-1,4\n`);
    expect(result.outcome).toBe('parsed');
    expect(result.list!.lines.map(line => line.sku)).toEqual([' KIT-A', 'SKU,AZUL', 'SKU"X', '00042', '=A1+1', '__proto__', 'Á-1', 'A\u0301-1']);
    expect(result.list!.lines.map(line => line.quantityUnits)).toEqual([1, 2, 1, 0, 1, 2, 3, 4]);
    expect(result.rows[2]!.record.fields[0]!.value).toBe('SKU"X');
  });

  it('leaves missing or ambiguous identity to the actual catalog preview, after parsing succeeds', () => {
    const result = parse(`${HEADER}\nMISSING,0\nDUP,2\n`);
    expect(result.outcome).toBe('parsed'); expect(result.diagnostics).toEqual([]);
    const identity = previewCompanyQuickOrderList({ catalog: { schemaVersion: 1, source: 'fixture', profile: 'company-quick-order-identity-v1',
      ...input().catalogRef, products: [{ id: 1, variants: [{ id: 11, productId: 1, sku: 'DUP' }, { id: 12, productId: 1, sku: 'DUP' }] }] }, list: result.list });
    expect(identity.lines.map(row => row.reason)).toEqual(['sku_not_found', 'sku_ambiguous']);
    expect(identity.lines[0]!.line.quantityUnits).toBe(0);
  });

  it('does not produce a partial intention from valid rows around a bad row', () => {
    const normalize = vi.spyOn(listContract, 'defineCompanyQuickOrderList');
    const result = parse(`${HEADER}\nFIRST,1\nBAD,2.5\nLAST,3\n`);
    expect(result.outcome).toBe('invalid'); expect(result.list).toBeNull();
    expect(result.rows.map(row => row.record.fields.map(field => field.value))).toEqual([['FIRST', '1'], ['BAD', '2.5'], ['LAST', '3']]);
    expect(result.diagnostics).toEqual([{ category: 'field', code: 'invalid_quantity', at: point(31, 3, 5), recordNumber: 3, fieldNumber: 2 }]);
    expect(normalize).toHaveBeenCalledTimes(1);
  });

  it('reports all field errors in row/column order, but never assigns meanings to extra or missing columns', () => {
    const result = parse(`${HEADER}\n,\nA,01,EXTRA\n\nB,-0\nC,9007199254740992\n`);
    expect(result.list).toBeNull(); expect(result.rows).toHaveLength(5);
    expect(result.diagnostics.map(d => [d.code, d.recordNumber, d.fieldNumber])).toEqual([
      ['invalid_sku', 2, 1], ['invalid_quantity', 2, 2], ['column_count', 3, null], ['column_count', 4, null],
      ['invalid_quantity', 5, 2], ['quantity_out_of_range', 6, 2],
    ]);
    expect(result.rows[1]!.record.fields.map(field => field.value)).toEqual(['A', '01', 'EXTRA']);
  });

  it.each(['SKU,quantity_units', ' sku,quantity_units', 'sku,quantity_units ', 'quantity_units,sku', 'sku;quantity_units', 'sku,quantity_units,extra', '\ufeff\ufeffsku,quantity_units'])('rejects a different decoded header %j without field diagnostics', header => {
    const result = parse(`${header}\n,not-a-number\n`);
    expect(codes(result)).toEqual(['header_mismatch']); expect(result.rows).toHaveLength(1); expect(result.list).toBeNull();
    expect(result.header).not.toBeNull();
  });

  it('distinguishes no header, a blank header, final terminator, and real empty data records', () => {
    for (const text of ['', '\ufeff']) {
      const result = parse(text); expect(codes(result)).toEqual(['header_missing']);
      expect(result).toMatchObject({ header: null, rows: [], list: null });
      expect(result.diagnostics[0]!.at).toEqual(point(text.length, 1, text.length + 1));
    }
    expect(codes(parse('\n'))).toEqual(['header_mismatch']);
    expect(parse(`${HEADER}\nA,1\n`).rows).toHaveLength(1);
    const result = parse(`${HEADER}\nA,1\n\nB,0\n\n`);
    expect(result.rows).toHaveLength(4);
    expect(result.diagnostics.map(d => [d.code, d.recordNumber])).toEqual([['column_count', 3], ['column_count', 5]]);
  });
});

describe('scanner y posiciones originales', () => {
  it.each([
    ['A"X,1', 'unexpected_quote', 20, 2, 1],
    ['"A" ,1', 'unexpected_after_quote', 22, 4, 1],
    ['"A,1', 'unclosed_quote', 23, 5, 1],
    ['A,1\r', 'bare_cr', 22, 4, 2],
    ['"A\rB",1', 'bare_cr', 21, 3, 1],
    ['"A"\r,1', 'bare_cr', 22, 4, 1],
  ] as const)('fails closed at syntax %j with no decoded prefix', (suffix, code, offset, column, fieldNumber) => {
    const result = parse(`${HEADER}\n${suffix}`);
    expect(result).toMatchObject({ outcome: 'invalid', header: null, rows: [], list: null });
    expect(result.diagnostics).toEqual([{ category: 'syntax', code, at: point(offset, 2, column), recordNumber: 2, fieldNumber }]);
  });

  it('drops the whole structural prefix when a later row has malformed quoting', () => {
    const result = parse(`${HEADER}\nVALID,1\n"BROKEN,2\n`);
    expect(codes(result)).toEqual(['unclosed_quote']);
    expect(result).toMatchObject({ header: null, rows: [], list: null });
    expect(result.diagnostics[0]).toMatchObject({ recordNumber: 3, fieldNumber: 1, at: { line: 4, column: 1 } });
  });

  it('counts BOM, astral UTF-16 units and CRLF in exact source spans', () => {
    const result = parse('\ufeff"sku","quantity_units"\r\n"𐐀",0\r\n');
    expect(result.outcome).toBe('parsed');
    expect(result.textInfo).toEqual({ utf16Length: 33, utf8Bytes: 37, leadingBom: true });
    expect(result.header!.fields[0]).toEqual({ value: 'sku', range: { start: point(1, 1, 2), end: point(6, 1, 7) } });
    expect(result.header!.fields[1]).toEqual({ value: 'quantity_units', range: { start: point(7, 1, 8), end: point(23, 1, 24) } });
    expect(result.rows[0]!.record).toEqual({ recordNumber: 2, range: { start: point(25, 2, 1), end: point(31, 2, 7) }, fields: [
      { value: '𐐀', range: { start: point(25, 2, 1), end: point(29, 2, 5) } },
      { value: '0', range: { start: point(30, 2, 6), end: point(31, 2, 7) } },
    ] });
  });

  it('preserves multiline quoted content as one field, then diagnoses the field without splitting records', () => {
    const result = parse(`${HEADER}\n"KI\r\nT",2`);
    expect(codes(result)).toEqual(['invalid_sku']); expect(result.rows).toHaveLength(1);
    expect(result.rows[0]!.record).toEqual({ recordNumber: 2, range: { start: point(19, 2, 1), end: point(28, 3, 5) }, fields: [
      { value: 'KI\r\nT', range: { start: point(19, 2, 1), end: point(26, 3, 3) } },
      { value: '2', range: { start: point(27, 3, 4), end: point(28, 3, 5) } },
    ] });
    expect(result.diagnostics[0]!.at).toEqual(point(19, 2, 1));
  });

  it('distinguishes empty quoted and unquoted ranges while preserving the same empty value', () => {
    const quoted = parse(`${HEADER}\n"",0`); const unquoted = parse(`${HEADER}\n,0`);
    expect(quoted.rows[0]!.record.fields[0]).toEqual({ value: '', range: { start: point(19, 2, 1), end: point(21, 2, 3) } });
    expect(unquoted.rows[0]!.record.fields[0]).toEqual({ value: '', range: { start: point(19, 2, 1), end: point(19, 2, 1) } });
    expect(codes(quoted)).toEqual(['invalid_sku']); expect(codes(unquoted)).toEqual(['invalid_sku']);
    const trailing = parse(`${HEADER}\nA,`);
    expect(trailing.rows[0]!.record.fields[1]!.range).toEqual({ start: point(21, 2, 3), end: point(21, 2, 3) });
    expect(codes(trailing)).toEqual(['invalid_quantity']);
  });

  it('allows a literal quote only as an escaped character in a wholly quoted field', () => {
    expect(parse(`${HEADER}\n"""",1`).list!.lines[0]!.sku).toBe('"');
    expect(parse(`${HEADER}\n"A""B",1`).list!.lines[0]!.sku).toBe('A"B');
    expect(codes(parse(`${HEADER}\n""",1`))).toEqual(['unclosed_quote']);
  });
});

describe('límites y léxico sin coerción', () => {
  it.each(['', '-0', '-1', '+1', '01', '00', '1 ', ' 1', '1.0', '1e2', '0x10', '1_000', 'NaN', 'Infinity', '١', '１', '0\n', '2\r\n'])('rejects whole quantity token %j rather than coercing or matching a numeric prefix', token => {
    const escaped = `"${token.replaceAll('"', '""')}"`;
    const result = parse(`${HEADER}\nA,${escaped}`);
    expect(codes(result)).toEqual(['invalid_quantity']); expect(result.list).toBeNull();
    expect(result.rows[0]!.record.fields[1]!.value).toBe(token);
  });

  it('accepts zero and MAX_SAFE exactly, preserves repeated maxima and distinguishes lexical errors from overflow', () => {
    const result = parse(`${HEADER}\nA,0\nA,9007199254740991\nA,9007199254740991`);
    expect(result.list!.lines.map(line => line.quantityUnits)).toEqual([0, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER]);
    expect(codes(parse(`${HEADER}\nA,9007199254740992`))).toEqual(['quantity_out_of_range']);
    expect(codes(parse(`${HEADER}\nA,99999999999999999`))).toEqual(['quantity_out_of_range']);
    expect(codes(parse(`${HEADER}\nA,09999999999999999`))).toEqual(['invalid_quantity']);
  });

  it('retains the 100th data row, rejects the 101st without a prefix, and does not count one final newline twice', () => {
    const text = `${HEADER}\n${'A,0\n'.repeat(100)}`;
    const result = parse(text);
    expect(result.outcome).toBe('parsed'); expect(result.rows).toHaveLength(100);
    expect(result.rows[99]).toMatchObject({ position: 100, lineId: 'csv.row.100', record: { recordNumber: 101 } });
    const excess = parse(`${text}B,1`);
    expect(excess).toMatchObject({ header: null, rows: [], list: null });
    expect(excess.diagnostics).toEqual([{ category: 'limit', code: 'record_limit', at: point(419, 102, 1), recordNumber: 102, fieldNumber: null }]);
  });

  it('retains extras up to the technical 32-field ceiling, but a 33rd even empty field aborts the entire parse', () => {
    const row = Array.from({ length: 32 }, () => 'x').join(',');
    const result = parse(`${HEADER}\n${row}`);
    expect(codes(result)).toEqual(['column_count']); expect(result.rows[0]!.record.fields).toHaveLength(32);
    for (const suffix of [',', ',x']) {
      const overflow = parse(`${HEADER}\n${row}${suffix}`);
      expect(overflow).toMatchObject({ header: null, rows: [], list: null });
      expect(overflow.diagnostics).toEqual([{ category: 'limit', code: 'column_limit', at: point(83, 2, 65), recordNumber: 2, fieldNumber: 33 }]);
    }
  });

  it('preserves all 200 diagnostics at the row bound without truncating or producing an empty successful list', () => {
    const result = parse(`${HEADER}\n${',\n'.repeat(100)}`);
    expect(result.rows).toHaveLength(100); expect(result.diagnostics).toHaveLength(200); expect(result.list).toBeNull();
    expect(result.diagnostics[198]).toMatchObject({ code: 'invalid_sku', recordNumber: 101, fieldNumber: 1 });
    expect(result.diagnostics[199]).toMatchObject({ code: 'invalid_quantity', recordNumber: 101, fieldNumber: 2 });
  });

  it('distinguishes exact UTF-16/UTF-8 byte bounds and measures whole well-formed input before parsing', () => {
    const ascii = `${HEADER}\n${'A'.repeat(65515)},0`;
    const exact = parse(ascii);
    expect(exact.textInfo).toEqual({ utf16Length: 65536, utf8Bytes: 65536, leadingBom: false });
    expect(codes(exact)).toEqual(['invalid_sku']);
    const long = parse(ascii + 'A');
    expect(codes(long)).toEqual(['text_utf16_limit']); expect(long.textInfo.utf8Bytes).toBeNull(); expect(long.header).toBeNull();
    const multibyte = `${HEADER}\n${'é'.repeat(32757)}A,0`;
    const byteExact = parse(multibyte);
    expect(byteExact.textInfo.utf8Bytes).toBe(65536); expect(codes(byteExact)).toEqual(['invalid_sku']);
    const tooManyBytes = parse(multibyte + 'é');
    expect(codes(tooManyBytes)).toEqual(['text_utf8_limit']); expect(tooManyBytes.textInfo.utf8Bytes).toBe(65538);
    expect(tooManyBytes).toMatchObject({ header: null, rows: [], list: null });
    expect(tooManyBytes.diagnostics[0]!.at).toBeNull();
    expect(Object.isFrozen(COMPANY_QUICK_ORDER_CSV_LIMITS)).toBe(true);
  });

  it('reports malformed UTF-16 before syntax/bytes without replacement or fabricated record coordinates', () => {
    const result = parse(`${HEADER}\nA\r\ud800,0`);
    expect(result.textInfo.utf8Bytes).toBeNull();
    expect(result.diagnostics).toEqual([{ category: 'syntax', code: 'invalid_utf16', at: point(21, 2, 3), recordNumber: null, fieldNumber: null }]);
    expect(result).toMatchObject({ header: null, rows: [], list: null });
    expect(codes(parse(`${'é'.repeat(40000)}\udfff`))).toEqual(['invalid_utf16']);
    expect(codes(parse(`${'A'.repeat(65536)}\udfff`))).toEqual(['text_utf16_limit']);
    expect(codes(parse(`bad-header\n"unterminated`))).toEqual(['unclosed_quote']);
  });

  it.each(['A\u200b', 'A\u034f', 'A\ufe0f', 'A\u00a0', ' ', '\u0301', 'x'.repeat(101)])('uses the unchanged private SKU predicate for decoded %j', sku => {
    const result = parse(`${HEADER}\n"${sku}",1`);
    expect(codes(result)).toEqual(['invalid_sku']);
    expect(() => defineCompanyQuickOrderList({ schemaVersion: 1, source: 'fixture', profile: 'company-quick-order-identity-v1', id: 'x', version: 1,
      catalogRef: input().catalogRef, origin: 'structured', lines: [{ id: 'line', sku, quantityUnits: 1 }] })).toThrow();
  });

  it('does not remove a second or internal BOM and shares the predicate rather than altering the literal', () => {
    expect(codes(parse(`\ufeff\ufeff${HEADER}`))).toEqual(['header_mismatch']);
    expect(codes(parse(`${HEADER}\nA\ufeff,1`))).toEqual(['invalid_sku']);
    const predicate = vi.spyOn(skuContract, 'isCompanyQuickOrderSku');
    const result = parse(`${HEADER}\n A ,1`);
    expect(result.list!.lines[0]!.sku).toBe(' A '); expect(predicate).toHaveBeenCalledWith(' A ');
  });
});

describe('frontera contractual, captura y pureza', () => {
  it('normalizes all metadata before diagnosing text, preserving the existing timestamp year-zero boundary', () => {
    for (const change of [{ id: 'INVALID' }, { version: -0 }, { catalogRef: { ...input().catalogRef, capturedAt: 'invalid' } }]) {
      expectError(() => parseCompanyQuickOrderCsv({ ...input('"broken'), ...change }));
    }
    const result = parseCompanyQuickOrderCsv({ ...input(), catalogRef: { ref: 'catalog.zero', capturedAt: '0000-02-29T00:00:00.000Z' } });
    expect(result.metadata.catalogRef).toEqual({ ref: 'catalog.zero', capturedAt: '0000-02-29T00:00:00.000Z' });
  });

  it('requires an exact data-only wrapper and never invokes wrapper or reference getters', () => {
    let calls = 0;
    const getter = () => { calls++; throw new Error('private'); };
    const wrapper = input(); Object.defineProperty(wrapper, 'text', { enumerable: true, get: getter });
    expectError(() => parseCompanyQuickOrderCsv(wrapper));
    const reference = input(); Object.defineProperty(reference.catalogRef, 'ref', { enumerable: true, get: getter });
    expectError(() => parseCompanyQuickOrderCsv(reference));
    expectError(() => parseCompanyQuickOrderCsv({ ...input(), upload: true }));
    expectError(() => parseCompanyQuickOrderCsv({ ...input(), text: new String(HEADER) }));
    expectError(() => parseCompanyQuickOrderCsv(Object.assign(Object.create({ inherited: true }), input())));
    const symbol = input(); Object.defineProperty(symbol, Symbol('x'), { value: true }); expectError(() => parseCompanyQuickOrderCsv(symbol));
    const hidden = input(); Object.defineProperty(hidden, 'text', { value: HEADER, enumerable: false }); expectError(() => parseCompanyQuickOrderCsv(hidden));
    expect(parseCompanyQuickOrderCsv(Object.assign(Object.create(null), input())).outcome).toBe('parsed');
    expect(calls).toBe(0);
  });

  it('redacts Proxy errors and hostile error descriptors instead of exposing input as an exception', () => {
    let calls = 0;
    const error = new CompanyQuickOrderCsvContractError('invalid_data');
    Object.defineProperty(error, 'reason', { get() { calls++; throw new Error('private-token'); } });
    for (const thrown of [new Error('private-token'), error, new Proxy({}, { getPrototypeOf() { throw new Error('private-token'); } })]) {
      const wrapper = new Proxy(input(), { ownKeys() { throw thrown; } });
      const result = expectError(() => parseCompanyQuickOrderCsv(wrapper));
      expect(result.message).toBe('Los datos no cumplen el contrato de entrada CSV de ejemplo.');
      expect(result.stack).not.toContain('private-token');
    }
    expect(calls).toBe(0);
    expect(new CompanyQuickOrderCsvContractError('__proto__' as CompanyQuickOrderCsvContractReason).reason).toBe('invalid_data');
  });

  it('separates a normalizer failure from content diagnostics and does not expose the good row prefix', () => {
    const actual = listContract.defineCompanyQuickOrderList;
    let calls = 0;
    vi.spyOn(listContract, 'defineCompanyQuickOrderList').mockImplementation(value => {
      if (++calls === 2) throw new Error('private-regression');
      return actual(value);
    });
    const error = expectError(() => parse(), 'normalization_failure');
    expect(error.message).toBe('La entrada no se pudo transformar en una lista estructurada de ejemplo.');
    expect(calls).toBe(2);
  });

  it('captures the string and metadata once even if external data change during normalization', () => {
    const wrapper = input(); const expected = parse(); const actual = listContract.defineCompanyQuickOrderList;
    vi.spyOn(listContract, 'defineCompanyQuickOrderList').mockImplementation(value => {
      const normalized = actual(value);
      wrapper.catalogRef.ref = 'later'; wrapper.version = 99; wrapper.text = 'broken';
      return normalized;
    });
    expect(parseCompanyQuickOrderCsv(wrapper)).toEqual(expected);
    assertFrozen(expected);
    expect(expected.metadata.catalogRef).not.toBe(wrapper.catalogRef);
  });

  it('has no IO, storage, timers or implicit clock; only explicit metadata timestamps may be parsed', () => {
    const fail = vi.fn(() => { throw new Error('Unexpected effect'); });
    for (const key of ['fetch', 'setTimeout', 'setInterval', 'localStorage', 'sessionStorage', 'crypto']) vi.stubGlobal(key, fail);
    const NativeDate = Date;
    vi.stubGlobal('Date', new Proxy(NativeDate, {
      construct(target, args) { if (args.length !== 1 || typeof args[0] !== 'string') return fail(); return Reflect.construct(target, args); },
      apply() { return fail(); }, get(target, key, receiver) { if (key === 'now') return fail; return Reflect.get(target, key, receiver); },
    }));
    expect(parse().outcome).toBe('parsed'); expect(parse('"broken').outcome).toBe('invalid');
    expect(fail).not.toHaveBeenCalled();
  });
});
