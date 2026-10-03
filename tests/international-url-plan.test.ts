import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  InternationalUrlPlanContractError, INTERNATIONAL_HREFLANG_PROFILE, MAX_INTERNATIONAL_URLS, planInternationalUrls,
} from '../src/modules/localization';

const SOURCE_AT = '2026-09-01T12:00:00.000Z';
const TRANSLATION_AT = '2026-09-02T12:00:00.000Z';
const UPDATED_AT = '2026-10-03T12:00:00.000Z';
const fields = (title = 'Guía publicada') => ({ title, summary: 'Resumen completo.', bodyPlainText: 'Contenido completo del ejemplo.' });

function content(id = 'guide', sourceRevision = 1) {
  return { schemaVersion: 1 as const, id, version: 5, sourceLocale: 'es-ES', updatedAt: UPDATED_AT,
    editions: [
      { locale: 'es-ES', draft: null, published: { revision: sourceRevision, sourceRevision: null,
        fields: fields(), publishedAt: SOURCE_AT } },
      { locale: 'en-US', draft: { revision: 3, sourceRevision: 1, fields: fields('New draft'), status: 'draft' as const },
        published: { revision: 2, sourceRevision: 1, fields: fields('Published guide'), publishedAt: TRANSLATION_AT } },
    ] };
}
function routes() {
  return [
    { locale: 'es-ES', origin: 'https://example.test', pathPrefix: '/es', hreflang: 'es' },
    { locale: 'en-US', origin: 'https://english.example.test', pathPrefix: '/en', hreflang: 'en-US' },
  ];
}
function bindings(sourceRevision = 1) {
  return [
    { contentId: 'guide', locale: 'es-ES', publishedRevision: sourceRevision, slug: 'guia' },
    { contentId: 'guide', locale: 'en-US', publishedRevision: 2, slug: 'guide' },
  ];
}
function input(overrides: Record<string, unknown> = {}) {
  return { contents: [content()], routes: routes(), bindings: bindings(),
    xDefaults: [{ contentId: 'guide', locale: 'es-ES' }], staleTranslations: 'include', ...overrides };
}

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('plan puro internacional R5.8a', () => {
  it('deriva canonical propia, alternates recíprocos+self y x-default explícito desde publicaciones', () => {
    const plan = planInternationalUrls(input());
    expect(plan.pages).toHaveLength(2);
    const alternateSet = [
      { hreflang: 'en-US', href: 'https://english.example.test/en/guide' },
      { hreflang: 'es', href: 'https://example.test/es/guia' },
      { hreflang: 'x-default', href: 'https://example.test/es/guia' },
    ];
    for (const page of plan.pages) {
      expect(page.canonical).toBe(page.url);
      expect(page.alternates).toEqual(alternateSet);
      expect(page.alternates.some((link) => link.href === page.url && link.hreflang !== 'x-default')).toBe(true);
      expect(page).toMatchObject({ contentId: 'guide', contentVersion: 5,
        publishedRevision: page.locale === 'es-ES' ? 1 : 2, freshness: 'current' });
    }
    expect(plan.exclusions).toEqual([]);
    expect(plan.sitemaps).toEqual([
      { origin: 'https://english.example.test', entries: [{ loc: 'https://english.example.test/en/guide', lastmod: TRANSLATION_AT }] },
      { origin: 'https://example.test', entries: [{ loc: 'https://example.test/es/guia', lastmod: SOURCE_AT }] },
    ]);
    expect(JSON.stringify(plan)).not.toContain('New draft');
    expect(JSON.stringify(plan)).not.toContain('bodyPlainText');
  });

  it('editar/revisar un borrador no cambia URL, revisión publicada ni lastmod', () => {
    const original = planInternationalUrls(input());
    const edited = content();
    edited.version += 1;
    edited.updatedAt = '2026-10-04T00:00:00.000Z';
    edited.editions[1]!.draft!.fields.title = 'Otro título todavía no publicado';
    const next = planInternationalUrls(input({ contents: [edited] }));
    expect(next.pages.map(({ url, canonical, publishedRevision, lastmod }) => ({ url, canonical, publishedRevision, lastmod })))
      .toEqual(original.pages.map(({ url, canonical, publishedRevision, lastmod }) => ({ url, canonical, publishedRevision, lastmod })));
    expect(next.pages[0]?.contentVersion).toBe(6);
  });

  it('conserva una publicación stale solo con include explícito y la señala sin fingir frescura', () => {
    const plan = planInternationalUrls(input({ contents: [content('guide', 4)], bindings: bindings(4) }));
    expect(plan.pages.find((page) => page.locale === 'en-US')).toMatchObject({ freshness: 'stale',
      publishedRevision: 2, lastmod: TRANSLATION_AT, url: 'https://english.example.test/en/guide' });
    expect(plan.pages.find((page) => page.locale === 'es-ES')?.freshness).toBe('current');
    expect(plan.exclusions).toEqual([]);
  });

  it('exclude retira stale de páginas, alternates y sitemap con diagnóstico preciso', () => {
    const plan = planInternationalUrls(input({ contents: [content('guide', 4)], bindings: bindings(4), staleTranslations: 'exclude' }));
    expect(plan.pages).toHaveLength(1);
    expect(plan.pages[0]?.locale).toBe('es-ES');
    expect(plan.pages[0]?.alternates).toEqual([
      { hreflang: 'es', href: 'https://example.test/es/guia' },
      { hreflang: 'x-default', href: 'https://example.test/es/guia' },
    ]);
    expect(plan.sitemaps).toHaveLength(1);
    expect(plan.exclusions).toEqual([{ contentId: 'guide', contentVersion: 5, locale: 'en-US', publishedRevision: 2, reason: 'stale' }]);
  });

  it('excluye traducción con fuente retirada incluso bajo include, sin fallback ni URL inventada', () => {
    const existing = content();
    const withdrawn = { ...existing, editions: existing.editions.map((edition) =>
      edition.locale === 'es-ES' ? { ...edition, published: null } : edition) };
    const plan = planInternationalUrls(input({ contents: [withdrawn], bindings: [bindings()[1]], xDefaults: [] }));
    expect(plan.pages).toEqual([]);
    expect(plan.sitemaps).toEqual([]);
    expect(plan.exclusions).toEqual([{ contentId: 'guide', contentVersion: 5, locale: 'en-US', publishedRevision: 2,
      reason: 'source_unpublished' }]);
  });

  it('sin bindings no publica automáticamente locales, rutas ni el fallback editorial', () => {
    expect(planInternationalUrls(input({ bindings: [], xDefaults: [] }))).toEqual({ pages: [], sitemaps: [], exclusions: [] });
    expect(() => planInternationalUrls(input({ bindings: [{ ...bindings()[0], locale: 'fr-FR' }],
      routes: [...routes(), { locale: 'fr-FR', origin: 'https://example.test', pathPrefix: '/fr', hreflang: 'fr' }] })))
      .toThrow(InternationalUrlPlanContractError);
  });

  it('rechaza binding a borrador o revisión distinta aunque exista una publicación anterior', () => {
    expect(() => planInternationalUrls(input({ bindings: [{ ...bindings()[1], publishedRevision: 3 }], xDefaults: [] })))
      .toThrow(InternationalUrlPlanContractError);
    const existing = content();
    const draftOnly = { ...existing, editions: existing.editions.map((edition) =>
      edition.locale === 'en-US' ? { ...edition, published: null } : edition) };
    expect(() => planInternationalUrls(input({ contents: [draftOnly] }))).toThrow(InternationalUrlPlanContractError);
    expect(() => planInternationalUrls(input({ bindings: [{ ...bindings()[0], publishedRevision: '1' }] })))
      .toThrow(InternationalUrlPlanContractError);
  });

  it('x-default exige una edición incluida y nunca sustituye un destino ausente o excluido', () => {
    for (const xDefaults of [
      [{ contentId: 'guide', locale: 'fr-FR' }],
      [{ contentId: 'missing', locale: 'es-ES' }],
      [{ contentId: 'guide', locale: 'es-ES' }, { contentId: 'guide', locale: 'en-US' }],
      [{ contentId: 'guide', locale: 'es-ES', url: 'https://outside.test' }],
    ]) expect(() => planInternationalUrls(input({ xDefaults }))).toThrow(InternationalUrlPlanContractError);
    expect(() => planInternationalUrls(input({ contents: [content('guide', 4)], bindings: bindings(4),
      staleTranslations: 'exclude', xDefaults: [{ contentId: 'guide', locale: 'en-US' }] })))
      .toThrow(InternationalUrlPlanContractError);
    expect(planInternationalUrls(input({ xDefaults: [] })).pages.every((page) => page.alternates.every((link) => link.hreflang !== 'x-default'))).toBe(true);
  });

  it('mantiene grupos de alternates por identidad de contenido, independientemente del slug', () => {
    const plan = planInternationalUrls(input({ contents: [content(), content('delivery')], bindings: [
      ...bindings(), { contentId: 'delivery', locale: 'es-ES', publishedRevision: 1, slug: 'envios' },
    ] }));
    const delivery = plan.pages.find((page) => page.contentId === 'delivery')!;
    expect(delivery.alternates).toEqual([{ hreflang: 'es', href: 'https://example.test/es/envios' }]);
    for (const page of plan.pages.filter((item) => item.contentId === 'guide')) {
      expect(page.alternates.some((link) => link.href === delivery.url)).toBe(false);
    }
  });

  it('detecta colisiones entre contenidos, locales y formas Unicode equivalentes', () => {
    expect(() => planInternationalUrls(input({ contents: [content(), content('other')], bindings: [
      ...bindings(), { ...bindings()[0], contentId: 'other' },
    ] }))).toThrow(InternationalUrlPlanContractError);
    const samePrefix = routes();
    samePrefix[1]!.origin = samePrefix[0]!.origin;
    samePrefix[1]!.pathPrefix = samePrefix[0]!.pathPrefix;
    expect(() => planInternationalUrls(input({ routes: samePrefix,
      bindings: bindings().map((binding) => ({ ...binding, slug: 'same' })) }))).toThrow(InternationalUrlPlanContractError);
    expect(() => planInternationalUrls(input({ contents: [content(), content('other')], bindings: [
      { ...bindings()[0], slug: 'café' }, { ...bindings()[0], contentId: 'other', slug: 'cafe\u0301' },
    ] }))).toThrow(InternationalUrlPlanContractError);
  });

  it('detecta conflictos latentes incluso si la política excluiría un binding stale', () => {
    const samePrefix = routes();
    samePrefix[1]!.origin = samePrefix[0]!.origin;
    samePrefix[1]!.pathPrefix = samePrefix[0]!.pathPrefix;
    expect(() => planInternationalUrls(input({ routes: samePrefix, contents: [content('guide', 4)],
      staleTranslations: 'exclude', bindings: bindings(4).map((binding) => ({ ...binding, slug: 'same' })) })))
      .toThrow(InternationalUrlPlanContractError);
  });

  it('codifica segmentos Unicode literales y admite inicio de prefijo sin barras finales falsas', () => {
    const unicode = planInternationalUrls(input({ bindings: [{ ...bindings()[0], slug: 'cafe\u0301' }],
      routes: [{ ...routes()[0], pathPrefix: '/es/catálogo' }] }));
    expect(unicode.pages[0]?.url).toBe('https://example.test/es/cat%C3%A1logo/caf%C3%A9');
    const root = planInternationalUrls(input({ bindings: [{ ...bindings()[0], slug: '' }],
      routes: [{ ...routes()[0], pathPrefix: '/' }] }));
    expect(root.pages[0]?.url).toBe('https://example.test/');
    const prefix = planInternationalUrls(input({ bindings: [{ ...bindings()[0], slug: '' }] }));
    expect(prefix.pages[0]?.url).toBe('https://example.test/es');
  });

  it.each([
    'http://example.test', '//example.test', 'https://EXAMPLE.test', 'https://example.test/',
    'https://user:pass@example.test', 'https://example.test:8443', 'https://example.test:443',
    'https://example.test/path', 'https://example.test?x=1', 'https://example.test#part',
    'https://example.test.', 'https://127.0.0.1', 'https://localhost', 'javascript:alert(1)',
  ])('rechaza origen no canónico o inseguro %s', (origin) => {
    expect(() => planInternationalUrls(input({ routes: [{ ...routes()[0], origin }] }))).toThrow(InternationalUrlPlanContractError);
  });

  it.each(['', 'es', '/es/', '//outside.test', '/a//b', '/../es', '/%2e%2e', '/a?x', '/a#b', '/a\\b', '/a b'])
    ('rechaza subruta ambigua %s', (pathPrefix) => {
      expect(() => planInternationalUrls(input({ routes: [{ ...routes()[0], pathPrefix }] }))).toThrow(InternationalUrlPlanContractError);
    });

  it.each(['.', '..', '../escape', '/escape', 'a/b', 'a\\b', '%2F', 'a?b', 'a#b', 'a b', '<script>', 'a\u0000b'])
    ('rechaza slug que escapa del segmento literal %s', (slug) => {
      expect(() => planInternationalUrls(input({ bindings: [{ ...bindings()[0], slug }] }))).toThrow(InternationalUrlPlanContractError);
    });

  it('separa locale de hreflang y exige una correspondencia explícita admisible', () => {
    const original = content();
    const latinAmerican = { ...original, sourceLocale: 'es-419', editions: original.editions.map((edition) =>
      edition.locale === 'es-ES' ? { ...edition, locale: 'es-419' } : edition) };
    const planInput = input({ contents: [latinAmerican], routes: [{ ...routes()[0], locale: 'es-419', hreflang: 'es' }],
      bindings: [{ ...bindings()[0], locale: 'es-419' }], xDefaults: [] });
    expect(planInternationalUrls(planInput).pages[0]?.alternates[0]?.hreflang).toBe('es');
    for (const hreflang of ['es-419', 'x-default', 'en', 'es-ES-u-nu-latn']) {
      expect(() => planInternationalUrls({ ...planInput, routes: [{ ...routes()[0], locale: 'es-419', hreflang }] }))
        .toThrow(InternationalUrlPlanContractError);
    }
  });

  it('rechaza hreflang repetido para dos ediciones del mismo contenido', () => {
    const original = content();
    const localized = { ...original, editions: original.editions.map((edition) =>
      edition.locale === 'en-US' ? { ...edition, locale: 'es-MX' } : edition) };
    expect(() => planInternationalUrls(input({ contents: [localized], routes: [
      routes()[0], { ...routes()[1], locale: 'es-MX', hreflang: 'es' },
    ], bindings: [bindings()[0], { ...bindings()[1], locale: 'es-MX' }] }))).toThrow(InternationalUrlPlanContractError);
  });

  it.each(['en-EU', 'en-UN', 'en-XX', 'en-XK', 'en-Abcd', 'en-Grek', 'zz'])
    ('no emite códigos SEO fuera del vocabulario técnico: %s', (hreflang) => {
      expect(() => planInternationalUrls(input({ routes: [{ ...routes()[1], hreflang }] })))
        .toThrow(InternationalUrlPlanContractError);
    });

  it('declara su perfil SEO cerrado y conserva aliases canónicos admitidos', () => {
    expect(INTERNATIONAL_HREFLANG_PROFILE.id).toBe('iso-alpha2-script-subset-v1');
    expect(new Set(INTERNATIONAL_HREFLANG_PROFILE.languageCodes).size).toBe(184);
    expect(new Set(INTERNATIONAL_HREFLANG_PROFILE.regionCodes).size).toBe(249);
    expect(INTERNATIONAL_HREFLANG_PROFILE.scriptCodes).toEqual(['Arab', 'Cyrl', 'Hans', 'Hant', 'Latn']);
    expect(INTERNATIONAL_HREFLANG_PROFILE.languageAliases).toEqual({ fil: 'tl' });
    expect(Object.isFrozen(INTERNATIONAL_HREFLANG_PROFILE)).toBe(true);
    expect(Object.isFrozen(INTERNATIONAL_HREFLANG_PROFILE.languageCodes)).toBe(true);
    expect(Object.isFrozen(INTERNATIONAL_HREFLANG_PROFILE.regionCodes)).toBe(true);
    expect(Object.isFrozen(INTERNATIONAL_HREFLANG_PROFILE.scriptCodes)).toBe(true);
    expect(Object.isFrozen(INTERNATIONAL_HREFLANG_PROFILE.languageAliases)).toBe(true);
    const british = planInternationalUrls(input({ routes: [{ ...routes()[1], hreflang: 'en-UK' }],
      bindings: [bindings()[1]], xDefaults: [] }));
    expect(british.pages[0]?.alternates).toEqual([{ hreflang: 'en-GB', href: 'https://english.example.test/en/guide' }]);
  });

  it.each(['tl', 'fil'])('conserva el hreflang ISO tl al canonicalizar el locale %s como fil', (hreflang) => {
    const original = content();
    const tagalog = { ...original, sourceLocale: 'tl', editions: original.editions.map((edition) =>
      edition.locale === 'es-ES' ? { ...edition, locale: 'tl' } : edition) };
    const plan = planInternationalUrls(input({ contents: [tagalog],
      routes: [{ ...routes()[0], locale: 'fil', hreflang }],
      bindings: [{ ...bindings()[0], locale: 'tl' }], xDefaults: [] }));
    expect(plan.pages[0]?.locale).toBe('fil');
    expect(plan.pages[0]?.alternates).toEqual([{ hreflang: 'tl', href: 'https://example.test/es/guia' }]);
  });

  it('aplica el límite del locale también después de expandir un alias canónico', () => {
    const alias = `sh-${Array.from({ length: 16 }, (_, index) => `a${String(index).padStart(4, '0')}`).join('-')}`;
    expect(alias.length).toBeLessThanOrEqual(100);
    expect(Intl.getCanonicalLocales(alias)[0]!.length).toBeGreaterThan(100);
    expect(() => planInternationalUrls(input({ routes: [{ ...routes()[0], locale: alias, hreflang: 'sr' }] })))
      .toThrow(InternationalUrlPlanContractError);
  });

  it('rechaza duplicados, referencias desconocidas y configuraciones forjadas', () => {
    for (const override of [
      { contents: [content(), content()] }, { routes: [...routes(), routes()[0]] },
      { bindings: [...bindings(), bindings()[0]] }, { bindings: [{ ...bindings()[0], contentId: 'missing' }] },
      { bindings: [{ ...bindings()[0], canonical: 'https://outside.test' }] },
      { routes: [{ ...routes()[0], active: true }] }, { resolution: { outcome: 'fallback' } },
      { staleTranslations: undefined }, { staleTranslations: 'automatic' },
    ]) expect(() => planInternationalUrls(input(override))).toThrow(InternationalUrlPlanContractError);
  });

  it('valida completitud editorial; ni un objeto published forjado crea una URL', () => {
    const incomplete = content();
    incomplete.editions[0]!.published.fields.title = '';
    expect(() => planInternationalUrls(input({ contents: [incomplete] }))).toThrow();
  });

  it('rechaza accesores, arrays con huecos y exceso de bindings sin ejecutar getters', () => {
    const getter = vi.fn(() => bindings());
    expect(() => planInternationalUrls({ ...input(), get bindings() { return getter(); } })).toThrow(InternationalUrlPlanContractError);
    expect(getter).not.toHaveBeenCalled();
    const sparse = new Array(1);
    expect(() => planInternationalUrls(input({ bindings: sparse }))).toThrow(InternationalUrlPlanContractError);
    expect(() => planInternationalUrls(input({ bindings: Array.from({ length: MAX_INTERNATIONAL_URLS + 1 }, () => bindings()[0]) })))
      .toThrow(InternationalUrlPlanContractError);
  });

  it('copia entradas, congela cada resultado y no depende del orden de los registros', () => {
    const configuration = input();
    const plan = planInternationalUrls(configuration);
    configuration.bindings[0]!.slug = 'cambio-local';
    configuration.routes[0]!.origin = 'https://changed.test';
    expect(plan.pages.find((page) => page.locale === 'es-ES')?.url).toBe('https://example.test/es/guia');
    const reversed = planInternationalUrls(input({ contents: [content()], routes: routes().reverse(), bindings: bindings().reverse() }));
    expect(reversed).toEqual(plan);
    for (const value of [plan, plan.pages, plan.pages[0], plan.pages[0]!.alternates, plan.pages[0]!.alternates[0],
      plan.sitemaps, plan.sitemaps[0], plan.sitemaps[0]!.entries, plan.sitemaps[0]!.entries[0], plan.exclusions]) {
      expect(Object.isFrozen(value)).toBe(true);
    }
    expect(() => { (plan.pages[0]! as { canonical: string }).canonical = 'https://changed.test'; }).toThrow();
  });

  it('no consulta fecha actual, red, almacenamiento ni temporizadores', () => {
    const expected = planInternationalUrls(input());
    const unexpected = () => { throw new Error('Unexpected external effect'); };
    vi.spyOn(Date, 'now').mockImplementation(unexpected);
    vi.stubGlobal('fetch', unexpected);
    vi.stubGlobal('localStorage', { getItem: unexpected, setItem: unexpected });
    vi.stubGlobal('sessionStorage', { getItem: unexpected, setItem: unexpected });
    vi.stubGlobal('setTimeout', unexpected);
    expect(planInternationalUrls(input())).toEqual(expected);
  });
});
