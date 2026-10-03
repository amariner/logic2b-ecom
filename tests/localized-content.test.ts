import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  applyLocalizedContentCommand, defineLocalizedContent, resolveLocalizedContent,
  LocalizedContentContractError, LOCALIZED_TEXT_LIMITS, MAX_LOCALIZED_EDITIONS,
  type LocalizedContent, type LocalizedContentCommand, type LocalizedContentSelection, type LocalizedFields,
} from '../src/modules/localization';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const START = '2026-10-03T10:00:00.000Z';
const at = (seconds: number) => new Date(Date.parse(START) + seconds * 1_000).toISOString();
const text = (overrides: Partial<LocalizedFields> = {}): LocalizedFields => ({
  title: 'Título ilustrativo', summary: 'Resumen ilustrativo', bodyPlainText: 'Contenido sintético.\nSin datos operativos.', ...overrides,
});
const empty = (overrides: Partial<LocalizedContent> = {}): LocalizedContent => ({
  schemaVersion: 1, id: 'fixture.article', version: 1, updatedAt: START, sourceLocale: 'es-ES',
  editions: [{ locale: 'es-ES', draft: null, published: null }], ...overrides,
});
type Step = Omit<Extract<LocalizedContentCommand, { action: 'save_draft' }>, 'expectedVersion' | 'occurredAt'>
  | Readonly<{ action: 'submit_review' | 'publish' | 'unpublish'; locale: string }>;
function step(content: LocalizedContent, command: Step): LocalizedContent {
  const result = applyLocalizedContentCommand(content, { ...command, expectedVersion: content.version, occurredAt: at(content.version) });
  expect(result.outcome).toBe('applied');
  return result.content;
}
function publish(content: LocalizedContent, locale: string, fields = text()): LocalizedContent {
  const sourceRevision = locale === content.sourceLocale ? null : content.editions.find((item) => item.locale === content.sourceLocale)!.published!.revision;
  let current = step(content, { action: 'save_draft', locale, sourceRevision, fields });
  current = step(current, { action: 'submit_review', locale });
  return step(current, { action: 'publish', locale });
}
const sourcePublished = () => publish(empty(), 'es-ES');
const translated = () => publish(sourcePublished(), 'ca-ES', text({ title: 'Títol il·lustratiu' }));
const edition = (content: LocalizedContent, locale = 'es-ES') => content.editions.find((item) => item.locale === locale)!;
const selection = (overrides: Partial<LocalizedContentSelection> = {}): LocalizedContentSelection => ({
  requestedLocale: 'es-ES', fallback: { strategy: 'none' }, staleTranslations: 'exclude', ...overrides,
});

describe('artefacto editorial localizado y contrato estricto', () => {
  it('preserva identidad, canonicaliza locales y ordena copias profundamente inmutables', () => {
    const input = structuredClone(translated());
    const normalized = defineLocalizedContent({ ...input, sourceLocale: 'es-es', editions: [...input.editions].reverse() });
    expect(normalized.id).toBe('fixture.article');
    expect(normalized.sourceLocale).toBe('es-ES');
    expect(normalized.editions.map((item) => item.locale)).toEqual(['ca-ES', 'es-ES']);
    expect(defineLocalizedContent(normalized)).toEqual(normalized);
    (input.editions[0]!.published!.fields as { title: string }).title = 'Cambiar entrada no cambia la copia';
    expect(normalized.editions[0]!.published!.fields.title).toBe('Títol il·lustratiu');
    for (const value of [normalized, normalized.editions, normalized.editions[0], normalized.editions[0]!.published,
      normalized.editions[0]!.published!.fields]) expect(Object.isFrozen(value)).toBe(true);
    expect(() => { (normalized.editions as unknown[]).pop(); }).toThrow();
  });

  it('exige todo el sobre y no admite mercados, slugs, propietarios o schemas de campos adicionales', () => {
    for (const key of Object.keys(empty())) {
      const incomplete = { ...empty() } as Record<string, unknown>;
      delete incomplete[key];
      expect(() => defineLocalizedContent(incomplete)).toThrow(LocalizedContentContractError);
    }
    for (const extra of ['marketId', 'slug', 'actorId', 'fieldSchema']) {
      expect(() => defineLocalizedContent({ ...empty(), [extra]: 'extra' })).toThrow(LocalizedContentContractError);
    }
  });

  it.each([
    ['schemaVersion', 2], ['schemaVersion', '1'], ['id', ''], ['id', 'ARTICLE'], ['id', 'article/slugs'], ['id', 'a'.repeat(101)],
    ['version', 0], ['version', 1.5], ['version', Number.MAX_SAFE_INTEGER + 1], ['updatedAt', '2026-10-03'],
    ['updatedAt', '2026-10-03T10:00:00Z'], ['updatedAt', '+002026-10-03T10:00:00.000Z'], ['updatedAt', '2026-02-30T00:00:00.000Z'],
    ['sourceLocale', ''], ['sourceLocale', 'es_ES'], ['sourceLocale', 'es-ES-u-cu-eur'], ['sourceLocale', 'es-x-private'],
  ])('rechaza %s=%s fuera del contrato', (field, value) => {
    expect(() => defineLocalizedContent({ ...empty(), [field]: value })).toThrow(LocalizedContentContractError);
  });

  it('requiere una fuente declarada y locales únicos después de canonicalizar', () => {
    expect(() => defineLocalizedContent(empty({ sourceLocale: 'fr-FR' }))).toThrow(/fuente|sourceLocale/);
    expect(() => defineLocalizedContent(empty({ editions: [...empty().editions, { locale: 'ES-es', draft: null, published: null }] })))
      .toThrow(/duplicados/);
    const longAlias = `sh-${Array.from({ length: 16 }, (_, index) => String.fromCharCode(97 + index).repeat(index === 15 ? 7 : 5)).join('-')}`;
    expect(() => defineLocalizedContent(empty({ sourceLocale: longAlias }))).toThrow(/canónica/);
  });

  it('limita ediciones y permite declarar un idioma todavía sin textos ni publicación', () => {
    const locales = ['es-ES', 'ca-ES', 'en-GB', 'fr-FR', 'de-DE', 'it-IT', 'pt-PT', 'nl-NL', 'sv-SE', 'no-NO',
      'da-DK', 'fi-FI', 'pl-PL', 'cs-CZ', 'sk-SK', 'ro-RO', 'hu-HU', 'el-GR', 'tr-TR', 'uk-UA'];
    const editions = locales.map((locale) => ({ locale, draft: null, published: null }));
    expect(editions).toHaveLength(MAX_LOCALIZED_EDITIONS);
    expect(defineLocalizedContent(empty({ editions })).editions).toHaveLength(MAX_LOCALIZED_EDITIONS);
    expect(() => defineLocalizedContent(empty({ editions: [...editions, { locale: 'ja-JP', draft: null, published: null }] }))).toThrow(/ediciones/);
    expect(() => defineLocalizedContent(empty({ editions: [] }))).toThrow(/ediciones/);
  });

  it('admite borrador incompleto, pero review y published exigen la unidad editorial completa', () => {
    const draft = step(empty(), { action: 'save_draft', locale: 'es-ES', sourceRevision: null, fields: text({ summary: '' }) });
    expect(edition(draft).draft?.fields.summary).toBe('');
    const result = applyLocalizedContentCommand(draft, { action: 'submit_review', locale: 'es-ES', expectedVersion: draft.version, occurredAt: at(10) });
    expect(result).toMatchObject({ outcome: 'blocked', reason: 'content_incomplete', content: draft });
    expect(() => defineLocalizedContent({ ...draft, editions: [{ ...edition(draft), draft: { ...edition(draft).draft!, status: 'review' } }] }))
      .toThrow(/completos/);
    const published = sourcePublished();
    expect(() => defineLocalizedContent({ ...published, editions: [{ ...edition(published), published: {
      ...edition(published).published!, fields: text({ bodyPlainText: ' \n\t ' }),
    } }] })).toThrow(/completos/);
  });

  it('conserva texto plano literal y rechaza tipos, controles y longitudes fuera del perfil fijo', () => {
    const values = text({ title: 't'.repeat(LOCALIZED_TEXT_LIMITS.title), summary: 's'.repeat(LOCALIZED_TEXT_LIMITS.summary),
      bodyPlainText: 'b'.repeat(LOCALIZED_TEXT_LIMITS.bodyPlainText) });
    expect(edition(publish(empty(), 'es-ES', values)).published?.fields).toEqual(values);
    expect(edition(publish(empty(), 'es-ES', text({ bodyPlainText: '<b>Texto literal</b>\nLínea 2' }))).published?.fields.bodyPlainText)
      .toBe('<b>Texto literal</b>\nLínea 2');
    for (const field of ['title', 'summary', 'bodyPlainText'] as const) {
      for (const value of [null, 42, 'x'.repeat(LOCALIZED_TEXT_LIMITS[field] + 1), 'control\u0000']) {
        expect(() => applyLocalizedContentCommand(empty(), { action: 'save_draft', locale: 'es-ES', sourceRevision: null,
          expectedVersion: 1, occurredAt: at(1), fields: { ...text(), [field]: value } })).toThrow(LocalizedContentContractError);
      }
    }
  });

  it('rechaza revisiones duplicadas, futuras, invertidas y referencias fuente incoherentes', () => {
    const content = translated();
    const source = edition(content);
    const translation = edition(content, 'ca-ES');
    const invalidEditions = [
      [source, { ...translation, published: { ...translation.published!, revision: source.published!.revision } }],
      [source, { ...translation, published: { ...translation.published!, revision: content.version + 1 } }],
      [source, { ...translation, published: { ...translation.published!, sourceRevision: null } }],
      [source, { ...translation, published: { ...translation.published!, sourceRevision: translation.published!.revision } }],
      [source, { ...translation, published: { ...translation.published!, sourceRevision: source.published!.revision + 1 } }],
      [{ ...source, published: { ...source.published!, sourceRevision: 1 } }, translation],
      [{ ...source, draft: { revision: source.published!.revision - 1, sourceRevision: null, fields: text(), status: 'draft' } }, translation],
    ];
    for (const editions of invalidEditions) expect(() => defineLocalizedContent({ ...content, editions })).toThrow(LocalizedContentContractError);
  });

  it('no admite publicaciones posteriores a updatedAt ni traducciones vigentes anteriores a su fuente', () => {
    const content = translated();
    expect(() => defineLocalizedContent({ ...content, updatedAt: START })).toThrow(/preceder/);
    expect(() => defineLocalizedContent({ ...content, editions: content.editions.map((item) => item.locale === 'ca-ES'
      ? { ...item, published: { ...item.published!, publishedAt: START } } : item) })).toThrow(/antes/);
    const stale = publish(content, 'es-ES', text({ title: 'Nueva fuente' }));
    expect(edition(stale, 'ca-ES').published!.publishedAt < edition(stale).published!.publishedAt).toBe(true);
    expect(() => defineLocalizedContent(stale)).not.toThrow();
  });

  it('rechaza estructuras hostiles sin invocar getters de ninguna revisión o campo', () => {
    const getter = vi.fn(() => 'es-ES');
    const content = sourcePublished();
    const source = edition(content);
    const malformed = [
      Object.create(content), Object.assign({ ...content }, { [Symbol('extra')]: true }),
      Object.defineProperty({ ...content }, 'id', { enumerable: true, get: getter }),
      Object.defineProperty({ ...content }, 'hidden', { value: true }),
      { ...content, editions: Array(1) },
      { ...content, editions: Object.assign([source], { extra: true }) },
      { ...content, editions: Object.defineProperty([source], '0', { enumerable: true, get: getter }) },
      { ...content, editions: [Object.defineProperty({ ...source }, 'published', { enumerable: true, get: getter })] },
      { ...content, editions: [{ ...source, published: { ...source.published!, fields: Object.defineProperty(text(), 'title', { enumerable: true, get: getter }) } }] },
    ];
    for (const input of malformed) expect(() => defineLocalizedContent(input)).toThrow(LocalizedContentContractError);
    expect(getter).not.toHaveBeenCalled();
    expect(() => defineLocalizedContent(Object.assign(Object.create(null), content))).not.toThrow();
  });
});

describe('transiciones editoriales puras con versión y tiempo explícitos', () => {
  it('recorre draft → review → published y fija la fecha de publicación solo en el último paso', () => {
    const initial = empty();
    const draft = step(initial, { action: 'save_draft', locale: 'es-ES', sourceRevision: null, fields: text() });
    expect(draft).toMatchObject({ version: 2, updatedAt: at(1) });
    expect(edition(draft)).toMatchObject({ draft: { revision: 2, status: 'draft' }, published: null });
    const reviewed = step(draft, { action: 'submit_review', locale: 'es-ES' });
    expect(reviewed.version).toBe(3);
    expect(edition(reviewed)).toMatchObject({ draft: { revision: 2, status: 'review' }, published: null });
    const published = step(reviewed, { action: 'publish', locale: 'es-ES' });
    expect(published).toMatchObject({ id: initial.id, sourceLocale: initial.sourceLocale, version: 4, updatedAt: at(3) });
    expect(edition(published)).toEqual({ locale: 'es-ES', draft: null,
      published: { revision: 2, sourceRevision: null, fields: text(), publishedAt: at(3) } });
    expect(initial).toEqual(empty());
  });

  it('editar y enviar a review conserva exactamente la publicación anterior y su lastmod', () => {
    const content = translated();
    const oldPublication = edition(content).published;
    const draft = step(content, { action: 'save_draft', locale: 'es-ES', sourceRevision: null, fields: text({ title: 'Título en preparación' }) });
    const reviewed = step(draft, { action: 'submit_review', locale: 'es-ES' });
    for (const current of [draft, reviewed]) {
      expect(edition(current).published).toEqual(oldPublication);
      expect(resolveLocalizedContent(current, selection())).toMatchObject({ outcome: 'matched', publication: oldPublication });
      expect(resolveLocalizedContent(current, selection({ requestedLocale: 'ca-ES' }))).toMatchObject({ outcome: 'matched', freshness: 'current' });
    }
    expect(reviewed.updatedAt).not.toBe(oldPublication?.publishedAt);
  });

  it('guardar otra edición invalida review pero preserva el snapshot publicado', () => {
    const published = sourcePublished();
    let current = step(published, { action: 'save_draft', locale: 'es-ES', sourceRevision: null, fields: text() });
    current = step(current, { action: 'submit_review', locale: 'es-ES' });
    const previousRevision = edition(current).draft!.revision;
    current = step(current, { action: 'save_draft', locale: 'es-ES', sourceRevision: null, fields: text({ title: 'Otro borrador' }) });
    expect(edition(current).draft!.revision).toBeGreaterThan(previousRevision);
    expect(edition(current).draft!.status).toBe('draft');
    expect(edition(current).published).toEqual(edition(published).published);
    expect(applyLocalizedContentCommand(current, { action: 'publish', locale: 'es-ES', expectedVersion: current.version, occurredAt: at(20) }))
      .toMatchObject({ outcome: 'blocked', reason: 'review_required' });
  });

  it('sourceRevision apunta a la publicación fuente, no a version del artefacto o al borrador', () => {
    const content = sourcePublished();
    const rejected = applyLocalizedContentCommand(content, { action: 'save_draft', locale: 'ca-ES', sourceRevision: content.version,
      fields: text(), expectedVersion: content.version, occurredAt: at(10) });
    expect(rejected).toMatchObject({ outcome: 'blocked', reason: 'source_revision_mismatch', content });
    const accepted = step(content, { action: 'save_draft', locale: 'ca-ES', sourceRevision: edition(content).published!.revision, fields: text() });
    expect(edition(accepted, 'ca-ES').draft!.sourceRevision).toBe(2);
  });

  it('revalida la fuente al publicar: una nueva publicación invalida el draft traducido incluso en review', () => {
    let current = step(translated(), { action: 'save_draft', locale: 'ca-ES', sourceRevision: 2, fields: text({ title: 'Traducción preparada' }) });
    current = step(current, { action: 'submit_review', locale: 'ca-ES' });
    current = publish(current, 'es-ES', text({ title: 'Fuente nueva' }));
    const oldTranslation = edition(current, 'ca-ES').published;
    expect(applyLocalizedContentCommand(current, { action: 'publish', locale: 'ca-ES', expectedVersion: current.version, occurredAt: at(50) }))
      .toMatchObject({ outcome: 'blocked', reason: 'source_revision_mismatch', content: current });
    expect(resolveLocalizedContent(current, selection({ requestedLocale: 'ca-ES', staleTranslations: 'include' })))
      .toMatchObject({ outcome: 'matched', freshness: 'stale', publication: oldTranslation });
    const rebased = publish(current, 'ca-ES', text({ title: 'Nueva traducción revisada' }));
    expect(resolveLocalizedContent(rebased, selection({ requestedLocale: 'ca-ES' }))).toMatchObject({ outcome: 'matched', freshness: 'current' });
  });

  it('retirar y republicar no reutiliza una revisión ni revive bindings de una publicación retirada', () => {
    const content = sourcePublished();
    const firstRevision = edition(content).published!.revision;
    const withdrawn = step(content, { action: 'unpublish', locale: 'es-ES' });
    expect(withdrawn.version).toBe(content.version + 1);
    expect(edition(withdrawn)).toMatchObject({ draft: null, published: null });
    expect(resolveLocalizedContent(withdrawn, selection())).toMatchObject({ outcome: 'unresolved', reason: 'not_published' });
    const republished = publish(withdrawn, 'es-ES');
    expect(edition(republished).published!.revision).toBeGreaterThan(firstRevision);
    expect(edition(republished).published!.revision).toBe(withdrawn.version + 1);
  });

  it('retirar una publicación conserva el borrador posterior pero no lo publica implícitamente', () => {
    const content = step(sourcePublished(), { action: 'save_draft', locale: 'es-ES', sourceRevision: null, fields: text({ title: 'Borrador posterior' }) });
    const withdrawn = step(content, { action: 'unpublish', locale: 'es-ES' });
    expect(edition(withdrawn).published).toBeNull();
    expect(edition(withdrawn).draft).toEqual(edition(content).draft);
    expect(resolveLocalizedContent(withdrawn, selection())).toMatchObject({ outcome: 'unresolved' });
  });

  it('retirar la fuente conserva traducciones, pero impide resolverlas y publicar nuevas hasta restablecerla', () => {
    const content = translated();
    const withdrawn = step(content, { action: 'unpublish', locale: 'es-ES' });
    expect(edition(withdrawn, 'ca-ES').published).toEqual(edition(content, 'ca-ES').published);
    for (const staleTranslations of ['include', 'exclude'] as const) {
      expect(resolveLocalizedContent(withdrawn, selection({ requestedLocale: 'ca-ES', staleTranslations })))
        .toMatchObject({ outcome: 'unresolved', reason: 'source_unpublished' });
    }
    expect(applyLocalizedContentCommand(withdrawn, { action: 'save_draft', locale: 'ca-ES', sourceRevision: 2,
      fields: text(), expectedVersion: withdrawn.version, occurredAt: at(20) })).toMatchObject({ outcome: 'blocked', reason: 'source_unpublished' });
    const restored = publish(withdrawn, 'es-ES');
    expect(resolveLocalizedContent(restored, selection({ requestedLocale: 'ca-ES', staleTranslations: 'include' })))
      .toMatchObject({ outcome: 'matched', freshness: 'stale' });
  });

  it('detecta carreras y replay sobre un artefacto posterior mediante expectedVersion sin escribir', () => {
    const initial = empty();
    const command = { action: 'save_draft', locale: 'es-ES', sourceRevision: null, fields: text(), expectedVersion: 1, occurredAt: at(1) };
    const applied = applyLocalizedContentCommand(initial, command);
    expect(applied.outcome).toBe('applied');
    expect(applyLocalizedContentCommand(applied.content, command)).toEqual({ outcome: 'conflict', content: applied.content });
    expect(applyLocalizedContentCommand(applied.content, { ...command, fields: text({ title: 'Carrera perdedora' }) }))
      .toEqual({ outcome: 'conflict', content: applied.content });
    expect(initial).toEqual(empty());
  });

  it('rechaza tiempos regresivos y desbordamiento de versión sin alterar el artefacto', () => {
    const content = sourcePublished();
    expect(() => applyLocalizedContentCommand(content, { action: 'unpublish', locale: 'es-ES', expectedVersion: content.version, occurredAt: START }))
      .toThrow(/retroceder/);
    const maximum = empty({ version: Number.MAX_SAFE_INTEGER });
    expect(() => applyLocalizedContentCommand(maximum, { action: 'save_draft', locale: 'es-ES', expectedVersion: maximum.version,
      occurredAt: START, sourceRevision: null, fields: text() })).toThrow(/entero positivo seguro/);
    expect(edition(content).published!.publishedAt).toBe(at(3));
  });

  it.each([
    [{ action: 'publish', locale: 'es-ES' }, 'draft_missing'],
    [{ action: 'submit_review', locale: 'ca-ES' }, 'edition_missing'],
    [{ action: 'unpublish', locale: 'es-ES' }, 'published_missing'],
  ])('diagnostica una transición imposible %j', (command, reason) => {
    expect(applyLocalizedContentCommand(empty(), { ...command, expectedVersion: 1, occurredAt: at(1) }))
      .toMatchObject({ outcome: 'blocked', reason, content: empty() });
  });

  it('rechaza comandos incompletos, reloj implícito, autoridad ficticia y getters antes de aplicar', () => {
    const getter = vi.fn(() => 'publish');
    const base = { action: 'publish', locale: 'es-ES', expectedVersion: 1, occurredAt: at(1) };
    const invalidCommands = [
      { action: 'approve', locale: 'es-ES', expectedVersion: 1, occurredAt: at(1) },
      { action: 'publish', locale: 'es-ES', expectedVersion: 1 },
      { ...base, publishedAt: at(2) }, { ...base, actorId: 'admin' }, { ...base, expectedVersion: 0 },
      { ...base, occurredAt: 'now' }, { ...base, locale: 'es_ES' },
      Object.defineProperty({ ...base }, 'action', { enumerable: true, get: getter }),
    ];
    for (const input of invalidCommands) expect(() => applyLocalizedContentCommand(empty(), input)).toThrow(LocalizedContentContractError);
    expect(getter).not.toHaveBeenCalled();
  });
});

describe('selección publicada y fallback editorial explícito', () => {
  it('devuelve una publicación completa en el locale solicitado con identidad y versión de contenido', () => {
    const content = translated();
    expect(resolveLocalizedContent(content, selection({ requestedLocale: 'CA-es' }))).toEqual({
      contentId: content.id, contentVersion: content.version, requestedLocale: 'ca-ES', outcome: 'matched',
      resolvedLocale: 'ca-ES', publication: edition(content, 'ca-ES').published, freshness: 'current',
    });
  });

  it('resuelve fallback terminal sin mezclar campos del borrador, renombrar idioma ni crear una traducción', () => {
    const draft = step(sourcePublished(), { action: 'save_draft', locale: 'fr-FR', sourceRevision: 2,
      fields: text({ title: 'Titre en brouillon', summary: '' }) });
    const result = resolveLocalizedContent(draft, selection({ requestedLocale: 'fr-FR', fallback: { strategy: 'locale', locale: 'es-ES' } }));
    expect(result).toEqual({ contentId: draft.id, contentVersion: draft.version, requestedLocale: 'fr-FR',
      outcome: 'fallback', reason: 'not_published', resolvedLocale: 'es-ES', publication: edition(draft).published, freshness: 'current' });
    expect(edition(draft, 'fr-FR').published).toBeNull();
    expect(resolveLocalizedContent(draft, selection({ requestedLocale: 'fr-FR' })))
      .toMatchObject({ outcome: 'unresolved', reason: 'not_published', fallbackReason: null });
    expect(resolveLocalizedContent(draft, selection({ requestedLocale: 'es' })))
      .toMatchObject({ outcome: 'unresolved', reason: 'not_published' });
  });

  it('solo vuelve stale una traducción al publicar otra revisión fuente y exige decidir qué hacer con ella', () => {
    const current = translated();
    const stale = publish(current, 'es-ES', text({ title: 'Nueva fuente' }));
    expect(resolveLocalizedContent(stale, selection({ requestedLocale: 'ca-ES' })))
      .toMatchObject({ outcome: 'unresolved', reason: 'stale', fallbackReason: null });
    expect(resolveLocalizedContent(stale, selection({ requestedLocale: 'ca-ES', staleTranslations: 'include' })))
      .toMatchObject({ outcome: 'matched', freshness: 'stale', publication: edition(current, 'ca-ES').published });
    expect(resolveLocalizedContent(stale, selection({ requestedLocale: 'ca-ES', fallback: { strategy: 'locale', locale: 'es-ES' } })))
      .toMatchObject({ outcome: 'fallback', reason: 'stale', resolvedLocale: 'es-ES', freshness: 'current' });
  });

  it('aplica también la política stale a la publicación de fallback y conserva ambos motivos de ausencia', () => {
    const content = publish(translated(), 'es-ES', text({ title: 'Nueva fuente' }));
    const options = selection({ requestedLocale: 'fr-FR', fallback: { strategy: 'locale', locale: 'ca-ES' } });
    expect(resolveLocalizedContent(content, options)).toMatchObject({ outcome: 'unresolved', reason: 'not_published', fallbackReason: 'stale' });
    expect(resolveLocalizedContent(content, { ...options, staleTranslations: 'include' }))
      .toMatchObject({ outcome: 'fallback', reason: 'not_published', resolvedLocale: 'ca-ES', freshness: 'stale' });
    const withdrawn = step(content, { action: 'unpublish', locale: 'es-ES' });
    expect(resolveLocalizedContent(withdrawn, { ...options, staleTranslations: 'include' }))
      .toMatchObject({ outcome: 'unresolved', reason: 'not_published', fallbackReason: 'source_unpublished' });
  });

  it('no encadena fallback, exige referencias declaradas y tampoco oculta configuración inválida con un match', () => {
    const content = sourcePublished();
    expect(() => resolveLocalizedContent(content, selection({ fallback: { strategy: 'locale', locale: 'fr-FR' } })))
      .toThrow(/declarada/);
    expect(() => resolveLocalizedContent(content, { ...selection(), fallback: { strategy: 'locale', locale: 'es-ES', next: 'ca-ES' } }))
      .toThrow(LocalizedContentContractError);
    const declaredEmpty = empty({ editions: [...empty().editions, { locale: 'fr-FR', draft: null, published: null }] });
    expect(resolveLocalizedContent(declaredEmpty, selection({ requestedLocale: 'fr-FR', fallback: { strategy: 'locale', locale: 'es-ES' } })))
      .toMatchObject({ outcome: 'unresolved', reason: 'not_published', fallbackReason: 'not_published' });
    expect(resolveLocalizedContent(declaredEmpty, selection({ fallback: { strategy: 'locale', locale: 'es-ES' } })))
      .toMatchObject({ outcome: 'unresolved', fallbackReason: null });
  });

  it.each([
    {}, { requestedLocale: 'es-ES', fallback: { strategy: 'none' } },
    { ...selection(), fallback: null }, { ...selection(), staleTranslations: 'automatic' },
    { ...selection(), requestedLocale: '' }, { ...selection(), marketId: 'ES' },
    { ...selection(), fallback: { strategy: 'source' } },
  ])('rechaza selección inválida sin inferir política: %j', (input) => {
    expect(() => resolveLocalizedContent(sourcePublished(), input)).toThrow(LocalizedContentContractError);
  });

  it('congela la evidencia devuelta y no usa reloj, red, almacenamiento ni temporizadores', () => {
    const content = sourcePublished();
    const unexpected = () => { throw new Error('Unexpected external effect'); };
    vi.spyOn(Date, 'now').mockImplementation(unexpected);
    vi.stubGlobal('fetch', unexpected);
    vi.stubGlobal('localStorage', { getItem: unexpected, setItem: unexpected });
    vi.stubGlobal('sessionStorage', { getItem: unexpected, setItem: unexpected });
    vi.stubGlobal('setTimeout', unexpected);
    const result = resolveLocalizedContent(content, selection());
    expect(Object.isFrozen(result)).toBe(true);
    if (result.outcome === 'unresolved') throw new Error('Expected published content');
    expect(Object.isFrozen(result.publication)).toBe(true);
    expect(Object.isFrozen(result.publication.fields)).toBe(true);
    expect(applyLocalizedContentCommand(content, { action: 'unpublish', locale: 'es-ES', expectedVersion: content.version, occurredAt: at(10) }).outcome)
      .toBe('applied');
  });
});
