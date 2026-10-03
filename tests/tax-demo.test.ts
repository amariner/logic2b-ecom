import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  canShowTaxDemo, configureTaxDemo, createTaxDemo, getTaxDemoView,
  type TaxDemoSelection, type TaxDemoState,
} from '../src/composition/tax-demo';
import { createPlatform } from '../src/composition/create-platform';
import { createPresetManifest, createPublicDemoManifest } from '../src/platform/configuration';
import { evaluateVatIdEvidence, previewTaxCalculation } from '../src/modules/taxes';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const configure = configureTaxDemo;
const view = getTaxDemoView;
function scenario(scenario: TaxDemoSelection['scenario'], priceBasis: TaxDemoSelection['priceBasis'] = 'excluded') {
  return configure(createTaxDemo(), { scenario, priceBasis });
}
function assertFrozen(value: unknown): void {
  if (value === null || typeof value !== 'object') return;
  expect(Object.isFrozen(value)).toBe(true);
  for (const child of Object.values(value)) assertFrozen(child);
}

describe('aislamiento de la demo fiscal', () => {
  it.each(['demo', 'client'] as const)('exige manifest %s y DEMO_MODE exacto sin leer bindings operativos', (mode) => {
    const deployment = { id: 'tax-demo-isolation', environment: 'development' as const };
    const platform = createPlatform(mode === 'demo' ? createPublicDemoManifest(deployment)
      : createPresetManifest('standard', { ...deployment, mode }));
    for (const DEMO_MODE of ['true', 'TRUE', 'false', '', undefined]) {
      const env = { DEMO_MODE, get DB(): never { throw new Error('Unexpected D1 access'); } };
      expect(canShowTaxDemo(env, platform)).toBe(mode === 'demo' && DEMO_MODE === 'true');
    }
    expect(canShowTaxDemo(undefined, platform)).toBe(false);
  });

  it('mostrar fixtures no activa impuestos, checkout ni rutas o trabajos', () => {
    const platform = createPlatform(createPublicDemoManifest({ id: 'tax-demo-isolation', environment: 'development' }));
    expect(canShowTaxDemo({ DEMO_MODE: 'true' }, platform)).toBe(true);
    for (const id of ['MKT-009', 'MKT-010'] as const) {
      expect(platform.capabilityState(id)).toBe('installed');
      expect(platform.isCapabilityActive(id)).toBe(false);
      expect(platform.hasCapabilityFlag(id, 'routes')).toBe(false);
    }
    expect(platform.manifest.capabilities).not.toHaveProperty('CHK-006');
    expect(platform.scheduledJobs('*/1 * * * *')).toEqual([]);
    expect(platform.scheduledJobs('*/5 * * * *')).toEqual([]);
  });
});

describe('casos cerrados calculados por el dominio fiscal', () => {
  it('inicia el caso mixto excluido con los tres importes postdescuento y VAT positivo vigente', () => {
    const initial = createTaxDemo();
    const current = view(initial);
    expect(initial.selection).toEqual({ scenario: 'mixed', priceBasis: 'excluded', vatScenario: 'valid' });
    expect(current.scenarioOptions.map(({ id }) => id)).toEqual(['mixed', 'rounding', 'zero_exempt', 'unresolved_shipping', 'no_assessment']);
    expect(current.priceBasisOptions.map(({ id }) => id)).toEqual(['excluded', 'included']);
    expect(current.vatScenarioOptions.map(({ id }) => id)).toEqual(['valid', 'invalid', 'expired', 'unavailable']);
    expect(current.tax).toMatchObject({ outcome: 'calculated', reason: null, totals: { netCents: 2975, taxCents: 324, grossCents: 3299 } });
    expect(current.tax.lines.map(({ id, kind, inputCents, rateBasisPoints, netCents, taxCents, grossCents }) =>
      ({ id, kind, inputCents, rateBasisPoints, netCents, taxCents, grossCents }))).toEqual([
      { id: 'goods.a', kind: 'goods', inputCents: 1900, rateBasisPoints: 1250, netCents: 1900, taxCents: 238, grossCents: 2138 },
      { id: 'goods.b', kind: 'goods', inputCents: 750, rateBasisPoints: 600, netCents: 750, taxCents: 45, grossCents: 795 },
      { id: 'shipping', kind: 'shipping', inputCents: 325, rateBasisPoints: 1250, netCents: 325, taxCents: 41, grossCents: 366 },
    ]);
    expect(current.vat).toMatchObject({ status: 'usable', outcome: 'valid', reason: null });
    expect(current.vat.message).toContain('no concede una exención');
    expect(current.feedback.code).toBe('initial');
  });

  it('incluido conserva los importes originales como bruto y el neto es el residuo de cada cuota', () => {
    const current = view(scenario('mixed', 'included'));
    expect(current.tax.totals).toEqual({ netCents: 2686, taxCents: 289, grossCents: 2975 });
    expect(current.tax.lines.map(({ inputCents, netCents, taxCents, grossCents }) => ({ inputCents, netCents, taxCents, grossCents }))).toEqual([
      { inputCents: 1900, netCents: 1689, taxCents: 211, grossCents: 1900 },
      { inputCents: 750, netCents: 708, taxCents: 42, grossCents: 750 },
      { inputCents: 325, netCents: 289, taxCents: 36, grossCents: 325 },
    ]);
    expect(current.tax.lines.every(({ priceBasis }) => priceBasis === 'included')).toBe(true);
  });

  it.each([
    ['excluded', 60, 7, 67, [1, 1, 5]],
    ['included', 55, 5, 60, [0, 0, 5]],
  ] as const)('redondeo %s conserva medio céntimo por línea: net=%i tax=%i gross=%i', (basis, netCents, taxCents, grossCents, lineTaxes) => {
    const current = view(scenario('rounding', basis));
    expect(current.tax.totals).toEqual({ netCents, taxCents, grossCents });
    expect(current.tax.lines.map(({ inputCents }) => inputCents)).toEqual([5, 5, 50]);
    expect(current.tax.lines.map(({ taxCents }) => taxCents)).toEqual(lineTaxes);
    expect(current.tax.lines.every(({ treatment }) => treatment === 'taxable')).toBe(true);
    if (basis === 'excluded') expect(current.tax.totals!.taxCents).not.toBe(6);
  });

  it.each([
    ['excluded', 2975, 41, 3016], ['included', 2939, 36, 2975],
  ] as const)('tipo cero y exención siguen distintos con base %s', (basis, netCents, taxCents, grossCents) => {
    const current = view(scenario('zero_exempt', basis));
    expect(current.tax.totals).toEqual({ netCents, taxCents, grossCents });
    expect(current.tax.lines[0]).toMatchObject({ treatment: 'zero_rate', treatmentLabel: 'Tipo cero', rateBasisPoints: 0,
      exemptionEvidenceRef: null, netCents: 1900, taxCents: 0, grossCents: 1900 });
    expect(current.tax.lines[1]).toMatchObject({ treatment: 'exempt', rateBasisPoints: null,
      exemptionEvidenceRef: 'demo.tax.exemption-evidence', netCents: 750, taxCents: 0, grossCents: 750 });
    expect(current.tax.lines[2]).toMatchObject({ treatment: 'taxable', rateBasisPoints: 1250 });
    expect(current.tax.lines[0]!.treatmentLabel).not.toBe(current.tax.lines[1]!.treatmentLabel);
  });

  it.each(['excluded', 'included'] as const)('envío pendiente con base %s conserva productos resueltos y total desconocido', (basis) => {
    const mixed = view(scenario('mixed', basis));
    const current = view(scenario('unresolved_shipping', basis));
    expect(current.tax).toMatchObject({ outcome: 'unresolved', reason: 'line_unresolved', totals: null });
    expect(current.taxResult.snapshot).not.toBeNull();
    expect(current.tax.lines.slice(0, 2)).toEqual(mixed.tax.lines.slice(0, 2));
    expect(current.tax.lines[2]).toMatchObject({ inputCents: 325, treatment: 'unresolved', rateBasisPoints: null,
      exemptionEvidenceRef: null, netCents: null, taxCents: null, grossCents: null,
      reasonLabels: ['Falta evidencia para resolver el tratamiento de esta línea.'] });
    expect(current.tax.message).toContain('total queda pendiente');
  });

  it.each(['excluded', 'included'] as const)('sin evaluación %s no fabrica tratamientos, cuotas, política ni snapshot', (basis) => {
    const current = view(scenario('no_assessment', basis));
    expect(current.taxResult).toMatchObject({ outcome: 'unresolved', reason: 'assessment_unavailable', snapshot: null,
      response: { outcome: 'unavailable', reason: 'not_configured' } });
    expect(current.tax).toMatchObject({ outcome: 'unresolved', totals: null, label: 'Sin evaluación fiscal' });
    expect(current.tax.lines.map(({ inputCents }) => inputCents)).toEqual([1900, 750, 325]);
    for (const line of current.tax.lines) {
      expect(line).toMatchObject({ treatment: null, treatmentLabel: 'Sin evaluación', rateBasisPoints: null,
        exemptionEvidenceRef: null, netCents: null, taxCents: null, grossCents: null });
      expect(line.reasonLabels).toEqual(['No hay una evaluación fiscal para esta línea.']);
    }
    expect(current.taxResult.response).not.toHaveProperty('policy');
    expect(current.taxResult.response).not.toHaveProperty('assessedAt');
  });

  it('conserva los resultados públicos originales y alinea cada fila de presentación con el snapshot', () => {
    for (const { id: scenarioId } of view(createTaxDemo()).scenarioOptions) {
      for (const priceBasis of ['included', 'excluded'] as const) {
        const current = view(scenario(scenarioId, priceBasis));
        expect(current.taxResult).toEqual(previewTaxCalculation({ request: current.taxResult.request,
          expectedAdapterId: current.taxResult.adapterId, response: current.taxResult.response }));
        for (const row of current.tax.lines) {
          const result = current.taxResult.snapshot?.lines.find(({ line }) => line.id === row.id);
          expect(row.netCents).toBe(result?.netCents ?? null);
          expect(row.taxCents).toBe(result?.taxCents ?? null);
          expect(row.grossCents).toBe(result?.grossCents ?? null);
          expect(row.treatment).toBe(result?.decision.treatment ?? null);
          if (result && row.netCents !== null && row.taxCents !== null) expect(row.netCents + row.taxCents).toBe(row.grossCents);
        }
      }
    }
  });
});

describe('evidencia VAT independiente y con vigencia explícita', () => {
  it.each([
    ['valid', 'usable', 'valid', null], ['invalid', 'usable', 'invalid', null],
    ['expired', 'unusable', null, 'expired'], ['unavailable', 'unusable', null, 'unavailable'],
  ] as const)('VAT %s devuelve %s/%s/%s sin inferir una exención', (vatScenario, status, outcome, reason) => {
    const current = view(configure(createTaxDemo(), { vatScenario }));
    expect(current.vat).toMatchObject({ status, outcome, reason, at: '2026-10-03T12:00:00.000Z', checkedAt: '2026-10-03T11:00:00.000Z' });
    expect(current.tax.totals).toEqual({ netCents: 2975, taxCents: 324, grossCents: 3299 });
    expect(current.tax.lines.every(({ treatment }) => treatment === 'taxable')).toBe(true);
    expect(current.vatResult.query.countryCode).toBe('ZZ');
    expect(current.vatResult.query.identifier).toMatch(/^FICTIONAL/);
    expect(current.vatResult).toEqual(evaluateVatIdEvidence({ expectedAdapterId: current.vatResult.adapterId,
      query: current.vatResult.query, at: current.vatResult.at, response: { status: 'evidence', evidence: current.vatResult.evidence } }));
  });

  it('la evidencia positiva que vence justo en at no se presenta como vigente ni negativa', () => {
    const current = view(configure(createTaxDemo(), { vatScenario: 'expired' }));
    expect(current.vatResult.evidence?.outcome).toBe('valid');
    expect(current.vatResult.evidence?.expiresAt).toBe(current.vatResult.at);
    expect(current.vat).toMatchObject({ status: 'unusable', outcome: null, reason: 'expired', label: 'Evidencia caducada' });
  });

  it('los cuatro presets VAT dejan intactos petición, respuesta y desglose de todos los casos y bases', () => {
    for (const { id: scenarioId } of view(createTaxDemo()).scenarioOptions) {
      for (const priceBasis of ['included', 'excluded'] as const) {
        const baseline = scenario(scenarioId, priceBasis);
        const tax = view(baseline).taxResult;
        const dto = view(baseline).tax;
        for (const vatScenario of ['valid', 'invalid', 'expired', 'unavailable'] as const) {
          const changed = view(configure(baseline, { vatScenario }));
          expect(changed.taxResult).toEqual(tax);
          expect(changed.tax).toEqual(dto);
        }
      }
    }
  });

  it('la selección fiscal tampoco cambia la evidencia VAT elegida', () => {
    const state = configure(createTaxDemo(), { vatScenario: 'expired' });
    const before = view(state).vatResult;
    expect(view(configure(state, { scenario: 'zero_exempt', priceBasis: 'included' })).vatResult).toEqual(before);
    expect(view(configure(state, { scenario: 'no_assessment' })).vatResult).toEqual(before);
  });
});

describe('selección estricta, reset e inmutabilidad', () => {
  it('recalcula con selectores cerrados sin guardar, reloj virtual ni buffers', () => {
    const initial = createTaxDemo();
    const changed = configure(initial, { scenario: 'rounding', priceBasis: 'included', vatScenario: 'invalid' });
    expect(changed.selection).toEqual({ scenario: 'rounding', priceBasis: 'included', vatScenario: 'invalid' });
    expect(view(changed).tax.totals).toEqual({ netCents: 55, taxCents: 5, grossCents: 60 });
    expect(changed.feedback.code).toBe('selection_changed');
    expect(Object.keys(changed).sort()).toEqual(['feedback', 'selection']);
    expect(initial.selection.scenario).toBe('mixed');
    const reset = createTaxDemo();
    expect(reset).toEqual(initial);
    expect(view(reset)).toEqual(view(initial));
    expect(view(changed).tax.totals).not.toEqual(view(reset).tax.totals);
  });

  it.each([
    {}, { scenario: 'other' }, { scenario: 'MIXED' }, { priceBasis: 'automatic' }, { priceBasis: undefined },
    { vatScenario: 'unsupported' }, { amountCents: 0 }, { identifier: 'VAT123' }, { countryCode: 'ES' },
    { scenario: 'mixed', extra: true },
  ])('rechaza acciones ajenas al perfil cerrado: %j', (input) => {
    expect(() => configure(createTaxDemo(), input as never)).toThrow(RangeError);
  });

  it('lectura y configuración rechazan estados ajenos sin fabricar un caso por defecto', () => {
    const initial = createTaxDemo();
    const invalidStates = [null, {}, { ...initial, extra: true },
      { ...initial, selection: { ...initial.selection, scenario: 'unknown' } },
      { ...initial, selection: { ...initial.selection, priceBasis: 'automatic' } },
      { ...initial, selection: { ...initial.selection, vatScenario: 'future' } },
      { ...initial, selection: { ...initial.selection, amountCents: 1 } },
      { ...initial, feedback: { ...initial.feedback, message: 'Injected' } },
    ];
    for (const state of invalidStates) {
      expect(() => view(state as TaxDemoState)).toThrow(RangeError);
      expect(() => configure(state as TaxDemoState, { scenario: 'mixed' })).toThrow(RangeError);
    }
    expect(view(initial).tax.totals).toEqual({ netCents: 2975, taxCents: 324, grossCents: 3299 });
  });

  it('no ejecuta getters de acciones ni estados y rechaza prototipos, campos ocultos o símbolos', () => {
    const initial = createTaxDemo();
    const getter = vi.fn(() => 'mixed');
    for (const input of [
      Object.defineProperty({}, 'scenario', { enumerable: true, get: getter }),
      Object.assign(Object.create({ inherited: true }), { scenario: 'mixed' }),
      { scenario: 'mixed', [Symbol('unknown')]: true },
      Object.defineProperty({}, 'scenario', { enumerable: false, value: 'mixed' }),
    ]) expect(() => configure(initial, input as never)).toThrow(RangeError);
    const states = [Object.defineProperty({ ...initial }, 'selection', { enumerable: true, get: getter }),
      { ...initial, selection: Object.defineProperty({ ...initial.selection }, 'scenario', { enumerable: true, get: getter }) },
      { ...initial, feedback: Object.defineProperty({ ...initial.feedback }, 'message', { enumerable: true, get: getter }) }];
    for (const state of states) {
      expect(() => view(state)).toThrow(RangeError);
      expect(() => configure(state, { priceBasis: 'included' })).toThrow(RangeError);
    }
    expect(getter).not.toHaveBeenCalled();
  });

  it('acepta copias propias canónicas sin retener referencias mutables', () => {
    const source = structuredClone(createTaxDemo());
    const current = view(source);
    Object.assign(source.selection, { scenario: 'no_assessment' });
    expect(current.selection.scenario).toBe('mixed');
    expect(current.tax.totals?.grossCents).toBe(3299);
    const input = { priceBasis: 'included' as const };
    const changed = configure(createTaxDemo(), input);
    Object.assign(input, { priceBasis: 'excluded' });
    expect(changed.selection.priceBasis).toBe('included');
    expect(view(Object.assign(Object.create(null), createTaxDemo()))).toEqual(view(createTaxDemo()));
    assertFrozen(changed);
    assertFrozen(current);
  });

  it('todos los recorridos son deterministas, congelados y sin red, storage, timers o reloj implícito', () => {
    const unexpected = () => { throw new Error('Unexpected external effect'); };
    class ExplicitDate extends Date {
      constructor(value?: string | number) {
        if (value === undefined) throw new Error('Unexpected implicit clock');
        super(value);
      }
      static override now(): number { return unexpected(); }
    }
    vi.stubGlobal('Date', ExplicitDate);
    vi.stubGlobal('fetch', unexpected);
    vi.stubGlobal('localStorage', { getItem: unexpected, setItem: unexpected });
    vi.stubGlobal('sessionStorage', { getItem: unexpected, setItem: unexpected });
    vi.stubGlobal('setTimeout', unexpected);
    vi.stubGlobal('setInterval', unexpected);
    for (const { id: scenarioId } of view(createTaxDemo()).scenarioOptions) {
      const state = configure(createTaxDemo(), { scenario: scenarioId, priceBasis: 'included', vatScenario: 'unavailable' });
      const first = view(state);
      expect(view(state)).toEqual(first);
      expect(first.taxResult.request.at).toBe('2026-10-03T12:00:00.000Z');
      assertFrozen(state);
      assertFrozen(first);
    }
    expect(() => { (createTaxDemo().selection as { scenario: string }).scenario = 'other'; }).toThrow();
  });
});
