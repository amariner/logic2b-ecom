export const MAX_LOCALIZED_EDITIONS = 20;
export const LOCALIZED_TEXT_LIMITS = Object.freeze({ title: 200, summary: 1_000, bodyPlainText: 20_000 });

/** Perfil fijo de texto plano; no contiene HTML, bloques, medios ni un esquema CMS. */
export type LocalizedFields = Readonly<{ title: string; summary: string; bodyPlainText: string }>;
type LocalizedRevision = Readonly<{
  revision: number;
  sourceRevision: number | null;
  fields: LocalizedFields;
}>;
export type LocalizedDraft = LocalizedRevision & Readonly<{ status: 'draft' | 'review' }>;
export type LocalizedPublishedRevision = LocalizedRevision & Readonly<{ publishedAt: string }>;
export type LocalizedEdition = Readonly<{
  locale: string;
  draft: LocalizedDraft | null;
  published: LocalizedPublishedRevision | null;
}>;
export type LocalizedContent = Readonly<{
  schemaVersion: 1;
  id: string;
  version: number;
  updatedAt: string;
  sourceLocale: string;
  editions: readonly LocalizedEdition[];
}>;

type LocalizedCommandContext = Readonly<{ expectedVersion: number; occurredAt: string; locale: string }>;
export type LocalizedContentCommand = LocalizedCommandContext & (
  | Readonly<{ action: 'save_draft'; sourceRevision: number | null; fields: LocalizedFields }>
  | Readonly<{ action: 'submit_review' | 'publish' | 'unpublish' }>
);
export type LocalizedTransitionBlockReason =
  | 'edition_missing' | 'draft_missing' | 'content_incomplete' | 'review_required' | 'already_in_review'
  | 'source_unpublished' | 'source_revision_mismatch' | 'published_missing';
export type LocalizedContentTransition =
  | Readonly<{ outcome: 'applied' | 'conflict'; content: LocalizedContent }>
  | Readonly<{ outcome: 'blocked'; reason: LocalizedTransitionBlockReason; content: LocalizedContent }>;

export type LocalizedFallback =
  | Readonly<{ strategy: 'none' }>
  | Readonly<{ strategy: 'locale'; locale: string }>;
export type StaleTranslationPolicy = 'include' | 'exclude';
export type LocalizedContentSelection = Readonly<{
  requestedLocale: string;
  fallback: LocalizedFallback;
  staleTranslations: StaleTranslationPolicy;
}>;
export type LocalizedPublicationFreshness = 'current' | 'stale';
export type LocalizedUnavailableReason = 'not_published' | 'stale' | 'source_unpublished';
type LocalizedResolutionIdentity = Readonly<{ contentId: string; contentVersion: number; requestedLocale: string }>;
type LocalizedResolvedPublication = Readonly<{
  resolvedLocale: string;
  publication: LocalizedPublishedRevision;
  freshness: LocalizedPublicationFreshness;
}>;
export type LocalizedContentResolution = LocalizedResolutionIdentity & (
  | (Readonly<{ outcome: 'matched' }> & LocalizedResolvedPublication)
  | (Readonly<{ outcome: 'fallback'; reason: LocalizedUnavailableReason }> & LocalizedResolvedPublication)
  | Readonly<{ outcome: 'unresolved'; reason: LocalizedUnavailableReason; fallbackReason: LocalizedUnavailableReason | null }>
);

export class LocalizedContentContractError extends Error {
  readonly code = 'localized_content_contract_invalid';

  constructor(message: string) {
    super(message);
    this.name = 'LocalizedContentContractError';
  }
}

function invalid(field: string, message: string): never {
  throw new LocalizedContentContractError(`${field}: ${message}`);
}

function dataRecord(value: unknown, field: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return invalid(field, 'debe ser un objeto de datos.');
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return invalid(field, 'debe contener datos propios.');
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
    if (typeof key !== 'string' || !descriptor.enumerable || !('value' in descriptor)) {
      return invalid(field, 'no admite accesores, símbolos ni propiedades ocultas.');
    }
  }
  return value as Record<string, unknown>;
}

function record(value: unknown, keys: readonly string[], field: string): Record<string, unknown> {
  const result = dataRecord(value, field);
  const actual = Object.keys(result);
  if (actual.length !== keys.length || actual.some((key) => !keys.includes(key))) {
    return invalid(field, 'contiene campos ausentes o desconocidos.');
  }
  return result;
}

function editionsArray(value: unknown): readonly unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length < 1 || value.length > MAX_LOCALIZED_EDITIONS) {
    return invalid('content.editions', `debe contener entre 1 y ${MAX_LOCALIZED_EDITIONS} ediciones.`);
  }
  if (Reflect.ownKeys(value).length !== value.length + 1) return invalid('content.editions', 'no admite huecos ni campos adicionales.');
  for (let index = 0; index < value.length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) return invalid('content.editions', 'no admite accesores ni huecos.');
  }
  return value;
}

function positiveInteger(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) return invalid(field, 'debe ser un entero positivo seguro.');
  return value;
}

function contentId(value: unknown): string {
  if (typeof value !== 'string' || value.length > 100 || !/^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/.test(value)) {
    return invalid('content.id', 'debe ser un identificador opaco canónico de hasta 100 caracteres.');
  }
  return value;
}

function locale(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length < 1 || value.length > 100 || /-[a-z0-9]-/i.test(value)) {
    return invalid(field, 'debe ser un locale de hasta 100 caracteres sin extensiones ni uso privado.');
  }
  let canonical: string | undefined;
  try { canonical = Intl.getCanonicalLocales(value)[0]; } catch { /* No se infiere el idioma del entorno. */ }
  if (!canonical || canonical.length > 100) return invalid(field, 'la etiqueta canónica de idioma no es válida o supera el límite.');
  return canonical;
}

function timestamp(value: unknown, field: string): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) {
    return invalid(field, 'debe ser una fecha UTC canónica con milisegundos.');
  }
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) return invalid(field, 'contiene una fecha inválida.');
  return value;
}

function fields(input: unknown, field: string): LocalizedFields {
  const row = record(input, ['title', 'summary', 'bodyPlainText'], field);
  for (const key of ['title', 'summary', 'bodyPlainText'] as const) {
    const value = row[key];
    if (typeof value !== 'string' || value.length > LOCALIZED_TEXT_LIMITS[key] || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) {
      return invalid(`${field}.${key}`, 'debe ser texto plano dentro del límite, sin controles.');
    }
  }
  return Object.freeze({ title: row.title as string, summary: row.summary as string, bodyPlainText: row.bodyPlainText as string });
}

function complete(value: LocalizedFields): boolean {
  return value.title.trim().length > 0 && value.summary.trim().length > 0 && value.bodyPlainText.trim().length > 0;
}

function revision(input: unknown, kind: 'draft', field: string): LocalizedDraft;
function revision(input: unknown, kind: 'published', field: string): LocalizedPublishedRevision;
function revision(input: unknown, kind: 'draft' | 'published', field: string): LocalizedDraft | LocalizedPublishedRevision {
  const row = record(input, ['revision', 'sourceRevision', 'fields', kind === 'draft' ? 'status' : 'publishedAt'], field);
  const version = positiveInteger(row.revision, `${field}.revision`);
  const sourceRevision = row.sourceRevision === null ? null : positiveInteger(row.sourceRevision, `${field}.sourceRevision`);
  const text = fields(row.fields, `${field}.fields`);
  const common = { revision: version, sourceRevision, fields: text };
  if (kind === 'published') {
    if (!complete(text)) return invalid(field, 'una publicación debe contener todos los textos completos.');
    return Object.freeze({ ...common, publishedAt: timestamp(row.publishedAt, `${field}.publishedAt`) });
  }
  if (row.status !== 'draft' && row.status !== 'review') return invalid(`${field}.status`, 'debe ser draft o review.');
  if (row.status === 'review' && !complete(text)) return invalid(field, 'una revisión editorial requiere textos completos.');
  return Object.freeze({ ...common, status: row.status });
}

/** Valida un artefacto editorial; no acredita actor, aprobación humana ni persistencia. */
export function defineLocalizedContent(input: unknown): LocalizedContent {
  const row = record(input, ['schemaVersion', 'id', 'version', 'updatedAt', 'sourceLocale', 'editions'], 'content');
  if (row.schemaVersion !== 1) return invalid('content.schemaVersion', 'debe ser 1.');
  const id = contentId(row.id);
  const version = positiveInteger(row.version, 'content.version');
  const updatedAt = timestamp(row.updatedAt, 'content.updatedAt');
  const sourceLocale = locale(row.sourceLocale, 'content.sourceLocale');
  const editions = editionsArray(row.editions).map((item, index): LocalizedEdition => {
    const field = `content.editions.${index}`;
    const edition = record(item, ['locale', 'draft', 'published'], field);
    return Object.freeze({ locale: locale(edition.locale, `${field}.locale`),
      draft: edition.draft === null ? null : revision(edition.draft, 'draft', `${field}.draft`),
      published: edition.published === null ? null : revision(edition.published, 'published', `${field}.published`) });
  });
  const locales = new Set<string>();
  const revisions = new Set<number>();
  const source = editions.find((edition) => edition.locale === sourceLocale);
  if (!source) return invalid('content.sourceLocale', 'debe tener una edición declarada.');
  for (const edition of editions) {
    if (locales.has(edition.locale)) return invalid('content.editions', 'contiene locales duplicados.');
    locales.add(edition.locale);
    if (edition.draft && edition.published && edition.draft.revision <= edition.published.revision) {
      return invalid('content.editions', 'el borrador debe ser posterior a la publicación conservada.');
    }
    for (const item of [edition.draft, edition.published]) {
      if (!item) continue;
      if (item.revision > version || revisions.has(item.revision)) return invalid('content.editions', 'contiene revisiones repetidas o posteriores al artefacto.');
      revisions.add(item.revision);
      if (edition.locale === sourceLocale) {
        if (item.sourceRevision !== null) return invalid('content.editions', 'la edición fuente exige sourceRevision null.');
      } else if (item.sourceRevision === null || item.sourceRevision >= item.revision ||
        (source.published !== null && item.sourceRevision > source.published.revision)) {
        return invalid('content.editions', 'la traducción debe referenciar una revisión fuente anterior, sin anticipar su publicación.');
      }
    }
    if (edition.published && edition.published.publishedAt > updatedAt) return invalid('content.updatedAt', 'no puede preceder a una publicación.');
    if (edition.published && source.published && edition.published.sourceRevision === source.published.revision &&
      edition.published.publishedAt < source.published.publishedAt) {
      return invalid('content.editions', 'la traducción vigente no puede publicarse antes que su fuente.');
    }
  }
  return Object.freeze({ schemaVersion: 1, id, version, updatedAt, sourceLocale,
    editions: Object.freeze(editions.sort((left, right) => left.locale < right.locale ? -1 : left.locale > right.locale ? 1 : 0)) });
}

function command(input: unknown): LocalizedContentCommand {
  const row = dataRecord(input, 'command');
  const contextKeys = ['action', 'expectedVersion', 'occurredAt', 'locale'];
  if (row.action !== 'save_draft' && row.action !== 'submit_review' && row.action !== 'publish' && row.action !== 'unpublish') {
    return invalid('command.action', 'no es una transición editorial declarada.');
  }
  record(row, row.action === 'save_draft' ? [...contextKeys, 'sourceRevision', 'fields'] : contextKeys, 'command');
  const context = { expectedVersion: positiveInteger(row.expectedVersion, 'command.expectedVersion'),
    occurredAt: timestamp(row.occurredAt, 'command.occurredAt'), locale: locale(row.locale, 'command.locale') };
  if (row.action === 'save_draft') return Object.freeze({ ...context, action: 'save_draft',
    sourceRevision: row.sourceRevision === null ? null : positiveInteger(row.sourceRevision, 'command.sourceRevision'),
    fields: fields(row.fields, 'command.fields') });
  return Object.freeze({ ...context, action: row.action });
}

function sourceBlock(content: LocalizedContent, editionLocale: string, sourceRevision: number | null): LocalizedTransitionBlockReason | null {
  if (editionLocale === content.sourceLocale) return sourceRevision === null ? null : 'source_revision_mismatch';
  const source = content.editions.find((edition) => edition.locale === content.sourceLocale)!.published;
  if (!source) return 'source_unpublished';
  return sourceRevision === source.revision ? null : 'source_revision_mismatch';
}

/** Una transición pura devuelve un nuevo artefacto; expectedVersion no sustituye un CAS durable. */
export function applyLocalizedContentCommand(contentInput: unknown, commandInput: unknown): LocalizedContentTransition {
  const content = defineLocalizedContent(contentInput);
  const next = command(commandInput);
  if (next.expectedVersion !== content.version) return Object.freeze({ outcome: 'conflict', content });
  if (next.occurredAt < content.updatedAt) return invalid('command.occurredAt', 'no puede retroceder respecto al artefacto vigente.');
  const blocked = (reason: LocalizedTransitionBlockReason): LocalizedContentTransition => Object.freeze({ outcome: 'blocked', reason, content });
  const existing = content.editions.find((edition) => edition.locale === next.locale);
  let edition: LocalizedEdition;
  if (next.action === 'save_draft') {
    const reason = sourceBlock(content, next.locale, next.sourceRevision);
    if (reason) return blocked(reason);
    edition = { locale: next.locale, published: existing?.published ?? null,
      draft: { revision: content.version + 1, sourceRevision: next.sourceRevision, fields: next.fields, status: 'draft' } };
  } else {
    if (!existing) return blocked('edition_missing');
    if (next.action === 'unpublish') {
      if (!existing.published) return blocked('published_missing');
      edition = { ...existing, published: null };
    } else {
      if (!existing.draft) return blocked('draft_missing');
      if (!complete(existing.draft.fields)) return blocked('content_incomplete');
      const reason = sourceBlock(content, next.locale, existing.draft.sourceRevision);
      if (reason) return blocked(reason);
      if (next.action === 'submit_review') {
        if (existing.draft.status === 'review') return blocked('already_in_review');
        edition = { ...existing, draft: { ...existing.draft, status: 'review' } };
      } else {
        if (existing.draft.status !== 'review') return blocked('review_required');
        edition = { ...existing, draft: null, published: { revision: existing.draft.revision,
          sourceRevision: existing.draft.sourceRevision, fields: existing.draft.fields, publishedAt: next.occurredAt } };
      }
    }
  }
  const updated = defineLocalizedContent({ ...content, version: content.version + 1, updatedAt: next.occurredAt,
    editions: [...content.editions.filter((item) => item.locale !== next.locale), edition] });
  return Object.freeze({ outcome: 'applied', content: updated });
}

function selection(input: unknown): LocalizedContentSelection {
  const row = record(input, ['requestedLocale', 'fallback', 'staleTranslations'], 'selection');
  const requestedLocale = locale(row.requestedLocale, 'selection.requestedLocale');
  if (row.staleTranslations !== 'include' && row.staleTranslations !== 'exclude') {
    return invalid('selection.staleTranslations', 'debe declarar include o exclude.');
  }
  const fallback = dataRecord(row.fallback, 'selection.fallback');
  if (fallback.strategy === 'none') {
    record(fallback, ['strategy'], 'selection.fallback');
    return Object.freeze({ requestedLocale, staleTranslations: row.staleTranslations, fallback: Object.freeze({ strategy: 'none' }) });
  }
  if (fallback.strategy === 'locale') {
    record(fallback, ['strategy', 'locale'], 'selection.fallback');
    return Object.freeze({ requestedLocale, staleTranslations: row.staleTranslations,
      fallback: Object.freeze({ strategy: 'locale', locale: locale(fallback.locale, 'selection.fallback.locale') }) });
  }
  return invalid('selection.fallback.strategy', 'debe declarar none o locale.');
}

type PublicationCandidate =
  | Readonly<{ available: true; publication: LocalizedPublishedRevision; freshness: LocalizedPublicationFreshness }>
  | Readonly<{ available: false; reason: LocalizedUnavailableReason }>;

function publicationCandidate(content: LocalizedContent, requestedLocale: string, stalePolicy: StaleTranslationPolicy): PublicationCandidate {
  const published = content.editions.find((edition) => edition.locale === requestedLocale)?.published;
  if (!published) return { available: false, reason: 'not_published' };
  if (requestedLocale === content.sourceLocale) return { available: true, publication: published, freshness: 'current' };
  const source = content.editions.find((edition) => edition.locale === content.sourceLocale)!.published;
  if (!source) return { available: false, reason: 'source_unpublished' };
  const freshness = published.sourceRevision === source.revision ? 'current' : 'stale';
  if (freshness === 'stale' && stalePolicy === 'exclude') return { available: false, reason: 'stale' };
  return { available: true, publication: published, freshness };
}

/** Selecciona una publicación completa. Nunca mezcla campos ni crea una traducción a partir del fallback. */
export function resolveLocalizedContent(contentInput: unknown, optionsInput: unknown): LocalizedContentResolution {
  const content = defineLocalizedContent(contentInput);
  const options = selection(optionsInput);
  const fallback = options.fallback;
  if (fallback.strategy === 'locale' && !content.editions.some((edition) => edition.locale === fallback.locale)) {
    return invalid('selection.fallback.locale', 'debe referenciar una edición declarada.');
  }
  const identity = { contentId: content.id, contentVersion: content.version, requestedLocale: options.requestedLocale };
  const requested = publicationCandidate(content, options.requestedLocale, options.staleTranslations);
  if (requested.available) return Object.freeze({ ...identity, outcome: 'matched', resolvedLocale: options.requestedLocale,
    publication: requested.publication, freshness: requested.freshness });
  if (fallback.strategy === 'none' || fallback.locale === options.requestedLocale) {
    return Object.freeze({ ...identity, outcome: 'unresolved', reason: requested.reason, fallbackReason: null });
  }
  const candidate = publicationCandidate(content, fallback.locale, options.staleTranslations);
  return candidate.available
    ? Object.freeze({ ...identity, outcome: 'fallback', reason: requested.reason, resolvedLocale: fallback.locale,
      publication: candidate.publication, freshness: candidate.freshness })
    : Object.freeze({ ...identity, outcome: 'unresolved', reason: requested.reason, fallbackReason: candidate.reason });
}
