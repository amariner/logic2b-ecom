import type { Platform } from './create-platform';
import { defineMarketCatalog, resolveMarket, type MarketResolution } from '../modules/markets';
import {
  applyLocalizedContentCommand, defineLocalizedContent, planInternationalUrls, resolveLocalizedContent,
  LocalizedContentContractError, LOCALIZED_TEXT_LIMITS,
  type InternationalPage, type InternationalUrlPlan, type LocalizedContent, type LocalizedContentResolution,
  type LocalizedContentTransition, type LocalizedFields,
} from '../modules/localization';

export type MarketContentDemoContentId = 'demo.guide' | 'demo.story';
export type MarketContentDemoField = keyof LocalizedFields;
export type MarketContentDemoSelection = Readonly<{
  marketId: 'ES' | 'FR';
  contentId: MarketContentDemoContentId;
  locale: 'market-default' | 'es-ES' | 'ca-ES' | 'en-GB' | 'fr-FR';
  fallback: 'none' | 'es-ES';
  staleTranslations: 'include' | 'exclude';
}>;
export type MarketContentDemoFeedback = Readonly<{
  tone: 'info' | 'success' | 'error';
  code: string;
  message: string;
}>;
type EditorBuffer = Readonly<{ fields: LocalizedFields; savedFields: LocalizedFields; sourceRevision: number }>;
type UrlBinding = Readonly<{ contentId: MarketContentDemoContentId; locale: string; publishedRevision: number; slug: string }>;
export type MarketContentDemoState = Readonly<{
  selection: MarketContentDemoSelection;
  contents: readonly LocalizedContent[];
  editors: Readonly<Record<MarketContentDemoContentId, EditorBuffer>>;
  bindings: readonly UrlBinding[];
  virtualStep: number;
  feedback: MarketContentDemoFeedback;
}>;
export type MarketContentDemoView = Readonly<{
  selection: MarketContentDemoSelection;
  marketOptions: readonly Readonly<{ id: 'ES' | 'FR'; label: string }>[];
  contentOptions: readonly Readonly<{ id: MarketContentDemoContentId; label: string }>[];
  localeOptions: readonly Readonly<{ id: MarketContentDemoSelection['locale']; label: string }>[];
  marketResolution: MarketResolution;
  requestedLocale: string;
  contentResolution: LocalizedContentResolution;
  preview: Readonly<{ label: string; detail: string; fields: LocalizedFields | null; resolvedLocale: string | null; needsReview: boolean }>;
  editions: readonly Readonly<{
    locale: string; label: string; draftState: 'draft' | 'review' | null;
    publishedRevision: number | null; publishedAt: string | null; needsReview: boolean; statusLabel: string;
  }>[];
  editor: Readonly<{
    locale: 'en-GB'; fields: LocalizedFields;
    fieldErrors: Readonly<Partial<Record<MarketContentDemoField, string>>>;
    dirty: boolean; draftState: 'draft' | 'review' | null;
    publishedRevision: number | null; publishedAt: string | null;
    canSave: boolean; canReview: boolean; canPublish: boolean; blockedReason: string | null;
  }>;
  baselinePlan: InternationalUrlPlan;
  currentPlan: InternationalUrlPlan;
  diff: Readonly<{ added: readonly InternationalPage[]; removed: readonly InternationalPage[]; updated: readonly InternationalPage[] }>;
  feedback: MarketContentDemoFeedback;
  virtualStep: number;
}>;

/** Gate de presentación: nunca activa módulos ni consulta otros bindings del entorno. */
export function canShowMarketContentDemo(
  env: Readonly<{ DEMO_MODE?: string | undefined }> | undefined,
  platform: Pick<Platform, 'manifest'>,
): boolean {
  return platform.manifest.deployment.mode === 'demo' && env?.DEMO_MODE === 'true';
}

const SOURCE_LOCALE = 'es-ES';
const EDITOR_LOCALE = 'en-GB';
const FIELD_NAMES = ['title', 'summary', 'bodyPlainText'] as const;
const DEMO_CLOCK_START = Date.parse('2026-10-03T12:00:00.000Z');
const MARKET_OPTIONS = Object.freeze([
  Object.freeze({ id: 'ES' as const, label: 'España' }), Object.freeze({ id: 'FR' as const, label: 'Francia' }),
]);
const CONTENT_OPTIONS = Object.freeze([
  Object.freeze({ id: 'demo.guide' as const, label: 'Guía de cuidados' }),
  Object.freeze({ id: 'demo.story' as const, label: 'Historia del taller' }),
]);
const LOCALE_OPTIONS = Object.freeze([
  Object.freeze({ id: 'market-default' as const, label: 'Preferido del mercado' }),
  Object.freeze({ id: 'es-ES' as const, label: 'Español' }), Object.freeze({ id: 'ca-ES' as const, label: 'Catalán' }),
  Object.freeze({ id: 'en-GB' as const, label: 'Inglés' }), Object.freeze({ id: 'fr-FR' as const, label: 'Francés' }),
]);
const MARKETS = defineMarketCatalog({ schemaVersion: 1, id: 'demo.markets', version: 1,
  markets: [
    { id: 'ES', countryCodes: ['ES'], defaultLocale: SOURCE_LOCALE, currency: 'EUR', domains: ['es.example.test'] },
    { id: 'FR', countryCodes: ['FR'], defaultLocale: 'fr-FR', currency: 'EUR', domains: ['fr.example.test'] },
  ], fallback: { strategy: 'none' } });
const ROUTES = Object.freeze([
  Object.freeze({ locale: 'es-ES', origin: 'https://es.example.test', pathPrefix: '/es', hreflang: 'es-ES' }),
  Object.freeze({ locale: 'ca-ES', origin: 'https://es.example.test', pathPrefix: '/ca', hreflang: 'ca-ES' }),
  Object.freeze({ locale: 'en-GB', origin: 'https://es.example.test', pathPrefix: '/en', hreflang: 'en-GB' }),
  Object.freeze({ locale: 'fr-FR', origin: 'https://fr.example.test', pathPrefix: '/fr', hreflang: 'fr-FR' }),
]);
const ENGLISH_SLUGS: Readonly<Record<MarketContentDemoContentId, string>> = Object.freeze({
  'demo.guide': 'care-guide', 'demo.story': 'workshop-story',
});

// Textos y versiones editoriales sintéticos; no representan publicaciones del sitio servido.
const GUIDE = defineLocalizedContent({ schemaVersion: 1, id: 'demo.guide', version: 3,
  sourceLocale: SOURCE_LOCALE, updatedAt: '2026-10-03T09:10:00.000Z', editions: [
    { locale: 'es-ES', draft: null, published: { revision: 1, sourceRevision: null, publishedAt: '2026-10-03T09:00:00.000Z',
      fields: { title: 'Cuida las piezas que te acompañan', summary: 'Una guía de ejemplo para alargar su vida.',
        bodyPlainText: 'Limpia cada pieza con un paño suave. Guárdala en un lugar seco y revisa sus cuidados antes de usarla.' } } },
    { locale: 'ca-ES', draft: null, published: { revision: 2, sourceRevision: 1, publishedAt: '2026-10-03T09:05:00.000Z',
      fields: { title: 'Cuida les peces que t’acompanyen', summary: 'Una guia d’exemple per allargar-ne la vida.',
        bodyPlainText: 'Neteja cada peça amb un drap suau. Desa-la en un lloc sec i revisa com cuidar-la abans de fer-la servir.' } } },
    { locale: 'en-GB', published: null, draft: { revision: 3, sourceRevision: 1, status: 'draft',
      fields: { title: 'Care for the pieces you love', summary: 'An example guide to helping them last.',
        bodyPlainText: 'Clean each piece with a soft cloth. Keep it in a dry place and check its care instructions before use.' } } },
    { locale: 'fr-FR', draft: null, published: null },
  ] });
const STORY = defineLocalizedContent({ schemaVersion: 1, id: 'demo.story', version: 5,
  sourceLocale: SOURCE_LOCALE, updatedAt: '2026-10-03T09:30:00.000Z', editions: [
    { locale: 'es-ES', draft: null, published: { revision: 4, sourceRevision: null, publishedAt: '2026-10-03T09:20:00.000Z',
      fields: { title: 'Una nueva etapa en el taller', summary: 'La versión española del ejemplo ya cuenta una novedad.',
        bodyPlainText: 'El taller de esta historia ficticia incorpora una mesa de trabajo compartida. Cada pieza empieza con una conversación.' } } },
    { locale: 'ca-ES', draft: null, published: { revision: 2, sourceRevision: 1, publishedAt: '2026-10-03T09:05:00.000Z',
      fields: { title: 'La història del taller', summary: 'Una versió publicada que encara no inclou la novetat.',
        bodyPlainText: 'Al taller d’aquesta història fictícia, cada peça comença amb una conversa i un primer esbós.' } } },
    { locale: 'en-GB', published: null, draft: { revision: 5, sourceRevision: 4, status: 'draft',
      fields: { title: 'A new chapter in the workshop', summary: 'The English example is ready for editorial review.',
        bodyPlainText: 'The workshop in this fictional story adds a shared workbench. Every piece starts with a conversation.' } } },
    { locale: 'fr-FR', draft: null, published: null },
  ] });
const CONTENTS = Object.freeze([GUIDE, STORY]);
const INITIAL_BINDINGS: readonly UrlBinding[] = Object.freeze([
  Object.freeze({ contentId: 'demo.guide', locale: 'es-ES', publishedRevision: 1, slug: 'guia-cuidados' }),
  Object.freeze({ contentId: 'demo.guide', locale: 'ca-ES', publishedRevision: 2, slug: 'guia-cures' }),
  Object.freeze({ contentId: 'demo.story', locale: 'es-ES', publishedRevision: 4, slug: 'historia-taller' }),
  Object.freeze({ contentId: 'demo.story', locale: 'ca-ES', publishedRevision: 2, slug: 'historia-taller' }),
]);
const X_DEFAULTS = Object.freeze(CONTENT_OPTIONS.map(({ id }) => Object.freeze({ contentId: id, locale: SOURCE_LOCALE })));
const BASELINE_PLAN = planInternationalUrls({ contents: CONTENTS, routes: ROUTES, bindings: INITIAL_BINDINGS,
  xDefaults: X_DEFAULTS, staleTranslations: 'include' });

function feedback(tone: MarketContentDemoFeedback['tone'], code: string, message: string): MarketContentDemoFeedback {
  return Object.freeze({ tone, code, message });
}
function selectedContent(state: MarketContentDemoState): LocalizedContent {
  return state.contents.find((content) => content.id === state.selection.contentId)!;
}
function selectedBuffer(state: MarketContentDemoState): EditorBuffer {
  return state.editors[state.selection.contentId];
}
function englishEdition(content: LocalizedContent) {
  return content.editions.find((edition) => edition.locale === EDITOR_LOCALE)!;
}
function changed(buffer: EditorBuffer): boolean {
  return FIELD_NAMES.some((field) => buffer.fields[field] !== buffer.savedFields[field]);
}
function nextInstant(state: MarketContentDemoState): string {
  if (!Number.isSafeInteger(state.virtualStep) || state.virtualStep < 0) throw new RangeError('Paso virtual inválido.');
  return new Date(DEMO_CLOCK_START + (state.virtualStep + 1) * 60_000).toISOString();
}
function probe(state: MarketContentDemoState, action: 'save_draft' | 'submit_review' | 'publish', values = selectedBuffer(state).fields): LocalizedContentTransition {
  const content = selectedContent(state);
  const context = { action, expectedVersion: content.version, occurredAt: nextInstant(state), locale: EDITOR_LOCALE };
  return applyLocalizedContentCommand(content, action === 'save_draft'
    ? { ...context, sourceRevision: selectedBuffer(state).sourceRevision, fields: values } : context);
}
function fieldErrors(state: MarketContentDemoState): Readonly<Partial<Record<MarketContentDemoField, string>>> {
  const buffer = selectedBuffer(state);
  const errors: Partial<Record<MarketContentDemoField, string>> = {};
  for (const field of FIELD_NAMES) {
    try {
      // El dominio valida cada campo. Los demás provienen de una copia ya validada.
      probe(state, 'save_draft', { ...buffer.savedFields, [field]: buffer.fields[field] });
    } catch (error) {
      if (!(error instanceof LocalizedContentContractError)) throw error;
      errors[field] = `Usa texto de hasta ${LOCALIZED_TEXT_LIMITS[field]} caracteres, sin caracteres de control.`;
    }
  }
  return Object.freeze(errors);
}
function blockMessage(result: LocalizedContentTransition): string | null {
  if (result.outcome !== 'blocked') return result.outcome === 'applied'
    ? null : 'El ejemplo ha cambiado. Revisa sus valores antes de continuar.';
  switch (result.reason) {
    case 'content_incomplete': return 'Completa el título, el resumen y el contenido antes de pasar a revisión.';
    case 'review_required': return 'Pasa el borrador a revisión antes de simular su publicación.';
    case 'already_in_review': return 'El borrador ya está en revisión.';
    case 'draft_missing': return 'Edita y guarda un nuevo borrador para continuar.';
    case 'source_unpublished': return 'El idioma original no tiene una versión publicada.';
    case 'source_revision_mismatch': return 'Este borrador necesita revisarse frente al texto original actualizado.';
    default: return 'Esta acción no está disponible en el estado actual del ejemplo.';
  }
}
function exactInput(input: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new RangeError('Acción de ejemplo inválida.');
  const prototype = Object.getPrototypeOf(input);
  if (prototype !== Object.prototype && prototype !== null) throw new RangeError('Acción de ejemplo inválida.');
  const actual = Reflect.ownKeys(input);
  if (actual.length !== keys.length) throw new RangeError('Acción de ejemplo incompleta.');
  for (const key of actual) {
    const descriptor = Object.getOwnPropertyDescriptor(input, key)!;
    if (typeof key !== 'string' || !keys.includes(key) || !descriptor.enumerable || !('value' in descriptor)) {
      throw new RangeError('Acción de ejemplo inválida.');
    }
  }
  return input as Record<string, unknown>;
}

/** Estado únicamente en memoria; crear otro estado restablece todos los fixtures. */
export function createMarketContentDemo(): MarketContentDemoState {
  const buffer = (content: LocalizedContent): EditorBuffer => {
    const draft = englishEdition(content).draft!;
    return Object.freeze({ fields: draft.fields, savedFields: draft.fields, sourceRevision: draft.sourceRevision! });
  };
  return Object.freeze({ selection: Object.freeze({ marketId: 'ES', contentId: 'demo.guide', locale: 'market-default',
    fallback: 'none', staleTranslations: 'include' }), contents: CONTENTS,
    editors: Object.freeze({ 'demo.guide': buffer(GUIDE), 'demo.story': buffer(STORY) }),
    bindings: INITIAL_BINDINGS, virtualStep: 0,
    feedback: feedback('info', 'initial', 'Explora estos textos ficticios. Los cambios solo duran mientras mantengas abierto el ejemplo.') });
}

export function configureMarketContentDemo(state: MarketContentDemoState, input: MarketContentDemoSelection): MarketContentDemoState {
  const row = exactInput(input, ['marketId', 'contentId', 'locale', 'fallback', 'staleTranslations']);
  if (!MARKET_OPTIONS.some((item) => item.id === row.marketId) || !CONTENT_OPTIONS.some((item) => item.id === row.contentId) ||
    !LOCALE_OPTIONS.some((item) => item.id === row.locale) || (row.fallback !== 'none' && row.fallback !== 'es-ES') ||
    (row.staleTranslations !== 'include' && row.staleTranslations !== 'exclude')) throw new RangeError('Selección de ejemplo inválida.');
  return Object.freeze({ ...state, selection: Object.freeze({ ...input }),
    feedback: feedback('info', 'selection_changed', 'Vista del ejemplo actualizada. Los borradores de cada contenido se conservan.') });
}

export function editMarketContentDemo(state: MarketContentDemoState, input: Readonly<{ field: MarketContentDemoField; value: string }>): MarketContentDemoState {
  const row = exactInput(input, ['field', 'value']);
  if (!FIELD_NAMES.includes(row.field as MarketContentDemoField) || typeof row.value !== 'string') throw new RangeError('Campo de ejemplo inválido.');
  const current = selectedBuffer(state);
  const buffer = Object.freeze({ ...current, fields: Object.freeze({ ...current.fields, [input.field]: input.value }) });
  const updated = Object.freeze({ ...state, editors: Object.freeze({ ...state.editors, [state.selection.contentId]: buffer }) });
  const invalid = Object.keys(fieldErrors(updated)).length > 0;
  return Object.freeze({ ...updated, feedback: invalid
    ? feedback('error', 'invalid_fields', 'Revisa los campos indicados. La publicación anterior se conserva.')
    : feedback('info', 'draft_edited', changed(buffer) ? 'Tienes cambios pendientes. Guarda el borrador antes de continuar.' : 'El borrador vuelve a sus valores guardados.') });
}

function applyEditorAction(state: MarketContentDemoState, action: 'save_draft' | 'submit_review' | 'publish'): MarketContentDemoState {
  const buffer = selectedBuffer(state);
  if (Object.keys(fieldErrors(state)).length > 0) return Object.freeze({ ...state,
    feedback: feedback('error', 'invalid_fields', 'Revisa los campos indicados antes de continuar.') });
  if (action !== 'save_draft' && changed(buffer)) return Object.freeze({ ...state,
    feedback: feedback('error', 'pending_changes', 'Guarda los cambios antes de continuar.') });
  if (action === 'save_draft' && !changed(buffer)) return Object.freeze({ ...state,
    feedback: feedback('info', 'no_changes', 'No hay cambios pendientes de guardar.') });
  const result = probe(state, action);
  if (result.outcome !== 'applied') return Object.freeze({ ...state,
    feedback: feedback('error', result.outcome === 'blocked' ? result.reason : 'conflict', blockMessage(result)!) });
  const content = result.content;
  const newBuffer = Object.freeze({ ...buffer, savedFields: buffer.fields });
  let bindings = state.bindings;
  if (action === 'publish') {
    // Único puente de publicación del ejemplo: una ruta predefinida referencia la revisión que acaba de publicarse.
    const publication = englishEdition(content).published!;
    bindings = Object.freeze([...bindings.filter((binding) => binding.contentId !== content.id || binding.locale !== EDITOR_LOCALE),
      Object.freeze({ contentId: state.selection.contentId, locale: EDITOR_LOCALE, publishedRevision: publication.revision,
        slug: ENGLISH_SLUGS[state.selection.contentId] })]);
  }
  const message = action === 'save_draft' ? 'Borrador guardado en este ejemplo. La versión publicada conserva su contenido y sus direcciones.'
    : action === 'submit_review' ? 'Borrador en revisión. Todavía no cambia la versión publicada.'
    : 'Publicación simulada. El plan de direcciones del ejemplo ya refleja esta versión en inglés.';
  return Object.freeze({ ...state, contents: Object.freeze(state.contents.map((item) => item.id === content.id ? content : item)),
    editors: Object.freeze({ ...state.editors, [state.selection.contentId]: newBuffer }), bindings,
    virtualStep: state.virtualStep + 1, feedback: feedback('success', action, message) });
}

export function saveMarketContentDemoDraft(state: MarketContentDemoState): MarketContentDemoState {
  return applyEditorAction(state, 'save_draft');
}
export function submitMarketContentDemoReview(state: MarketContentDemoState): MarketContentDemoState {
  return applyEditorAction(state, 'submit_review');
}
export function publishMarketContentDemoDraft(state: MarketContentDemoState): MarketContentDemoState {
  return applyEditorAction(state, 'publish');
}

function publicationKey(page: InternationalPage): string {
  return JSON.stringify([page.contentId, page.locale]);
}
function publicProjection(page: InternationalPage): string {
  // contentVersion también cambia al editar un borrador: no representa un cambio de la página publicada.
  const { contentVersion: _version, ...published } = page;
  return JSON.stringify(published);
}
function planDiff(current: InternationalUrlPlan): MarketContentDemoView['diff'] {
  const initialByKey = new Map(BASELINE_PLAN.pages.map((page) => [publicationKey(page), page]));
  const currentByKey = new Map(current.pages.map((page) => [publicationKey(page), page]));
  return Object.freeze({
    added: Object.freeze(current.pages.filter((page) => !initialByKey.has(publicationKey(page)))),
    removed: Object.freeze(BASELINE_PLAN.pages.filter((page) => !currentByKey.has(publicationKey(page)))),
    updated: Object.freeze(current.pages.filter((page) => {
      const previous = initialByKey.get(publicationKey(page));
      return previous !== undefined && publicProjection(previous) !== publicProjection(page);
    })),
  });
}

/** DTO de presentación: las decisiones de disponibilidad, revisión y URL proceden de las APIs públicas. */
export function getMarketContentDemoView(state: MarketContentDemoState): MarketContentDemoView {
  const marketResolution = resolveMarket(MARKETS, { by: 'id', marketId: state.selection.marketId });
  if (marketResolution.outcome === 'unresolved') throw new RangeError('Mercado del ejemplo ausente.');
  const requestedLocale = state.selection.locale === 'market-default' ? marketResolution.market.defaultLocale : state.selection.locale;
  const content = selectedContent(state);
  const contentResolution = resolveLocalizedContent(content, { requestedLocale,
    fallback: state.selection.fallback === 'none' ? { strategy: 'none' } : { strategy: 'locale', locale: state.selection.fallback },
    staleTranslations: state.selection.staleTranslations });
  const preview = contentResolution.outcome === 'unresolved'
    ? Object.freeze({ label: 'Sin publicación disponible', detail: contentResolution.reason === 'stale'
      ? 'Esta traducción está pendiente de revisar y la política del ejemplo la mantiene oculta.'
      : 'No hay una versión publicada disponible para el idioma solicitado.', fields: null, resolvedLocale: null,
      needsReview: contentResolution.reason === 'stale' })
    : Object.freeze({ label: contentResolution.freshness === 'stale' ? 'Publicada · Pendiente de revisar'
      : contentResolution.outcome === 'fallback' ? 'Versión alternativa publicada' : 'Versión publicada vigente',
      detail: contentResolution.outcome === 'fallback'
        ? 'Se muestra una publicación completa en otro idioma. Esto no crea una traducción ni una dirección en el idioma solicitado.'
        : contentResolution.freshness === 'stale'
          ? 'Conservas una versión publicada anterior. Necesita revisarse frente al texto original actualizado.'
          : 'Se muestra la versión publicada de este idioma; los borradores se conservan por separado.',
      fields: contentResolution.publication.fields, resolvedLocale: contentResolution.resolvedLocale,
      needsReview: contentResolution.freshness === 'stale' });
  const editions = Object.freeze(content.editions.map((edition) => {
    const resolved = resolveLocalizedContent(content, { requestedLocale: edition.locale,
      fallback: { strategy: 'none' }, staleTranslations: state.selection.staleTranslations });
    const needsReview = resolved.outcome === 'unresolved' ? resolved.reason === 'stale' : resolved.freshness === 'stale';
    return Object.freeze({ locale: edition.locale, label: LOCALE_OPTIONS.find((item) => item.id === edition.locale)!.label,
      draftState: edition.draft?.status ?? null, publishedRevision: edition.published?.revision ?? null,
      publishedAt: edition.published?.publishedAt ?? null, needsReview,
      statusLabel: edition.published ? needsReview ? 'Publicada · Pendiente de revisar' : 'Publicada'
        : edition.draft?.status === 'review' ? 'En revisión' : edition.draft ? 'En borrador' : 'Sin traducción publicada' });
  }));
  const buffer = selectedBuffer(state);
  const dirty = changed(buffer);
  const errors = fieldErrors(state);
  const invalid = Object.keys(errors).length > 0;
  const save = invalid ? null : probe(state, 'save_draft');
  const review = probe(state, 'submit_review');
  const publish = probe(state, 'publish');
  const edition = englishEdition(content);
  const currentPlan = planInternationalUrls({ contents: state.contents, routes: ROUTES, bindings: state.bindings,
    xDefaults: X_DEFAULTS, staleTranslations: state.selection.staleTranslations });
  const canReview = !dirty && !invalid && review.outcome === 'applied';
  const canPublish = !dirty && !invalid && publish.outcome === 'applied';
  return Object.freeze({ selection: state.selection, marketOptions: MARKET_OPTIONS, contentOptions: CONTENT_OPTIONS,
    localeOptions: LOCALE_OPTIONS, marketResolution, requestedLocale, contentResolution, preview, editions,
    editor: Object.freeze({ locale: EDITOR_LOCALE, fields: buffer.fields, fieldErrors: errors, dirty,
      draftState: edition.draft?.status ?? null, publishedRevision: edition.published?.revision ?? null,
      publishedAt: edition.published?.publishedAt ?? null, canSave: dirty && !invalid && save?.outcome === 'applied',
      canReview, canPublish, blockedReason: invalid ? 'Revisa los campos indicados.' : dirty ? 'Guarda los cambios antes de continuar.'
        : canReview || canPublish ? null : blockMessage(review) }),
    baselinePlan: BASELINE_PLAN, currentPlan, diff: planDiff(currentPlan), feedback: state.feedback, virtualStep: state.virtualStep });
}
