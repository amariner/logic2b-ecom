import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  canShowMarketContentDemo, configureMarketContentDemo, createMarketContentDemo, editMarketContentDemo,
  getMarketContentDemoView, publishMarketContentDemoDraft, saveMarketContentDemoDraft, submitMarketContentDemoReview,
  type MarketContentDemoSelection, type MarketContentDemoState,
} from '../src/composition/market-content-demo';
import { createPlatform } from '../src/composition/create-platform';
import { createPresetManifest, createPublicDemoManifest } from '../src/platform/configuration';
import { defineLocalizedContent } from '../src/modules/localization';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const configure = (state: MarketContentDemoState, values: Partial<MarketContentDemoSelection>) =>
  configureMarketContentDemo(state, { ...state.selection, ...values });
const content = (state: MarketContentDemoState, id = state.selection.contentId) => state.contents.find((item) => item.id === id)!;
const english = (state: MarketContentDemoState) => content(state).editions.find((item) => item.locale === 'en-GB')!;
const guideUrls = (state: MarketContentDemoState) => getMarketContentDemoView(state).currentPlan.pages.filter((page) => page.contentId === 'demo.guide');
const publicShape = (state: MarketContentDemoState) => getMarketContentDemoView(state).currentPlan.pages.map(({ contentVersion: _version, ...page }) => page);

function published(initial = createMarketContentDemo()): MarketContentDemoState {
  const edited = editMarketContentDemo(initial, { field: 'title', value: 'An edited English example' });
  const saved = saveMarketContentDemoDraft(edited);
  const reviewed = submitMarketContentDemoReview(saved);
  const result = publishMarketContentDemoDraft(reviewed);
  expect(english(result).published).not.toBeNull();
  return result;
}

describe('aislamiento de la demostración de mercados y contenido', () => {
  it.each(['demo', 'client'] as const)('exige manifest %s y DEMO_MODE exacto sin consultar D1', (mode) => {
    const deployment = { id: 'market-content-isolation', environment: 'development' as const };
    const platform = createPlatform(mode === 'demo' ? createPublicDemoManifest(deployment)
      : createPresetManifest('standard', { ...deployment, mode }));
    for (const DEMO_MODE of ['true', 'false', 'TRUE', '', undefined]) {
      const env = { DEMO_MODE, get DB(): never { throw new Error('Unexpected D1 access'); } };
      expect(canShowMarketContentDemo(env, platform)).toBe(mode === 'demo' && DEMO_MODE === 'true');
    }
    expect(canShowMarketContentDemo(undefined, platform)).toBe(false);
  });

  it('no activa mercados/localization ni jobs o rutas operativas para mostrar fixtures', () => {
    const platform = createPlatform(createPublicDemoManifest({ id: 'market-content-isolation', environment: 'development' }));
    expect(canShowMarketContentDemo({ DEMO_MODE: 'true' }, platform)).toBe(true);
    for (const id of ['MKT-003', 'MKT-006', 'MKT-007'] as const) {
      expect(platform.capabilityState(id)).toBe('installed');
      expect(platform.isCapabilityActive(id)).toBe(false);
      expect(platform.hasCapabilityFlag(id, 'routes')).toBe(false);
    }
    expect(platform.scheduledJobs('*/1 * * * *')).toEqual([]);
    expect(platform.scheduledJobs('*/5 * * * *')).toEqual([]);
  });
});

describe('selección local de mercado, idioma y contenido', () => {
  it('parte de dos contenidos con ES/CA publicados, EN borrador y FR vacío, sin inventar autoridad real', () => {
    const state = createMarketContentDemo();
    const view = getMarketContentDemoView(state);
    expect(state.selection).toEqual({ marketId: 'ES', contentId: 'demo.guide', locale: 'market-default', fallback: 'none', staleTranslations: 'include' });
    expect(view.marketOptions.map(({ id }) => id)).toEqual(['ES', 'FR']);
    expect(view.contentOptions.map(({ id }) => id)).toEqual(['demo.guide', 'demo.story']);
    expect(view.requestedLocale).toBe('es-ES');
    expect(view.contentResolution).toMatchObject({ outcome: 'matched', resolvedLocale: 'es-ES' });
    expect(view.editor).toMatchObject({ locale: 'en-GB', dirty: false, draftState: 'draft', publishedRevision: null,
      canSave: false, canReview: true, canPublish: false });
    expect(view.editions.find((row) => row.locale === 'fr-FR')).toMatchObject({ draftState: null, publishedRevision: null, statusLabel: 'Sin traducción publicada' });
    expect(view.baselinePlan.pages).toHaveLength(4);
    expect(view.currentPlan.pages).toHaveLength(4);
    expect(view.diff).toEqual({ added: [], removed: [], updated: [] });
    expect(view.virtualStep).toBe(0);
    for (const item of state.contents) expect(defineLocalizedContent(item)).toEqual(item);
    for (const page of view.currentPlan.pages) expect(new URL(page.url).hostname).toMatch(/\.example\.test$/);
    expect(JSON.stringify(state)).not.toMatch(/customerId|orderId|actorId|@/u);
  });

  it('el idioma preferido francés no acredita traducción y el fallback español no crea URL francesa', () => {
    let state = configure(createMarketContentDemo(), { marketId: 'FR' });
    const before = getMarketContentDemoView(state).currentPlan;
    expect(getMarketContentDemoView(state)).toMatchObject({ requestedLocale: 'fr-FR',
      marketResolution: { outcome: 'matched', market: { id: 'FR', currency: 'EUR', defaultLocale: 'fr-FR' } },
      contentResolution: { outcome: 'unresolved', reason: 'not_published' }, preview: { fields: null, resolvedLocale: null } });
    state = configure(state, { fallback: 'es-ES' });
    const after = getMarketContentDemoView(state);
    expect(after.contentResolution).toMatchObject({ outcome: 'fallback', requestedLocale: 'fr-FR', resolvedLocale: 'es-ES', reason: 'not_published' });
    expect(after.preview.fields?.title).toBe('Cuida las piezas que te acompañan');
    expect(after.currentPlan).toEqual(before);
    expect(after.currentPlan.pages.some((page) => page.locale === 'fr-FR')).toBe(false);
    expect(after.currentPlan.pages.some((page) => page.alternates.some((alternate) => alternate.hreflang === 'fr-FR'))).toBe(false);
    expect(after.virtualStep).toBe(0);
  });

  it('permite elegir idioma explícito sin cambiar mercado, moneda ni publicación', () => {
    const state = configure(createMarketContentDemo(), { marketId: 'FR', locale: 'ca-ES' });
    const view = getMarketContentDemoView(state);
    expect(view.marketResolution).toMatchObject({ market: { id: 'FR', currency: 'EUR' } });
    expect(view.contentResolution).toMatchObject({ outcome: 'matched', resolvedLocale: 'ca-ES' });
    expect(view.preview.fields?.title).toBe('Cuida les peces que t’acompanyen');
    expect(view.currentPlan.pages).toHaveLength(4);
  });

  it('identifica la traducción publicada pendiente de revisar y comparte política con el plan de URLs', () => {
    const initial = configure(createMarketContentDemo(), { contentId: 'demo.story', locale: 'ca-ES' });
    const included = getMarketContentDemoView(initial);
    expect(included.preview).toMatchObject({ label: 'Publicada · Pendiente de revisar', needsReview: true });
    expect(included.editions.find((row) => row.locale === 'ca-ES')).toMatchObject({ publishedRevision: 2, needsReview: true, statusLabel: 'Publicada · Pendiente de revisar' });
    expect(included.currentPlan.pages).toHaveLength(4);
    expect(included.currentPlan.pages.find((page) => page.contentId === 'demo.story' && page.locale === 'ca-ES')?.freshness).toBe('stale');
    const excludedState = configure(initial, { staleTranslations: 'exclude' });
    const excluded = getMarketContentDemoView(excludedState);
    expect(excluded.contentResolution).toMatchObject({ outcome: 'unresolved', reason: 'stale' });
    expect(excluded.preview).toMatchObject({ fields: null, needsReview: true });
    expect(excluded.currentPlan.pages).toHaveLength(3);
    expect(excluded.currentPlan.exclusions).toEqual([expect.objectContaining({ contentId: 'demo.story', locale: 'ca-ES', reason: 'stale' })]);
    expect(excluded.diff.removed).toEqual([expect.objectContaining({ contentId: 'demo.story', locale: 'ca-ES' })]);
    expect(excluded.diff.added).toEqual([]);
    expect(excluded.diff.updated).toEqual([expect.objectContaining({ contentId: 'demo.story', locale: 'es-ES' })]);
    expect(excludedState.contents).toBe(initial.contents);
    const fallback = getMarketContentDemoView(configure(excludedState, { fallback: 'es-ES' }));
    expect(fallback.contentResolution).toMatchObject({ outcome: 'fallback', reason: 'stale', resolvedLocale: 'es-ES' });
    expect(fallback.currentPlan).toEqual(excluded.currentPlan);
  });

  it('conserva buffers independientes al cambiar contenido, mercado o idioma', () => {
    let state = editMarketContentDemo(createMarketContentDemo(), { field: 'title', value: 'Unsaved guide' });
    state = configure(state, { contentId: 'demo.story', marketId: 'FR', locale: 'fr-FR' });
    expect(getMarketContentDemoView(state).editor).toMatchObject({ dirty: false, fields: { title: 'A new chapter in the workshop' } });
    state = editMarketContentDemo(state, { field: 'summary', value: 'Unsaved story' });
    state = configure(state, { contentId: 'demo.guide' });
    expect(getMarketContentDemoView(state).editor).toMatchObject({ dirty: true, fields: { title: 'Unsaved guide' } });
    state = configure(state, { contentId: 'demo.story' });
    expect(getMarketContentDemoView(state).editor).toMatchObject({ dirty: true, fields: { summary: 'Unsaved story' } });
    expect(state.virtualStep).toBe(0);
    expect(getMarketContentDemoView(state).currentPlan).toEqual(getMarketContentDemoView(createMarketContentDemo()).currentPlan);
  });

  it('rechaza selección fuera de los fixtures y accesores sin ejecutarlos', () => {
    const state = createMarketContentDemo();
    const getter = vi.fn(() => 'FR');
    for (const invalid of [
      { ...state.selection, marketId: 'US' }, { ...state.selection, contentId: 'real-product' },
      { ...state.selection, locale: 'en-US' }, { ...state.selection, fallback: 'fr-FR' },
      { ...state.selection, staleTranslations: 'automatic' }, { ...state.selection, extra: true },
      Object.defineProperty({ ...state.selection }, 'marketId', { enumerable: true, get: getter }),
    ]) expect(() => configureMarketContentDemo(state, invalid as never)).toThrow(RangeError);
    expect(getter).not.toHaveBeenCalled();
  });
});

describe('buffer y transiciones editoriales del ejemplo', () => {
  it('editar no guarda automáticamente ni cambia las URLs, y bloquea review/publicación pendientes', () => {
    const initial = createMarketContentDemo();
    const edited = editMarketContentDemo(initial, { field: 'title', value: 'A new title in the buffer' });
    expect(edited.contents).toBe(initial.contents);
    expect(edited.bindings).toBe(initial.bindings);
    expect(edited.virtualStep).toBe(0);
    expect(getMarketContentDemoView(edited).editor).toMatchObject({ dirty: true, canSave: true, canReview: false, canPublish: false,
      blockedReason: 'Guarda los cambios antes de continuar.' });
    for (const blocked of [submitMarketContentDemoReview(edited), publishMarketContentDemoDraft(edited)]) {
      expect(blocked.feedback.code).toBe('pending_changes');
      expect(blocked.contents).toBe(initial.contents);
      expect(blocked.bindings).toBe(initial.bindings);
      expect(blocked.virtualStep).toBe(0);
    }
    expect(getMarketContentDemoView(edited).diff).toEqual({ added: [], removed: [], updated: [] });
  });

  it('recorre guardar → review → publicar mediante contratos reales y añade únicamente una URL inglesa', () => {
    const initial = createMarketContentDemo();
    const otherContent = content(initial, 'demo.story');
    let state = editMarketContentDemo(initial, { field: 'title', value: 'A publication in English' });
    state = saveMarketContentDemoDraft(state);
    expect(state.feedback).toMatchObject({ tone: 'success', code: 'save_draft' });
    expect(english(state)).toMatchObject({ draft: { revision: 4, status: 'draft', fields: { title: 'A publication in English' } }, published: null });
    expect(getMarketContentDemoView(state).editor).toMatchObject({ dirty: false, canSave: false, canReview: true, canPublish: false });
    expect(state.virtualStep).toBe(1);
    expect(content(state).updatedAt).toBe('2026-10-03T12:01:00.000Z');
    expect(getMarketContentDemoView(state).diff).toEqual({ added: [], removed: [], updated: [] });
    const saved = state;
    state = submitMarketContentDemoReview(state);
    expect(english(state).draft).toMatchObject({ revision: 4, status: 'review' });
    expect(getMarketContentDemoView(state).editor).toMatchObject({ canReview: false, canPublish: true });
    expect(publicShape(state)).toEqual(publicShape(saved));
    state = publishMarketContentDemoDraft(state);
    expect(english(state)).toMatchObject({ draft: null, published: { revision: 4, publishedAt: '2026-10-03T12:03:00.000Z', fields: { title: 'A publication in English' } } });
    expect(state.virtualStep).toBe(3);
    expect(content(state, 'demo.story')).toBe(otherContent);
    const view = getMarketContentDemoView(state);
    expect(view.currentPlan.pages).toHaveLength(5);
    expect(view.diff.added).toEqual([expect.objectContaining({ contentId: 'demo.guide', locale: 'en-GB', publishedRevision: 4,
      url: 'https://es.example.test/en/care-guide', lastmod: '2026-10-03T12:03:00.000Z' })]);
    expect(view.diff.removed).toEqual([]);
    expect(view.diff.updated.map(({ locale }) => locale).sort()).toEqual(['ca-ES', 'es-ES']);
    const links = guideUrls(state).map((page) => page.alternates);
    expect(links[0]).toEqual(links[1]);
    expect(links[1]).toEqual(links[2]);
    expect(links[0]?.map(({ hreflang }) => hreflang).sort()).toEqual(['ca-ES', 'en-GB', 'es-ES', 'x-default']);
    expect(getMarketContentDemoView(configure(state, { locale: 'en-GB' })).preview.fields?.title).toBe('A publication in English');
  });

  it('editar una publicación conserva campos, URL, revisión y lastmod hasta publicar de nuevo', () => {
    const initial = published();
    const previous = english(initial).published;
    const initialUrls = publicShape(initial);
    let state = editMarketContentDemo(initial, { field: 'bodyPlainText', value: 'A second version, still only in a buffer.' });
    expect(english(state).published).toEqual(previous);
    state = saveMarketContentDemoDraft(state);
    expect(english(state).published).toEqual(previous);
    expect(english(state).draft?.revision).toBeGreaterThan(previous!.revision);
    expect(publicShape(state)).toEqual(initialUrls);
    state = submitMarketContentDemoReview(state);
    expect(publicShape(state)).toEqual(initialUrls);
    expect(getMarketContentDemoView(configure(state, { locale: 'en-GB' })).preview.fields).toEqual(previous!.fields);
    state = publishMarketContentDemoDraft(state);
    const after = english(state).published!;
    expect(after.revision).toBeGreaterThan(previous!.revision);
    expect(after.publishedAt > previous!.publishedAt).toBe(true);
    const page = getMarketContentDemoView(state).currentPlan.pages.find((item) => item.locale === 'en-GB')!;
    expect(page.url).toBe('https://es.example.test/en/care-guide');
    expect(page.publishedRevision).toBe(after.revision);
    expect(page.lastmod).toBe(after.publishedAt);
    expect(getMarketContentDemoView(state).currentPlan.pages).toHaveLength(5);
  });

  it('un cambio sin guardar bloquea publicar un draft ya revisado; revertir el buffer recupera el estado previo', () => {
    let state = submitMarketContentDemoReview(createMarketContentDemo());
    expect(getMarketContentDemoView(state).editor.canPublish).toBe(true);
    const original = getMarketContentDemoView(state).editor.fields.title;
    const pending = editMarketContentDemo(state, { field: 'title', value: 'Unsaved after review' });
    expect(publishMarketContentDemoDraft(pending).feedback.code).toBe('pending_changes');
    expect(english(pending).draft?.status).toBe('review');
    state = editMarketContentDemo(pending, { field: 'title', value: original });
    expect(getMarketContentDemoView(state).editor).toMatchObject({ dirty: false, canPublish: true });
    expect(publishMarketContentDemoDraft(state).feedback.code).toBe('publish');
  });

  it('guardar sobre review invalida la revisión, sin publicar ni saltar el paso editorial', () => {
    const reviewed = submitMarketContentDemoReview(createMarketContentDemo());
    const saved = saveMarketContentDemoDraft(editMarketContentDemo(reviewed, { field: 'title', value: 'A new draft after review' }));
    expect(english(saved).draft?.status).toBe('draft');
    expect(english(saved).draft!.revision).toBeGreaterThan(english(reviewed).draft!.revision);
    expect(publishMarketContentDemoDraft(saved).feedback.code).toBe('review_required');
    expect(getMarketContentDemoView(saved).currentPlan.pages).toHaveLength(4);
  });

  it.each([
    ['title', 'x'.repeat(201)], ['summary', 'x'.repeat(1_001)], ['bodyPlainText', 'x'.repeat(20_001)],
    ['title', 'control\u0000'],
  ] as const)('presenta el error de %s sin perder la publicación ni permitir nuevas transiciones', (field, value) => {
    const initial = published();
    const invalid = editMarketContentDemo(initial, { field, value });
    const view = getMarketContentDemoView(invalid);
    expect(view.editor.fieldErrors[field]).toBeTruthy();
    expect(view.editor.fields[field]).toBe(value);
    expect(view.editor).toMatchObject({ dirty: true, canSave: false, canReview: false, canPublish: false });
    for (const next of [saveMarketContentDemoDraft(invalid), submitMarketContentDemoReview(invalid), publishMarketContentDemoDraft(invalid)]) {
      expect(next.feedback.code).toBe('invalid_fields');
      expect(next.contents).toBe(initial.contents);
      expect(next.bindings).toBe(initial.bindings);
      expect(next.virtualStep).toBe(initial.virtualStep);
    }
    const corrected = editMarketContentDemo(invalid, { field, value: 'Corrected text' });
    expect(getMarketContentDemoView(corrected).editor.fieldErrors).toEqual({});
    expect(getMarketContentDemoView(corrected).editor.canSave).toBe(true);
  });

  it('permite guardar un borrador incompleto y deriva del dominio el bloqueo de revisión', () => {
    let state = editMarketContentDemo(createMarketContentDemo(), { field: 'summary', value: '' });
    expect(getMarketContentDemoView(state).editor.canSave).toBe(true);
    state = saveMarketContentDemoDraft(state);
    expect(getMarketContentDemoView(state).editor).toMatchObject({ fieldErrors: {}, dirty: false, canReview: false, canPublish: false });
    expect(getMarketContentDemoView(state).editor.blockedReason).toContain('Completa');
    expect(submitMarketContentDemoReview(state).feedback.code).toBe('content_incomplete');
    expect(english(state).published).toBeNull();
  });

  it('no consume tiempo virtual para acciones bloqueadas, selección, lectura o guardar sin cambios', () => {
    const initial = createMarketContentDemo();
    expect(publishMarketContentDemoDraft(initial).feedback.code).toBe('review_required');
    const unchanged = saveMarketContentDemoDraft(initial);
    expect(unchanged.feedback.code).toBe('no_changes');
    expect(unchanged.virtualStep).toBe(0);
    expect(unchanged.contents).toBe(initial.contents);
    const read = getMarketContentDemoView(initial);
    expect(read.virtualStep).toBe(0);
    const switched = configure(initial, { contentId: 'demo.story' });
    expect(switched.virtualStep).toBe(0);
    expect(getMarketContentDemoView(submitMarketContentDemoReview(switched)).virtualStep).toBe(1);
  });

  it('mantiene reloj global determinista entre contenidos y publica la segunda pieza sin alterar la primera', () => {
    const guide = published();
    let state = configure(guide, { contentId: 'demo.story', staleTranslations: 'exclude' });
    state = published(state);
    expect(state.virtualStep).toBe(6);
    expect(content(state, 'demo.guide')).toBe(content(guide, 'demo.guide'));
    expect(english(state).published!.publishedAt).toBe('2026-10-03T12:06:00.000Z');
    expect(getMarketContentDemoView(state).currentPlan.pages).toHaveLength(5);
    expect(getMarketContentDemoView(state).currentPlan.pages.find((page) => page.contentId === 'demo.story' && page.locale === 'en-GB')?.url)
      .toBe('https://es.example.test/en/workshop-story');
  });

  it('restablece fixtures, buffers, política, publicaciones y tiempo sin mutar estados anteriores', () => {
    const initial = createMarketContentDemo();
    const changed = configure(published(initial), { contentId: 'demo.story', marketId: 'FR', staleTranslations: 'exclude' });
    const reset = createMarketContentDemo();
    expect(reset).toEqual(initial);
    expect(getMarketContentDemoView(reset)).toEqual(getMarketContentDemoView(initial));
    expect(getMarketContentDemoView(changed).currentPlan.pages.some((page) => page.locale === 'en-GB')).toBe(true);
    expect(getMarketContentDemoView(reset).currentPlan.pages.some((page) => page.locale === 'en-GB')).toBe(false);
    expect(published(reset)).toEqual(published(initial));
  });

  it('rechaza acciones ajenas al perfil y getters sin ejecutarlos', () => {
    const state = createMarketContentDemo();
    const getter = vi.fn(() => 'title');
    for (const input of [
      { field: 'slug', value: 'new-url' }, { field: 'title', value: 42 }, { field: 'title', value: 'a', locale: 'fr-FR' },
      Object.defineProperty({ value: 'a' }, 'field', { enumerable: true, get: getter }),
    ]) expect(() => editMarketContentDemo(state, input as never)).toThrow(RangeError);
    expect(getter).not.toHaveBeenCalled();
  });

  it('devuelve estados y DTOs congelados y no consulta reloj, red, storage ni temporizadores', () => {
    const unexpected = () => { throw new Error('Unexpected external effect'); };
    vi.spyOn(Date, 'now').mockImplementation(unexpected);
    vi.stubGlobal('fetch', unexpected);
    vi.stubGlobal('localStorage', { getItem: unexpected, setItem: unexpected });
    vi.stubGlobal('sessionStorage', { getItem: unexpected, setItem: unexpected });
    vi.stubGlobal('setTimeout', unexpected);
    const state = published();
    const view = getMarketContentDemoView(state);
    for (const value of [state, state.selection, state.contents, state.editors, state.editors['demo.guide'],
      state.editors['demo.guide'].fields, state.bindings, state.feedback, view, view.preview, view.editions,
      view.editor, view.editor.fieldErrors, view.currentPlan, view.diff, view.diff.added]) expect(Object.isFrozen(value)).toBe(true);
    expect(() => { (view.editor.fields as { title: string }).title = 'Mutation'; }).toThrow();
    expect(view.currentPlan.pages).toHaveLength(5);
    expect(getMarketContentDemoView(createMarketContentDemo()).currentPlan.pages).toHaveLength(4);
  });
});
