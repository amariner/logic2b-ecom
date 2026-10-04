import { describe, expect, it } from 'vitest';
import { createCatalogEntry, type ProductVariantStatus } from '../src/modules/catalog';
import {
  CURRENCY_PRESENTMENT_PROFILE, CurrencyContractError, createFixtureFxAdapter,
  defineCurrencyCatalog, definePresentmentRequest, previewCurrencyPresentment,
  type PresentmentRequest,
} from '../src/modules/currencies';
import {
  InternationalUrlPlanContractError, applyLocalizedContentCommand, defineLocalizedContent,
  planInternationalUrls, resolveLocalizedContent, type LocalizedContent,
} from '../src/modules/localization';
import { MarketPublicationContractError, defineMarketCatalog, previewMarketPublication } from '../src/modules/markets';
import { LocalPaymentMethodContractError, defineLocalPaymentMethodPolicy, defineLocalPaymentMethodRequest } from '../src/modules/payments';
import { evaluatePriceRules, resolvePriceLists, type PriceList } from '../src/modules/pricing';
import {
  TAX_CALCULATION_PROFILE, TaxContractError, createFixtureTaxAdapter, createFixtureVatIdAdapter,
  defineTaxRequest, defineVatIdQuery, evaluateVatIdEvidence, previewTaxCalculation,
  type TaxAssessmentResponse, type TaxRequest,
} from '../src/modules/taxes';
import { previewLocalPaymentMethodsContext } from '../src/composition/local-payment-methods-context';
import { resolveMarketPricingContext } from '../src/composition/market-pricing-context';
import { projectMarketPublicationSnapshot } from '../src/composition/market-publication-snapshot';

const AT = '2026-10-03T12:00:00.000Z';
const EARLIER = '2026-10-03T11:00:00.000Z';
const UNTIL = '2026-10-03T13:00:00.000Z';
const ES_URL = 'https://es.integration.test/guia';
const FR_URL = 'https://fr.integration.test/guide';
const TAX_ADAPTER = 'r5.integration.tax';
const FX_ADAPTER = 'r5.integration.fx';

// Fixtures privados del ensayo, no un agregador ni un contrato de compra.
// Los catálogos se comparten únicamente con APIs que declaran esas referencias.
function fixtures() {
  const markets = defineMarketCatalog({ schemaVersion: 1, id: 'r5.integration.markets', version: 3,
    markets: [
      { id: 'ES', currency: 'EUR', defaultLocale: 'es-ES', countryCodes: ['ES'], domains: ['es.integration.test'] },
      { id: 'FR', currency: 'EUR', defaultLocale: 'fr-FR', countryCodes: ['FR'], domains: ['fr.integration.test'] },
    ], fallback: { strategy: 'none' } });
  const currencies = defineCurrencyCatalog({ schemaVersion: 1, id: 'r5.integration.currencies', version: 2,
    currencies: [{ code: 'EUR', exponent: 2 }, { code: 'JPY', exponent: 0 }, { code: 'KWD', exponent: 3 }] });
  const refs = { marketCatalogRef: { id: markets.id, version: markets.version },
    currencyCatalogRef: { id: currencies.id, version: currencies.version } };
  const methodPolicy = defineLocalPaymentMethodPolicy({ schemaVersion: 1, source: 'fixture',
    id: 'r5.integration.methods', version: 4, ...refs, methods: [{ id: 'method.transfer' }], rules: [
      { methodId: 'method.transfer', marketId: 'ES', currency: 'EUR', exponent: 2, enabled: true, minMinor: 500, maxMinor: 100000 },
      { methodId: 'method.transfer', marketId: 'FR', currency: 'EUR', exponent: 2, enabled: false, minMinor: 500, maxMinor: 100000 },
    ] });
  const entry = createCatalogEntry({ product: { id: 1, slug: 'fixture-product', name: 'Producto sintético',
    description: 'Contenido del catálogo de prueba', image: '/fixture.webp', category: 'Fixture', collection: 'Fixture',
    active: true, subtitle: null, specs_json: null, created_at: EARLIER },
  variants: (['active', 'active', 'draft', 'archived'] as ProductVariantStatus[]).map((status, index) => ({
    id: 11 + index, product_id: 1, sku: `R5-FIXTURE-${index}`, gtin: null, mpn: null,
    title: `Variante ${index}`, price_cents: 1000 + index * 100, compare_at_price_cents: null,
    status, is_default: index === 0, option_signature: JSON.stringify([index + 1]),
    options: [{ option_id: 1, option_name: 'Acabado', option_position: 0, value_id: index + 1,
      value: `Acabado ${index}`, value_position: index }], created_at: EARLIER, updated_at: EARLIER,
  })), available_stock: 0 });
  const publicationCatalog = projectMarketPublicationSnapshot({ ref: 'r5.integration.catalog', capturedAt: AT, entries: [entry] });
  const publicationPolicy = { schemaVersion: 1, id: 'r5.integration.publication', version: 5, channels: ['storefront'],
    rules: [{ marketId: 'ES', channel: 'storefront', productId: 1, state: 'published', variantIds: [12, 13, 14] }] };
  const content = defineLocalizedContent({ schemaVersion: 1, id: 'r5.integration.guide', version: 2,
    sourceLocale: 'es-ES', updatedAt: EARLIER, editions: [
      { locale: 'es-ES', draft: null, published: { revision: 1, sourceRevision: null, publishedAt: '2026-10-03T10:00:00.000Z',
        fields: { title: 'Guía publicada', summary: 'Resumen en español.', bodyPlainText: 'Texto completo en español.' } } },
      { locale: 'fr-FR', draft: null, published: { revision: 2, sourceRevision: 1, publishedAt: EARLIER,
        fields: { title: 'Guide publié', summary: 'Résumé français.', bodyPlainText: 'Texte complet en français.' } } },
    ] });
  return { markets, currencies, refs, methodPolicy, entry, publicationCatalog, publicationPolicy, content };
}
type Fixtures = ReturnType<typeof fixtures>;

function pricing(fixture: Fixtures, marketId: string) {
  const resolved = resolveMarketPricingContext({ catalog: fixture.markets, selector: { by: 'id', marketId },
    baseCurrency: 'EUR', at: AT, channel: 'storefront' });
  if (resolved.status !== 'resolved') throw new Error('El fixture requiere un mercado resuelto.');
  // Precio de producto explícito para QA; no se atribuye un precio a la variante visible.
  const esList: PriceList = { id: 'r5-integration-es-list', version: 1, label: 'Lista ES de ejemplo', state: 'active', priority: 10,
    currency: 'EUR', activeFrom: null, activeUntil: null, markets: ['ES'], channels: ['storefront'], companyKeyHashes: [],
    prices: [{ productId: 1, priceCents: 800 }] };
  const lists = resolvePriceLists({ context: resolved.context, companyKeyHash: null,
    lines: [{ productId: 1, catalogUnitPriceCents: 1000 }], lists: [esList] });
  const price = evaluatePriceRules({ context: resolved.context, baseUnitPriceCents: lists.lines[0]!.baseUnitPriceCents, quantity: 2,
    candidates: [{ id: 'r5-integration-es-discount', version: 1, label: 'Descuento ES', priority: 1,
      activeFrom: null, activeUntil: null, markets: ['ES'], channels: ['storefront'], currency: 'EUR',
      effect: { type: 'percentage_off', basisPoints: 1000 } }] });
  return { resolved, lists, price };
}
function publication(fixture: Fixtures, marketId: string) {
  return previewMarketPublication({ markets: fixture.markets, catalog: fixture.publicationCatalog,
    policy: fixture.publicationPolicy, context: { marketId, channel: 'storefront' } });
}
function planInput(content: LocalizedContent, includeFrenchBinding = true) {
  return { contents: [content], routes: [
    { locale: 'es-ES', origin: 'https://es.integration.test', pathPrefix: '/', hreflang: 'es-ES' },
    { locale: 'fr-FR', origin: 'https://fr.integration.test', pathPrefix: '/', hreflang: 'fr-FR' },
  ], bindings: [
    { contentId: content.id, locale: 'es-ES', publishedRevision: 1, slug: 'guia' },
    ...(includeFrenchBinding ? [{ contentId: content.id, locale: 'fr-FR', publishedRevision: 2, slug: 'guide' }] : []),
  ], xDefaults: [{ contentId: content.id, locale: 'es-ES' }], staleTranslations: 'exclude' };
}
function methodRequest(fixture: Fixtures, marketId: string, amountMinor = 2975) {
  return defineLocalPaymentMethodRequest({ schemaVersion: 1, id: `r5.integration.methods.${marketId.toLowerCase()}`,
    marketId, original: { currency: 'EUR', exponent: 2, amountMinor }, ...fixture.refs });
}
function methods(fixture: Fixtures, marketId: string, amountMinor = 2975) {
  return previewLocalPaymentMethodsContext({ markets: fixture.markets, currencies: fixture.currencies,
    policy: fixture.methodPolicy, request: methodRequest(fixture, marketId, amountMinor) });
}
function fxRequest(fixture: Fixtures, targetCurrency = 'JPY', id = 'r5.integration.presentment') {
  return definePresentmentRequest({ schemaVersion: 1, id, profile: CURRENCY_PRESENTMENT_PROFILE, at: AT,
    catalog: fixture.currencies, original: { currency: 'EUR', amountMinor: 2975 }, targetCurrency });
}
function fxQuote(request: PresentmentRequest, expiresAt = UNTIL) {
  return { source: 'fixture', adapterId: FX_ADAPTER, request, outcome: 'quoted', evidenceRef: 'r5.integration.fx-evidence',
    quotedAt: EARLIER, expiresAt, rate: { baseCurrency: 'EUR', targetCurrency: 'JPY', numerator: 160, denominator: 1 } };
}
function taxRequest(id: string, goodsAmountCents: number) {
  return defineTaxRequest({ schemaVersion: 1, id, profile: TAX_CALCULATION_PROFILE, at: AT, currency: 'EUR', lines: [
    { id: 'goods', kind: 'goods', amountCents: goodsAmountCents, priceBasis: 'excluded' },
    { id: 'shipping', kind: 'shipping', amountCents: 325, priceBasis: 'excluded' },
  ] });
}
function taxResponse(request: TaxRequest, unresolvedShipping = false): TaxAssessmentResponse {
  return { source: 'fixture', adapterId: TAX_ADAPTER, request, outcome: 'assessed', assessedAt: EARLIER, expiresAt: UNTIL,
    policy: { id: 'r5.synthetic-tax-policy', version: 7 }, decisions: request.lines.map(line =>
      unresolvedShipping && line.id === 'shipping' ? { lineId: line.id, treatment: 'unresolved', reason: 'missing_evidence' }
        : { lineId: line.id, treatment: 'taxable', rateBasisPoints: 1250,
          jurisdictionRef: 'r5.synthetic-tax-zone', ruleId: 'r5.synthetic-tax-rule' }) };
}

describe('R5.12 integración local de contratos internacionales sobre fixtures ES/FR', () => {
  it('1. comparte identidad de catálogo y EUR, conservando alcance exacto de listas y reglas de precios', () => {
    const fixture = fixtures();
    const es = pricing(fixture, 'ES'); const fr = pricing(fixture, 'FR');
    for (const [marketId, current] of [['ES', es], ['FR', fr]] as const) {
      expect(current.resolved.resolution).toMatchObject({ catalogId: fixture.markets.id, catalogVersion: fixture.markets.version,
        selector: { by: 'id', marketId }, outcome: 'matched', market: { id: marketId, currency: 'EUR' } });
      expect(current.price.context).toEqual({ market: marketId, currency: 'EUR', at: AT, channel: 'storefront' });
      expect(methods(fixture, marketId).markets).toEqual(fixture.markets);
      expect(methods(fixture, marketId).currencies).toEqual(fixture.currencies);
      expect(current.resolved.context).not.toHaveProperty('shippingCountry');
    }
    expect(es.lists.lines[0]).toMatchObject({ baseUnitPriceCents: 800, origin: { type: 'price_list', price_list_id: 'r5-integration-es-list' } });
    expect(es.price).toMatchObject({ unit_price_cents: 720, subtotal_cents: 1440 });
    expect(fr.lists.lines[0]!.baseUnitPriceCents).toBe(1000);
    expect(fr.price).toMatchObject({ unit_price_cents: 1000, subtotal_cents: 2000 });
  });

  it('2. publica URLs ES/FR recíprocas y retirar FR permite fallback íntegro sin URL francesa ni retarget de mercado', () => {
    const fixture = fixtures();
    const frContext = pricing(fixture, 'FR').resolved;
    const initial = planInternationalUrls(planInput(fixture.content));
    expect(initial.pages.map(page => page.url)).toEqual([ES_URL, FR_URL]);
    const alternates = [{ hreflang: 'es-ES', href: ES_URL }, { hreflang: 'fr-FR', href: FR_URL }, { hreflang: 'x-default', href: ES_URL }];
    for (const page of initial.pages) {
      expect(page.canonical).toBe(page.url); expect(page.alternates).toEqual(alternates);
      expect(page.freshness).toBe('current');
    }
    expect(initial.sitemaps.flatMap(sitemap => sitemap.entries.map(entry => entry.loc))).toEqual([ES_URL, FR_URL]);
    const french = resolveLocalizedContent(fixture.content, { requestedLocale: frContext.resolution.market.defaultLocale,
      fallback: { strategy: 'locale', locale: 'es-ES' }, staleTranslations: 'exclude' });
    expect(french).toMatchObject({ outcome: 'matched', requestedLocale: 'fr-FR', resolvedLocale: 'fr-FR' });

    const withdrawn = applyLocalizedContentCommand(fixture.content, { action: 'unpublish', expectedVersion: fixture.content.version,
      occurredAt: AT, locale: 'fr-FR' });
    expect(withdrawn.outcome).toBe('applied');
    const fallback = resolveLocalizedContent(withdrawn.content, { requestedLocale: frContext.resolution.market.defaultLocale,
      fallback: { strategy: 'locale', locale: 'es-ES' }, staleTranslations: 'exclude' });
    expect(fallback).toMatchObject({ outcome: 'fallback', reason: 'not_published', requestedLocale: 'fr-FR', resolvedLocale: 'es-ES' });
    if (fallback.outcome !== 'fallback') throw new Error('Se esperaba fallback editorial explícito.');
    expect(fallback.publication).toEqual(fixture.content.editions.find(edition => edition.locale === 'es-ES')!.published);
    expect(resolveLocalizedContent(withdrawn.content, { requestedLocale: 'fr-FR', fallback: { strategy: 'none' }, staleTranslations: 'exclude' }))
      .toMatchObject({ outcome: 'unresolved', reason: 'not_published' });
    // Un binding viejo es un error: se retira explícitamente, no se convierte en URL de fallback.
    expect(() => planInternationalUrls(planInput(withdrawn.content))).toThrow(InternationalUrlPlanContractError);
    const remaining = planInternationalUrls(planInput(withdrawn.content, false));
    expect(remaining.pages.map(page => page.url)).toEqual([ES_URL]);
    expect(remaining.pages[0]!.alternates).toEqual([alternates[0], alternates[2]]);
    expect(remaining.sitemaps).toEqual([{ origin: 'https://es.integration.test', entries: [{ loc: ES_URL, lastmod: '2026-10-03T10:00:00.000Z' }] }]);
    expect(JSON.stringify(remaining)).not.toContain('fr.integration.test');
    expect(frContext.context.market).toBe('FR');
    expect(pricing(fixture, 'FR').resolved).toEqual(frContext);
  });

  it('3. guardar borrador francés cambia versión editorial sin alterar precio, publicación, URL, alternates ni lastmod públicos', () => {
    const fixture = fixtures();
    const initialPlan = planInternationalUrls(planInput(fixture.content));
    const initialPrice = pricing(fixture, 'FR'); const initialPublication = publication(fixture, 'FR');
    const edited = applyLocalizedContentCommand(fixture.content, { action: 'save_draft', expectedVersion: fixture.content.version,
      occurredAt: AT, locale: 'fr-FR', sourceRevision: 1,
      fields: { title: 'Nouveau brouillon', summary: 'Texte en préparation.', bodyPlainText: 'Version non publiée.' } });
    expect(edited.outcome).toBe('applied');
    const next = planInternationalUrls(planInput(edited.content));
    expect(edited.content.version).toBeGreaterThan(fixture.content.version);
    for (const page of next.pages) expect(page.contentVersion).toBe(edited.content.version);
    const publishedFields = (plan: typeof next) => plan.pages.map(({ contentVersion: _version, ...page }) => page);
    expect(publishedFields(next)).toEqual(publishedFields(initialPlan));
    expect(next.sitemaps).toEqual(initialPlan.sitemaps);
    const resolved = resolveLocalizedContent(edited.content, { requestedLocale: 'fr-FR', fallback: { strategy: 'none' }, staleTranslations: 'exclude' });
    expect(resolved).toMatchObject({ outcome: 'matched', publication: { revision: 2, fields: { title: 'Guide publié' } } });
    expect(pricing(fixture, 'FR')).toEqual(initialPrice);
    expect(publication(fixture, 'FR')).toEqual(initialPublication);
  });

  it('4. catálogo completo y publicación explícita ocultan default/draft/archived; FR no hereda visibilidad por tener precio o contenido', () => {
    const fixture = fixtures();
    expect(fixture.entry.product.variants.find(variant => variant.is_default)!.id).toBe(11);
    expect(fixture.entry.available_stock).toBe(0);
    expect(fixture.publicationCatalog.products[0]!.variants.map(variant => variant.id)).toEqual([11, 12, 13, 14]);
    const es = publication(fixture, 'ES'); const fr = publication(fixture, 'FR');
    expect(es.markets).toEqual({ id: fixture.markets.id, version: fixture.markets.version });
    expect(es.catalog).toEqual({ ref: fixture.publicationCatalog.ref, capturedAt: AT });
    expect(es.products[0]).toMatchObject({ visible: true, visibleVariantIds: [12], publication: 'published', variants: [
      { variantId: 11, selected: false, visible: false, reasons: ['variant_not_selected'] },
      { variantId: 12, selected: true, visible: true, reasons: [] },
      { variantId: 13, selected: true, visible: false, reasons: ['variant_draft'] },
      { variantId: 14, selected: true, visible: false, reasons: ['variant_archived'] },
    ] });
    expect(fr.products[0]).toMatchObject({ publication: 'unconfigured', visible: false, visibleVariantIds: [], reasons: ['unconfigured'] });
    expect(pricing(fixture, 'FR').price.subtotal_cents).toBe(2000);
    expect(planInternationalUrls(planInput(fixture.content)).pages.some(page => page.url === FR_URL)).toBe(true);
    expect(methods(fixture, 'ES').result.methods[0]!.outcome).toBe('available_in_fixture');
    // Visibilidad y disponibilidad fixture no acreditan existencias ni una autorización de compra.
    expect(es).not.toHaveProperty('purchasable'); expect(es.products[0]).not.toHaveProperty('price');
  });

  it('5. versiones y catálogos ajenos se rechazan donde existen referencias, sin reutilizar la respuesta FX', () => {
    const fixture = fixtures();
    const initial = methods(fixture, 'ES');
    for (const key of ['marketCatalogRef', 'currencyCatalogRef'] as const) {
      const wrongRef = { ...fixture.refs[key], version: fixture.refs[key].version + 1 };
      expect(() => previewLocalPaymentMethodsContext({ markets: fixture.markets, currencies: fixture.currencies,
        policy: { ...fixture.methodPolicy, [key]: wrongRef }, request: { ...initial.result.request, [key]: wrongRef } }))
        .toThrow(LocalPaymentMethodContractError);
    }
    expect(() => previewLocalPaymentMethodsContext({ markets: { ...fixture.markets, id: 'r5.foreign-markets' },
      currencies: fixture.currencies, policy: fixture.methodPolicy, request: initial.result.request })).toThrow(LocalPaymentMethodContractError);
    const request = fxRequest(fixture);
    const adapter = createFixtureFxAdapter({ adapterId: FX_ADAPTER, cases: [fxQuote(request)] });
    const response = adapter.quote(request);
    for (const catalog of [{ ...fixture.currencies, version: fixture.currencies.version + 1 },
      { ...fixture.currencies, currencies: fixture.currencies.currencies.map(unit => unit.code === 'KWD' ? { ...unit, exponent: 2 } : unit) }]) {
      const changed = definePresentmentRequest({ ...request, catalog });
      expect(adapter.quote(changed)).toMatchObject({ outcome: 'unavailable', reason: 'not_configured' });
      expect(() => previewCurrencyPresentment({ mode: 'fx', request: changed, expectedAdapterId: FX_ADAPTER, response })).toThrow(CurrencyContractError);
    }
    expect(methods(fixture, 'ES')).toEqual(initial);
    expect(initial.result.request.marketCatalogRef).toEqual({ id: fixture.markets.id, version: fixture.markets.version });
    expect(initial.result.request.currencyCatalogRef).toEqual({ id: fixture.currencies.id, version: fixture.currencies.version });
  });

  it('6. precios postdescuento entran explícitamente al perfil EUR; VAT válido no introduce exención ni jurisdicción de mercado', () => {
    const fixture = fixtures();
    const es = pricing(fixture, 'ES'); const fr = pricing(fixture, 'FR');
    const requests = [taxRequest('r5.integration.tax-es', es.price.subtotal_cents), taxRequest('r5.integration.tax-fr', fr.price.subtotal_cents)];
    const adapter = createFixtureTaxAdapter({ adapterId: TAX_ADAPTER, cases: requests.map(request => taxResponse(request)) });
    const query = defineVatIdQuery({ schemaVersion: 1, id: 'r5.integration.vat-query', countryCode: 'ZZ', identifier: 'FICTIONALINTEGRATION' });
    const vat = createFixtureVatIdAdapter({ adapterId: 'r5.integration.vat', cases: [{ source: 'fixture', adapterId: 'r5.integration.vat',
      query, evidenceRef: 'r5.integration.vat-evidence', checkedAt: EARLIER, expiresAt: UNTIL, outcome: 'valid' }] });
    const emptyVat = createFixtureVatIdAdapter({ adapterId: vat.adapterId, cases: [] });
    const evaluations = [vat, emptyVat].map(source => evaluateVatIdEvidence({ expectedAdapterId: source.adapterId, query, at: AT, response: source.validate(query) }));
    expect(evaluations[0]).toMatchObject({ status: 'usable', outcome: 'valid' });
    expect(evaluations[1]).toMatchObject({ status: 'unusable', reason: 'not_configured', evidence: null });
    const expected = [{ netCents: 1765, taxCents: 221, grossCents: 1986 }, { netCents: 2325, taxCents: 291, grossCents: 2616 }];
    for (const [index, request] of requests.entries()) {
      const response = adapter.assess(request);
      const baseline = previewTaxCalculation({ request, expectedAdapterId: TAX_ADAPTER, response });
      expect(baseline.snapshot!.totals).toEqual(expected[index]);
      expect(baseline.snapshot!.lines[0]!.line.amountCents).toBe(index === 0 ? 1440 : 2000);
      for (const line of baseline.snapshot!.lines) expect(line.decision).toMatchObject({ treatment: 'taxable',
        rateBasisPoints: 1250, jurisdictionRef: 'r5.synthetic-tax-zone' });
      expect(baseline.snapshot!.policy).toEqual({ id: 'r5.synthetic-tax-policy', version: 7 });
      // No se acepta un contexto VAT/mercado como atajo para reemplazar decisiones del adaptador.
      for (const evaluation of evaluations) expect(() => previewTaxCalculation({ request, expectedAdapterId: TAX_ADAPTER, response, vat: evaluation })).toThrow(TaxContractError);
      expect(previewTaxCalculation({ request, expectedAdapterId: TAX_ADAPTER, response })).toEqual(baseline);
      expect(request).not.toHaveProperty('marketId'); expect(request).not.toHaveProperty('currencyCatalogRef');
    }
  });

  it('7. precio y mercado conocidos no rellenan impuestos ausentes: parcial conserva bienes y ausencia total mantiene snapshot null', () => {
    const fixture = fixtures();
    const priced = pricing(fixture, 'FR');
    const request = taxRequest('r5.integration.tax-pending', priced.price.subtotal_cents);
    const partialAdapter = createFixtureTaxAdapter({ adapterId: TAX_ADAPTER, cases: [taxResponse(request, true)] });
    const partial = previewTaxCalculation({ request, expectedAdapterId: TAX_ADAPTER, response: partialAdapter.assess(request) });
    expect(partial).toMatchObject({ outcome: 'unresolved', reason: 'line_unresolved', snapshot: { totals: null } });
    expect(partial.snapshot!.lines[0]).toMatchObject({ line: { id: 'goods', amountCents: 2000 }, netCents: 2000, taxCents: 250, grossCents: 2250 });
    expect(partial.snapshot!.lines[1]).toMatchObject({ line: { id: 'shipping', amountCents: 325 }, netCents: null, taxCents: null, grossCents: null });
    const emptyAdapter = createFixtureTaxAdapter({ adapterId: TAX_ADAPTER, cases: [] });
    const missing = previewTaxCalculation({ request, expectedAdapterId: TAX_ADAPTER, response: emptyAdapter.assess(request) });
    expect(missing).toMatchObject({ outcome: 'unresolved', reason: 'assessment_unavailable', snapshot: null });
    expect(missing.request).toEqual(request);
    expect(missing.response).not.toHaveProperty('policy');
    expect(pricing(fixture, 'FR')).toEqual(priced);
  });

  it('8. FX vigente, caducado e identidad solo cambian presentación; métodos usan original y rechazan JPY presentado como EUR nominal', () => {
    const fixture = fixtures();
    const current = fxRequest(fixture);
    const expired = fxRequest(fixture, 'JPY', 'r5.integration.presentment-expired');
    const adapter = createFixtureFxAdapter({ adapterId: FX_ADAPTER, cases: [fxQuote(current), fxQuote(expired, AT)] });
    const presented = previewCurrencyPresentment({ mode: 'fx', request: current, expectedAdapterId: FX_ADAPTER, response: adapter.quote(current) });
    const stale = previewCurrencyPresentment({ mode: 'fx', request: expired, expectedAdapterId: FX_ADAPTER, response: adapter.quote(expired) });
    const identity = previewCurrencyPresentment({ mode: 'identity', request: fxRequest(fixture, 'EUR', 'r5.integration.identity') });
    expect(presented).toMatchObject({ outcome: 'converted', presented: { currency: 'JPY', exponent: 0, amountMinor: 4760 } });
    expect(stale).toMatchObject({ outcome: 'unresolved', reason: 'expired', presented: null });
    expect(identity).toMatchObject({ outcome: 'identity', presented: { currency: 'EUR', exponent: 2, amountMinor: 2975 }, response: null });
    for (const marketId of ['ES', 'FR']) {
      const baseline = methods(fixture, marketId);
      for (const result of [presented, stale, identity]) {
        expect(result.original).toEqual(baseline.result.request.original);
        const rebuilt = previewLocalPaymentMethodsContext({ markets: fixture.markets, currencies: fixture.currencies,
          policy: fixture.methodPolicy, request: { ...baseline.result.request, original: result.original } });
        expect(rebuilt.result).toEqual(baseline.result);
      }
      expect(baseline.result.methods[0]).toMatchObject(marketId === 'ES'
        ? { outcome: 'available_in_fixture', reason: null } : { outcome: 'unavailable_in_fixture', reason: 'disabled' });
      expect(() => previewLocalPaymentMethodsContext({ markets: fixture.markets, currencies: fixture.currencies,
        policy: fixture.methodPolicy, request: { ...baseline.result.request, original: presented.presented } }))
        .toThrow(LocalPaymentMethodContractError);
    }
    expect(current.catalog).toEqual(fixture.currencies);
    expect(presented.original.amountMinor).toBe(2975);
  });

  it('9. un ID de mercado desconocido no usa fallback para precios, publicación ni métodos', () => {
    const fixture = fixtures();
    const markets = defineMarketCatalog({ ...fixture.markets, version: 4, fallback: { strategy: 'market', marketId: 'ES' } });
    const refs = { ...fixture.refs, marketCatalogRef: { id: markets.id, version: markets.version } };
    const withFallback = { ...fixture, markets, refs,
      methodPolicy: defineLocalPaymentMethodPolicy({ ...fixture.methodPolicy, version: 5, ...refs }) };
    const resolved = resolveMarketPricingContext({ catalog: withFallback.markets, selector: { by: 'id', marketId: 'ZZ' },
      baseCurrency: 'EUR', at: AT, channel: 'storefront' });
    expect(resolved).toMatchObject({ status: 'blocked', reason: 'market_unresolved', context: null,
      resolution: { outcome: 'unresolved', reason: 'unknown_market_id', selector: { by: 'id', marketId: 'ZZ' } } });
    expect(() => publication(withFallback, 'ZZ')).toThrow(MarketPublicationContractError);
    expect(() => methods(withFallback, 'ZZ')).toThrow(LocalPaymentMethodContractError);
    expect(methods(withFallback, 'ES').result.methods[0]!.outcome).toBe('available_in_fixture');
    expect(pricing(withFallback, 'ES').price.subtotal_cents).toBe(1440);
    expect(pricing(withFallback, 'FR').price.subtotal_cents).toBe(2000);
  });
});
