import {
  defineLocalizedContent, resolveLocalizedContent,
  type LocalizedContent,
} from '../domain/localized-content';

export const MAX_INTERNATIONAL_URLS = 1000;
const MAX_CONTENTS = 100;
const MAX_ROUTES = 50;

/**
 * Perfil técnico versionado: códigos asignados ISO 639-1/3166-1 alpha-2.
 * Scripts deliberadamente acotados; no representa todo ISO 15924. Las listas
 * son datos propios del contrato, sin consulta a ICU/servicios para membresía.
 */
export const INTERNATIONAL_HREFLANG_PROFILE = Object.freeze({
  id: 'iso-alpha2-script-subset-v1',
  languageCodes: Object.freeze(('aa ab ae af ak am an ar as av ay az ba be bg bh bi bm bn bo br bs ca ce ch co cr cs cu cv cy ' +
    'da de dv dz ee el en eo es et eu fa ff fi fj fo fr fy ga gd gl gn gu gv ha he hi ho hr ht hu hy hz ia id ie ig ii ik io is it iu ' +
    'ja jv ka kg ki kj kk kl km kn ko kr ks ku kv kw ky la lb lg li ln lo lt lu lv mg mh mi mk ml mn mr ms mt my na nb nd ne ng nl nn no nr nv ny ' +
    'oc oj om or os pa pi pl ps pt qu rm rn ro ru rw sa sc sd se sg si sk sl sm sn so sq sr ss st su sv sw ta te tg th ti tk tl tn to tr ts tt tw ty ' +
    'ug uk ur uz ve vi vo wa wo xh yi yo za zh zu').split(' ')),
  regionCodes: Object.freeze(('AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ ' +
    'CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR ' +
    'GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP ' +
    'KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ ' +
    'NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW ' +
    'SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ ' +
    'UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW').split(' ')),
  scriptCodes: Object.freeze(['Arab', 'Cyrl', 'Hans', 'Hant', 'Latn']),
  // Intl canonicaliza tl como fil; hreflang conserva su representación ISO alpha-2.
  languageAliases: Object.freeze({ fil: 'tl' }),
});
const HREFLANG_LANGUAGES = new Set(INTERNATIONAL_HREFLANG_PROFILE.languageCodes);
const HREFLANG_REGIONS = new Set(INTERNATIONAL_HREFLANG_PROFILE.regionCodes);
const HREFLANG_SCRIPTS = new Set(INTERNATIONAL_HREFLANG_PROFILE.scriptCodes);

export type InternationalAlternate = Readonly<{ hreflang: string; href: string }>;
export type InternationalPage = Readonly<{
  contentId: string;
  contentVersion: number;
  locale: string;
  publishedRevision: number;
  freshness: 'current' | 'stale';
  origin: string;
  url: string;
  canonical: string;
  lastmod: string;
  alternates: readonly InternationalAlternate[];
}>;
export type InternationalUrlExclusion = Readonly<{
  contentId: string;
  contentVersion: number;
  locale: string;
  publishedRevision: number;
  reason: 'stale' | 'source_unpublished';
}>;
export type InternationalUrlPlan = Readonly<{
  pages: readonly InternationalPage[];
  sitemaps: readonly Readonly<{
    origin: string;
    entries: readonly Readonly<{ loc: string; lastmod: string }>[];
  }>[];
  exclusions: readonly InternationalUrlExclusion[];
}>;

export class InternationalUrlPlanContractError extends Error {
  readonly code = 'international_url_plan_contract_invalid';

  constructor(message: string) {
    super(message);
    this.name = 'InternationalUrlPlanContractError';
  }
}

function invalid(field: string, detail: string): never {
  throw new InternationalUrlPlanContractError(`${field}: ${detail}`);
}

function record(input: unknown, keys: readonly string[], field: string): Record<string, unknown> {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) return invalid(field, 'debe ser un objeto de datos.');
  const prototype = Object.getPrototypeOf(input);
  if (prototype !== Object.prototype && prototype !== null) return invalid(field, 'debe contener datos propios.');
  const actual = Reflect.ownKeys(input);
  if (actual.length !== keys.length) return invalid(field, 'contiene campos ausentes o desconocidos.');
  for (const key of actual) {
    const descriptor = Object.getOwnPropertyDescriptor(input, key)!;
    if (typeof key !== 'string' || !keys.includes(key) || !descriptor.enumerable || !('value' in descriptor)) {
      return invalid(field, 'solo admite los campos declarados, propios y sin accesores.');
    }
  }
  return input as Record<string, unknown>;
}

function array(input: unknown, maximum: number, field: string): readonly unknown[] {
  if (!Array.isArray(input) || Object.getPrototypeOf(input) !== Array.prototype || input.length > maximum ||
    Reflect.ownKeys(input).length !== input.length + 1) return invalid(field, 'array inválido o demasiado grande.');
  for (let index = 0; index < input.length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(input, String(index));
    if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) return invalid(field, 'no admite huecos ni accesores.');
  }
  return input;
}

function locale(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 100 || /-[a-z0-9]-/i.test(value)) {
    return invalid(field, 'locale inválido o con extensiones.');
  }
  try {
    const canonical = Intl.getCanonicalLocales(value)[0];
    if (canonical && canonical.length <= 100) return canonical;
  } catch { /* No se infiere un locale desde el entorno. */ }
  return invalid(field, 'locale inválido.');
}

function hreflang(value: unknown, routeLocale: string, field: string): string {
  const canonicalLocale = locale(value, field);
  const parts = canonicalLocale.split('-');
  if (parts[0] === 'fil') parts[0] = INTERNATIONAL_HREFLANG_PROFILE.languageAliases.fil;
  const canonical = parts.join('-');
  const script = parts.slice(1).find((part) => part.length === 4);
  const region = parts.slice(1).find((part) => part.length === 2);
  if (!/^[a-z]{2}(?:-[A-Z][a-z]{3})?(?:-[A-Z]{2})?$/.test(canonical) ||
    canonicalLocale.split('-')[0] !== routeLocale.split('-')[0] || !HREFLANG_LANGUAGES.has(parts[0]!) ||
    (script !== undefined && !HREFLANG_SCRIPTS.has(script)) ||
    (region !== undefined && !HREFLANG_REGIONS.has(region))) {
    return invalid(field, 'exige idioma/región ISO alpha-2 y script del perfil admitido, con el mismo idioma base del locale.');
  }
  return canonical;
}

function origin(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length > 300) return invalid(field, 'origen HTTPS canónico inválido.');
  try {
    const url = new URL(value);
    const labels = url.hostname.split('.');
    if (url.protocol === 'https:' && url.origin === value && url.port === '' &&
      labels.length >= 2 && url.hostname.length <= 253 &&
      labels.every((label) => label.length <= 63 && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label)) &&
      /^[a-z]/.test(labels[labels.length - 1]!)) return value;
  } catch { /* No se consulta DNS ni se admiten URL relativas. */ }
  return invalid(field, 'exige origen HTTPS con dominio canónico, sin puerto, credenciales, ruta, query ni fragmento.');
}

function segment(value: unknown, allowEmpty: boolean, field: string): string {
  if (typeof value !== 'string' || value.length > 200) return invalid(field, 'segmento inválido.');
  const normalized = value.normalize('NFC');
  if (allowEmpty && normalized === '') return '';
  if (!/^[\p{L}\p{N}][\p{L}\p{N}\p{M}_-]*$/u.test(normalized)) {
    return invalid(field, 'usa un segmento literal de letras/números, guiones o guiones bajos; sin escapes ni separadores.');
  }
  return encodeURIComponent(normalized);
}

function prefix(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length > 500 || !value.startsWith('/')) {
    return invalid(field, 'debe ser una subruta absoluta.');
  }
  if (value === '/') return '/';
  return `/${value.slice(1).split('/').map((part) => segment(part, false, field)).join('/')}`;
}

function contentReference(value: unknown, contents: ReadonlyMap<string, LocalizedContent>, field: string): LocalizedContent {
  if (typeof value !== 'string' || !contents.has(value)) return invalid(field, 'debe referenciar un contenido recibido.');
  return contents.get(value)!;
}

const compare = (left: string, right: string): number => left < right ? -1 : left > right ? 1 : 0;

type Route = Readonly<{ locale: string; origin: string; pathPrefix: string; hreflang: string }>;
type PendingPage = Omit<InternationalPage, 'alternates'>;

/**
 * Plan de datos para QA. No publica, prueba rutas HTTP ni modifica el sitemap servido.
 * Cada binding referencia una revisión publicada exacta; el fallback editorial
 * nunca inventa otra traducción. Un borrador no modifica URL ni fecha publicadas.
 */
export function planInternationalUrls(input: unknown): InternationalUrlPlan {
  const plan = record(input, ['contents', 'routes', 'bindings', 'xDefaults', 'staleTranslations'], 'plan');
  if (plan.staleTranslations !== 'include' && plan.staleTranslations !== 'exclude') {
    return invalid('plan.staleTranslations', 'debe declarar include o exclude.');
  }
  const contents = new Map<string, LocalizedContent>();
  for (const entry of array(plan.contents, MAX_CONTENTS, 'plan.contents')) {
    const content = defineLocalizedContent(entry);
    if (contents.has(content.id)) return invalid('plan.contents', 'contenido duplicado.');
    contents.set(content.id, content);
  }

  const routes = new Map<string, Route>();
  for (const entry of array(plan.routes, MAX_ROUTES, 'plan.routes')) {
    const row = record(entry, ['locale', 'origin', 'pathPrefix', 'hreflang'], 'route');
    const language = locale(row.locale, 'route.locale');
    if (routes.has(language)) return invalid('plan.routes', 'locale duplicado.');
    routes.set(language, Object.freeze({ locale: language, origin: origin(row.origin, 'route.origin'),
      pathPrefix: prefix(row.pathPrefix, 'route.pathPrefix'), hreflang: hreflang(row.hreflang, language, 'route.hreflang') }));
  }

  const urls = new Set<string>();
  const bindings = new Set<string>();
  const pending: PendingPage[] = [];
  const exclusions: InternationalUrlExclusion[] = [];
  for (const entry of array(plan.bindings, MAX_INTERNATIONAL_URLS, 'plan.bindings')) {
    const row = record(entry, ['contentId', 'locale', 'publishedRevision', 'slug'], 'binding');
    const content = contentReference(row.contentId, contents, 'binding.contentId');
    const language = locale(row.locale, 'binding.locale');
    const key = JSON.stringify([content.id, language]);
    if (bindings.has(key)) return invalid('plan.bindings', 'contenido/locale duplicado.');
    bindings.add(key);
    const route = routes.get(language);
    if (!route) return invalid('binding.locale', 'falta configuración explícita de URL.');
    const publication = content.editions.find((edition) => edition.locale === language)?.published;
    if (!publication || row.publishedRevision !== publication.revision) {
      return invalid('binding.publishedRevision', 'debe señalar exactamente una revisión publicada existente.');
    }
    const slug = segment(row.slug, true, 'binding.slug');
    const pathname = route.pathPrefix === '/' ? `/${slug}` : `${route.pathPrefix}${slug ? `/${slug}` : ''}`;
    const url = new URL(pathname, route.origin).href;
    if (url.length > 2048 || urls.has(url)) return invalid('plan.bindings', 'URL duplicada o demasiado larga.');
    // También reservamos las URLs de bindings excluidos para detectar conflictos latentes.
    urls.add(url);
    const reference = { contentId: content.id, contentVersion: content.version,
      locale: language, publishedRevision: publication.revision };
    const resolved = resolveLocalizedContent(content, { requestedLocale: language,
      fallback: { strategy: 'none' }, staleTranslations: plan.staleTranslations });
    if (resolved.outcome === 'unresolved') {
      if (resolved.reason !== 'stale' && resolved.reason !== 'source_unpublished') {
        return invalid('binding', 'la publicación no se puede resolver exactamente.');
      }
      exclusions.push(Object.freeze({ ...reference, reason: resolved.reason }));
      continue;
    }
    if (resolved.outcome !== 'matched' || resolved.resolvedLocale !== language) {
      return invalid('binding', 'un fallback no puede crear una URL localizada.');
    }
    pending.push({ ...reference, freshness: resolved.freshness, origin: route.origin,
      url, canonical: url, lastmod: resolved.publication.publishedAt });
  }

  const defaults = new Map<string, string>();
  for (const entry of array(plan.xDefaults, MAX_CONTENTS, 'plan.xDefaults')) {
    const row = record(entry, ['contentId', 'locale'], 'xDefault');
    const content = contentReference(row.contentId, contents, 'xDefault.contentId');
    const language = locale(row.locale, 'xDefault.locale');
    if (defaults.has(content.id)) return invalid('plan.xDefaults', 'contenido duplicado.');
    const target = pending.find((page) => page.contentId === content.id && page.locale === language);
    if (!target) return invalid('xDefault.locale', 'debe señalar una publicación incluida en este plan.');
    defaults.set(content.id, target.url);
  }

  const alternates = new Map<string, readonly InternationalAlternate[]>();
  for (const contentId of new Set(pending.map((page) => page.contentId))) {
    const members = pending.filter((page) => page.contentId === contentId);
    const tags = new Set<string>();
    const links = members.map((page): InternationalAlternate => {
      const tag = routes.get(page.locale)!.hreflang;
      if (tags.has(tag)) return invalid('plan.routes', 'dos ediciones del mismo contenido comparten hreflang.');
      tags.add(tag);
      return Object.freeze({ hreflang: tag, href: page.url });
    });
    const defaultUrl = defaults.get(contentId);
    if (defaultUrl) links.push(Object.freeze({ hreflang: 'x-default', href: defaultUrl }));
    alternates.set(contentId, Object.freeze(links.sort((left, right) => compare(left.hreflang, right.hreflang))));
  }
  const pages = Object.freeze(pending.sort((left, right) => compare(left.url, right.url))
    .map((page): InternationalPage => Object.freeze({ ...page, alternates: alternates.get(page.contentId)! })));
  const sitemaps = Object.freeze([...new Set(pages.map((page) => page.origin))].sort(compare).map((site) => Object.freeze({
    origin: site,
    entries: Object.freeze(pages.filter((page) => page.origin === site)
      .map((page) => Object.freeze({ loc: page.url, lastmod: page.lastmod }))),
  })));
  return Object.freeze({ pages, sitemaps,
    exclusions: Object.freeze(exclusions.sort((left, right) => compare(left.contentId, right.contentId) || compare(left.locale, right.locale))) });
}
