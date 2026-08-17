/**
 * Auditor de accesibilidad de las superficies de tienda Y del panel — Chrome
 * headless vía CDP, SIN dependencias nuevas.
 * ============================================================================
 *
 * Mismo motor que `scripts/capture-screens.mjs` (WebSocket global de Node +
 * DevTools Protocol). En vez de capturar, inyecta una batería de comprobaciones
 * WCAG 2.2 AA computables en el DOM real y devuelve los hallazgos agrupados.
 *
 * Por qué propio y no axe-core: una librería de cliente es dependencia nueva
 * (veto del arquitecto) y aquí solo necesitamos las reglas que este repo puede
 * romper de verdad — contraste por tema (los acentos claros son el riesgo
 * conocido), nombre accesible, jerarquía, área táctil, overflow a 375 y
 * reduced-motion.
 *
 * Cubre todas las tiendas registradas (catálogo/ficha/carrito/checkout ×
 * 1440/375/reduced-motion), el panel × 1440/375 y las páginas
 * comerciales/utilitarias × 1440/375 (la landing también con reduced-motion).
 * El panel entra con el POST real del login y la cookie de
 * sesión; sus ids de pedido se resuelven en vivo por estado, nunca se fijan a
 * mano. Las variantes @dark se retiraron en F12.0: NADA del código responde a
 * prefers-color-scheme, así que eran cobertura fantasma (ver el comentario en
 * el bucle de tiendas).
 *
 * USO:
 *   1. pnpm db:reset && pnpm build
 *   2. npx wrangler dev --port 8787          (en otra terminal)
 *   3. node scripts/a11y-audit.mjs           [--only=<substr>] [--json]
 *
 * NO levantes dos servidores (astro dev + wrangler) contra la misma D1 local:
 * se pelean por el sqlite y el segundo acaba colgado sirviendo 000. Usa uno y
 * apúntale con BASE_URL.
 *
 * OJO con el puerto: si el servidor lo arrancaron las browser tools desde
 * `.claude/launch.json` NO está en 8787 (`wrangler-preview` usa 8788 y
 * `wrangler-dev` 8799). Pásalo con BASE_URL en vez de arrancar un segundo
 * wrangler contra la misma D1 local:
 *   BASE_URL=http://127.0.0.1:8788 node scripts/a11y-audit.mjs
 *
 * Salida: informe por superficie. Exit code 1 si hay hallazgos de severidad
 * `error` (los `warn` se listan pero no rompen).
 */
import { spawn } from 'node:child_process';
import { rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:8787';
const CHROME_CANDIDATES = [
  process.env.CHROME_BIN,
  '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  '/usr/bin/chromium',
  '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean);

const args = process.argv.slice(2);
const ONLY = args.find((a) => a.startsWith('--only='))?.slice('--only='.length);
const AS_JSON = args.includes('--json');

const DESKTOP = { w: 1440, h: 900, dsf: 1, mobile: false };
const MOBILE = { w: 375, h: 812, dsf: 1, mobile: true };

// ── Superficies ────────────────────────────────────────────────────────────
// Las tiendas vivas. `demo` (La Botiga) conserva las rutas históricas.
const STORES = [
  { id: 'monte', label: 'MONTE', prefix: '/demo/tiendas/monte', slug: 'mon-pepper', cartKey: 'ecom-cart:monte', canQuote: false },
  { id: 'mixta', label: 'MIXTA', prefix: '/demo/tiendas/mixta', slug: 'mix-polvo-nube', cartKey: 'ecom-cart:mixta', canQuote: false },
  { id: 'lumbre', label: 'LUMBRE', prefix: '/demo/tiendas/lumbre', slug: 'lum-soma-terracota', cartKey: 'ecom-cart:lumbre', canQuote: false },
  { id: 'dintel', label: 'DINTEL', prefix: '/demo/tiendas/dintel', slug: 'din-mesa-traves', cartKey: 'ecom-cart:dintel', canQuote: false },
  { id: 'traza', label: 'TRAZA', prefix: '/demo/tiendas/traza', slug: 'tra-mesa-rasante', cartKey: 'ecom-cart:traza', canQuote: false },
  { id: 'bruma', label: 'BRUMA', prefix: '/demo/tiendas/bruma', slug: 'bru-niebla-alta', cartKey: 'ecom-cart:bruma', canQuote: false },
  { id: 'brio', label: 'BRÍO', prefix: '/demo/tiendas/brio', slug: 'bri-espalda-libre', cartKey: 'ecom-cart:brio', canQuote: false },
  { id: 'alva', label: 'ALVA', prefix: '/demo/tiendas/alva', slug: 'alv-lina-shoulder-black', cartKey: 'ecom-cart:alva' },
  // Estas direcciones recientes conservan carrito local, pero su composición
  // no incluye calculadora de portes. El estado activo no existe y no debe
  // contarse como una pantalla fallida.
  { id: 'orbe', label: 'ORBE', prefix: '/demo/tiendas/orbe', slug: 'orb-renew-serum', cartKey: 'ecom-cart:orbe', canQuote: false },
  { id: 'viso', label: 'VISO', prefix: '/demo/tiendas/viso', slug: 'vis-spectra-01', cartKey: 'ecom-cart:viso', canQuote: false },
  { id: 'nera', label: 'NERA', prefix: '/demo/tiendas/nera', slug: 'ner-blazer-negra', cartKey: 'ecom-cart:nera', canQuote: false },
  { id: 'litica', label: 'LÍTICA', prefix: '/demo/tiendas/litica', slug: 'lit-mineral-wash', cartKey: 'ecom-cart:litica' },
  { id: 'summit', label: 'SUMMIT', prefix: '/demo/tiendas/summit', slug: 'sum-shell-07', cartKey: 'ecom-cart:summit' },
  { id: 'sillage', label: 'SILLAGE', prefix: '/demo/tiendas/sillage', slug: 'sil-cedro-solar', cartKey: 'ecom-cart:sillage' },
  { id: 'argent', label: 'ARGENT.', prefix: '/demo/tiendas/argent', slug: 'arg-checked-sarong-skirt', cartKey: 'ecom-cart:argent' },
  { id: 'street', label: 'ASFALTO', prefix: '/demo/tiendas/street', slug: 'str-vuelta-9', cartKey: 'ecom-cart:street' },
  { id: 'industrial', label: 'METRIA', prefix: '/demo/tiendas/industrial', slug: 'ind-mv-320', cartKey: 'ecom-cart:industrial' },
  { id: 'natural', label: 'Romer', prefix: '/demo/tiendas/natural', slug: 'nat-crema-rostro', cartKey: 'ecom-cart:natural' },
  { id: 'specs', label: 'Kalibre', prefix: '/demo/tiendas/specs', slug: 'spe-platina-base', cartKey: 'ecom-cart:specs' },
  { id: 'launch', label: 'Vector', prefix: '/demo/tiendas/launch', slug: 'lau-vector-one', cartKey: 'ecom-cart:launch' },
  { id: 'minimal', label: 'Forma Interior', prefix: '/demo/tiendas/minimal', slug: 'min-butaca-arc', cartKey: 'ecom-cart:minimal' },
  { id: 'editorial', label: 'Módulo Audio', prefix: '/demo/tiendas/editorial', slug: 'edi-radio-r2', cartKey: 'ecom-cart:editorial' },
  { id: 'guide', label: 'Cafetal', prefix: '/demo/tiendas/guide', slug: 'cof-molinillo-manual', cartKey: 'ecom-cart:guide' },
  { id: 'iris', label: 'Iris', prefix: '/demo/tiendas/iris', slug: 'iri-sport-pro', cartKey: 'ecom-cart:iris' },
  { id: 'forma', label: 'Forma', prefix: '/demo/tiendas/forma', slug: 'for-clear-01', cartKey: 'ecom-cart:forma' },
  // Estas tres carcasas visuales tienen un carrito de muestra independiente
  // de D1. Se siembra la forma real que leen sus páginas, no un `{slug, qty}`
  // común, y se omite el estado de portes porque usan su propia simulación.
  {
    id: 'noddo', label: 'NODDO', prefix: '/demo/tiendas/noddo', slug: 'power-node', cartKey: 'noddo-demo-cart', canQuote: false,
    cartValue: JSON.stringify([{ slug: 'power-node', name: 'Power Node', price: '129,00 €', image: '/images/collections/noddo/generated/power-node.jpg', qty: 2 }]),
  },
  {
    id: 'sitega', label: 'Sitēga', prefix: '/demo/tiendas/sitega', slug: 'basin-soft', cartKey: 'sitega-demo-cart', canQuote: false,
    cartValue: JSON.stringify([{ slug: 'basin-soft', name: 'Soft 01', price: '289,00 €', image: '/images/collections/sitega/basin-soft.jpg', qty: 2 }]),
  },
  {
    id: 'stretch', label: 'STRETCH', prefix: '/demo/tiendas/stretch', slug: 'illuminating-cleansing-gel', cartKey: 'stretch-demo-cart', canQuote: false,
    cartValue: JSON.stringify([{ slug: 'illuminating-cleansing-gel', name: 'Gel limpiador iluminador', price: '36,00 €', image: '/images/collections/stretch/cleanser.jpg', qty: 2 }]),
  },
  { id: 'arce', label: 'ARCE', prefix: '/demo/tiendas/arce', slug: 'arc-silla-alba', cartKey: 'ecom-cart:arce' },
  { id: 'demo', label: 'La Botiga', prefix: '/demo/tienda', slug: 'aove-coupage-750', cartKey: 'ecom-demo-cart', legacy: true },
];

/**
 * Rellena el código postal del carrito y espera al cálculo local:
 * con portes calculados la CTA pasa a su estado ACTIVO (`bg-brand` +
 * `text-brand-fg`), que es el par de color que cada tema puede romper. Sin
 * esto solo se auditaría el botón deshabilitado.
 */
const ACTIVATE_CTA = `(async () => {
  const cp = document.querySelector('#cp');
  const apply = document.querySelector('[data-apply-cp]');
  if (!cp || !apply) return 'sin-formulario';
  cp.value = '12001';
  cp.dispatchEvent(new Event('input', { bubbles: true }));
  apply.click();
  const cta = document.querySelector('[data-checkout-link]');
  for (let i = 0; i < 40; i++) {
    if (cta && cta.getAttribute('aria-disabled') === 'false') return 'activo';
    await new Promise((r) => setTimeout(r, 150));
  }
  return 'sigue-deshabilitado';
})()`;

// ── Panel de administración ────────────────────────────────────────────────
// El panel vive tras la cookie de sesión firmada, así que la tanda entra UNA
// vez (`auth`) y la cookie viaja sola en el resto de navegaciones del mismo
// perfil de Chrome. Se hace con el POST real del formulario, no sembrando la
// cookie a mano: así el propio login queda probado de paso.
const ADMIN_LOGIN = String.raw`(async () => {
  const r = await fetch('/demo/admin/login', {
    method: 'POST',
    body: new URLSearchParams({ password: 'demo' }),
    credentials: 'same-origin',
  });
  const u = new URL(r.url);
  if (u.pathname.startsWith('/demo/admin') && !u.pathname.includes('/login')) return 'ok';
  // El E2E termina probando el rate limit del login con 11 intentos fallidos:
  // si la tanda de a11y va detrás, la ventana de 60 s sigue abierta y el POST
  // acaba en el login con ?limited=1. No es un fallo del panel, es la cola del
  // test anterior — se distingue para poder reintentar en vez de dar 12 rojos.
  if (u.searchParams.has('limited')) return 'limitado';
  return 'fallo ' + r.status + ' → ' + u.pathname + u.search;
})()`;

/**
 * Resuelve en vivo el primer pedido en un estado dado. Los ids NO se fijan a
 * mano: la D1 local acumula los pedidos que dejan los E2E, así que un id
 * hardcodeado audita hoy un pedido pagado y mañana uno cancelado — otra
 * pantalla, con el ✓ igual de verde. Se pide por estado porque cada uno tiene
 * su interfaz: `paid` es el que enseña el formulario de envío y `shipped` el
 * que trae tracking y timeline completo.
 */
const FIRST_ORDER_OF = (estado) => String.raw`(async () => {
  const r = await fetch('/demo/admin?estado=${estado}', { credentials: 'same-origin' });
  if (!r.ok) return 'ERROR: el listado respondió ' + r.status;
  const m = (await r.text()).match(/\/demo\/admin\/pedidos\/\d+/);
  return m ? m[0] : 'ERROR: no hay ningún pedido en estado ${estado}';
})()`;

/** Resuelve el fixture que demuestra el bloqueo y el SLA de R3.4. */
const FIRST_ORDER_WITH_HOLD = String.raw`(async () => {
  const r = await fetch('/demo/admin?incidencia=active', { credentials: 'same-origin' });
  if (!r.ok) return 'ERROR: el listado de incidencias respondió ' + r.status;
  const m = (await r.text()).match(/\/demo\/admin\/pedidos\/\d+/);
  return m ? m[0] : 'ERROR: no hay ningún pedido con incidencia activa';
})()`;

/** Resuelve un producto del seed por slug para cubrir su editor de variantes. */
const PRODUCT_VARIANTS_OF = (slug) => String.raw`(async () => {
  const r = await fetch('/demo/admin/productos?q=' + encodeURIComponent(${JSON.stringify(slug)}), { credentials: 'same-origin' });
  if (!r.ok) return 'ERROR: productos respondió ' + r.status;
  const html = await r.text();
  const escaped = ${JSON.stringify(slug)}.replace(/[.*+?^\${}()|[\]\\]/g, '\\$&');
  const m = html.match(new RegExp('data-id="(\\d+)"[^>]+aria-label="Nombre de ' + escaped + '"'));
  return m ? '/demo/admin/productos/' + m[1] : 'ERROR: no existe el producto ${slug}';
})()`;

// El panel no tiene modo oscuro a propósito (registro sobrio, cero `dark:` en
// sus plantillas), así que no se audita: emular oscuro no cambiaría un píxel.
const ADMIN_PAGES = [
  { id: 'login', url: '/demo/admin/login', anon: true },
  { id: 'pedidos', url: '/demo/admin' },
  { id: 'pedido-pagado', resolve: FIRST_ORDER_OF('paid') },
  { id: 'pedido-enviado', resolve: FIRST_ORDER_OF('shipped') },
  { id: 'pedido-incidencia', resolve: FIRST_ORDER_WITH_HOLD },
  { id: 'productos', url: '/demo/admin/productos' },
  { id: 'producto-variantes', resolve: PRODUCT_VARIANTS_OF('sum-shell-07') },
  { id: 'ubicaciones', url: '/demo/admin/ubicaciones' },
  { id: 'transferencias', url: '/demo/admin/transferencias' },
  { id: 'conteos', url: '/demo/admin/conteos' },
  { id: 'asignacion', url: '/demo/admin/asignacion' },
  { id: 'devoluciones', url: '/demo/admin/devoluciones' },
  { id: 'documentos', url: '/demo/admin/documentos' },
  { id: 'envios', url: '/demo/admin/envios' },
  { id: 'emails', url: '/demo/admin/emails' },
];

/** @typedef {{name:string,url?:string,vp:object,dark?:boolean,reducedMotion?:boolean,storage?:{key:string,value:string},eval?:string,expect?:string,auth?:boolean,resolve?:string}} Surface */

/** @type {Surface[]} */
const SURFACES = [];
for (const s of STORES) {
  const cartUrl = s.legacy ? '/demo/carrito' : `${s.prefix}/carrito`;
  const checkoutUrl = s.legacy ? '/demo/checkout' : `${s.prefix}/checkout`;
  const cartSeed = { key: s.cartKey, value: s.cartValue ?? JSON.stringify([{ slug: s.slug, qty: 2 }]) };

  // Sin variantes @dark: NADA en el código responde a prefers-color-scheme
  // (el `.dark` de global.css es un juego de tokens por clase que ningún
  // script aplica — herencia del selector de temas que 9B eliminó). Verificado
  // a ojo en F12.0: la emulación de oscuro pinta píxel por píxel lo mismo que
  // el claro, así que esas 20 superficies eran cobertura fantasma. Si algún
  // día una tienda estrena modo oscuro real, devuélvele aquí su @dark.
  SURFACES.push({ name: `${s.id}:catalogo`, url: s.prefix, vp: DESKTOP });
  SURFACES.push({ name: `${s.id}:catalogo@375`, url: s.prefix, vp: MOBILE });
  SURFACES.push({ name: `${s.id}:ficha`, url: `${s.prefix}/${s.slug}`, vp: DESKTOP });
  SURFACES.push({ name: `${s.id}:ficha@375`, url: `${s.prefix}/${s.slug}`, vp: MOBILE });
  SURFACES.push({ name: `${s.id}:carrito`, url: cartUrl, vp: DESKTOP, storage: cartSeed });
  SURFACES.push({ name: `${s.id}:carrito@375`, url: cartUrl, vp: MOBILE, storage: cartSeed });
  if (s.canQuote !== false) {
    SURFACES.push({ name: `${s.id}:carrito@activo`, url: cartUrl, vp: DESKTOP, storage: cartSeed, eval: ACTIVATE_CTA, expect: 'activo' });
  }
  SURFACES.push({ name: `${s.id}:checkout`, url: checkoutUrl, vp: DESKTOP, storage: cartSeed });
  SURFACES.push({ name: `${s.id}:catalogo@motion`, url: s.prefix, vp: DESKTOP, reducedMotion: true });
}

for (const p of ADMIN_PAGES) {
  const base = { url: p.url, resolve: p.resolve, auth: !p.anon };
  SURFACES.push({ ...base, name: `admin:${p.id}`, vp: DESKTOP });
  SURFACES.push({ ...base, name: `admin:${p.id}@375`, vp: MOBILE });
}

// ── Páginas comerciales y utilitarias (F12.0) ─────────────────────────────
// Las públicas de venta y las utilitarias de la demo: hasta ahora solo las
// medía Lighthouse (100 de a11y, pero con muchas menos reglas que esta
// batería). Sin login y sin @dark (ver el bucle de tiendas). La landing añade
// variante reduced-motion: es la única con motion scroll-driven propio.
// `/demo/gracias` entra dos veces: con el pedido sembrado BM-DEMO-1001 —el
// mismo contrato con el seed que usa capture-screens.mjs— y en su estado
// vacío (sin session_id). El 404 se audita navegando a una ruta inexistente.
const SITE_PAGES = [
  { id: 'landing', url: '/' },
  { id: 'arquitectura', url: '/arquitectura' },
  { id: 'estilos', url: '/temas' },
  { id: 'precios', url: '/precios' },
  { id: 'agencias', url: '/agencias' },
  { id: 'dossier', url: '/dossier' },
  { id: 'ayuda', url: '/ayuda' },
  { id: 'gracias', url: '/demo/gracias?session_id=sim_sess_BM-DEMO-1001' },
  { id: 'gracias-vacia', url: '/demo/gracias' },
  { id: 'reset', url: '/demo/reset' },
  { id: '404', url: '/esta-ruta-no-existe' },
];
for (const p of SITE_PAGES) {
  SURFACES.push({ name: `site:${p.id}`, url: p.url, vp: DESKTOP });
  SURFACES.push({ name: `site:${p.id}@375`, url: p.url, vp: MOBILE });
}
SURFACES.push({ name: 'site:landing@motion', url: '/', vp: DESKTOP, reducedMotion: true });

// ─────────────────────────────────────────────────────────────────────────
// La batería, como fuente inyectable. Se ejecuta DENTRO de la página.
// ─────────────────────────────────────────────────────────────────────────
const AUDIT_JS = String.raw`(() => {
  const findings = [];
  const add = (rule, severity, message, el) => {
    findings.push({ rule, severity, message, where: el ? path(el) : null });
  };

  function path(el) {
    const parts = [];
    let node = el;
    while (node && node.nodeType === 1 && parts.length < 4) {
      let part = node.tagName.toLowerCase();
      if (node.id) { part += '#' + node.id; parts.unshift(part); break; }
      const cls = (node.getAttribute('class') || '').trim().split(/\s+/).filter(Boolean).slice(0, 2);
      if (cls.length) part += '.' + cls.join('.');
      parts.unshift(part);
      node = node.parentElement;
    }
    return parts.join(' > ');
  }

  const text = (el) => (el.textContent || '').replace(/\s+/g, ' ').trim();
  const snip = (s, n = 40) => (s.length > n ? s.slice(0, n) + '…' : s);

  function visible(el) {
    if (!el.isConnected) return false;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || cs.contentVisibility === 'hidden') return false;
    // La clase sr-only sigue en el árbol accesible, pero está recortada y no pinta
    // píxeles. No debe participar en las reglas visuales de contraste.
    if (cs.clipPath === 'inset(50%)' || cs.clip === 'rect(0px, 0px, 0px, 0px)') return false;
    if (el.closest('[hidden]') || el.closest('[aria-hidden="true"]') || el.closest('[inert]')) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }

  // ── Color ────────────────────────────────────────────────────────────────
  // OJO: Chrome NO normaliza a rgb() en getComputedStyle. Un color escrito en
  // oklch() —toda la paleta de Tailwind v4 y los tokens de Logic2B UI— sale de
  // getComputedStyle tal cual: 'oklch(0.216 0.006 56.043)'. Con solo la regex
  // de rgba() eso devolvía null, effectiveBg seguía subiendo por los ancestros
  // y acababa en el blanco de reserva: el panel entero medía "blanco sobre
  // blanco, 1.00:1" teniendo botones negros. Falso positivo en un sentido y,
  // peor, falso NEGATIVO en el otro (texto oscuro sobre fondo oscuro se medía
  // contra blanco y pasaba).
  //
  // La conversión la hace el propio navegador: se pinta el color en un canvas
  // de 1×1 y se lee el píxel. Vale para cualquier sintaxis que Chrome entienda
  // (oklch, lab, color(), color-mix) sin añadir dependencia y sin reimplementar
  // la matemática de OKLab.
  const canvasCtx = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  const colorCache = new Map();
  function viaCanvas(str) {
    if (colorCache.has(str)) return colorCache.get(str);
    let out = null;
    try {
      canvasCtx.clearRect(0, 0, 1, 1);
      // Sembrar un color válido conocido: si el navegador no entiende la
      // cadena, el setter la ignora en silencio y leeríamos el color anterior.
      canvasCtx.fillStyle = '#000000';
      canvasCtx.fillStyle = str;
      if (canvasCtx.fillStyle !== '#000000' || /^(#000000|black|rgb\(0,? ?0,? ?0\))$/i.test(str.trim())) {
        canvasCtx.fillRect(0, 0, 1, 1);
        const d = canvasCtx.getImageData(0, 0, 1, 1).data;
        out = { r: d[0], g: d[1], b: d[2], a: d[3] / 255 };
      }
    } catch (e) { out = null; }
    colorCache.set(str, out);
    return out;
  }
  function parseColor(str) {
    if (!str) return null;
    // Vía rápida para la sintaxis legacy: exacta y sin premultiplicar alfa.
    const m = str.match(/^rgba?\(([^)]+)\)$/);
    if (m) {
      const p = m[1].split(/[\s,\/]+/).filter(Boolean).map(Number);
      if (p.length >= 3 && p.every(Number.isFinite)) {
        return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
      }
    }
    if (str === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
    return viaCanvas(str);
  }
  const over = (fg, bg) => ({
    r: fg.r * fg.a + bg.r * (1 - fg.a),
    g: fg.g * fg.a + bg.g * (1 - fg.a),
    b: fg.b * fg.a + bg.b * (1 - fg.a),
    a: 1,
  });
  // Composición que conserva el alfa para acumular capas translúcidas hasta
  // alcanzar el primer fondo realmente opaco.
  const composite = (fg, bg) => {
    const a = fg.a + bg.a * (1 - fg.a);
    if (a <= 0) return { r: 0, g: 0, b: 0, a: 0 };
    return {
      r: (fg.r * fg.a + bg.r * bg.a * (1 - fg.a)) / a,
      g: (fg.g * fg.a + bg.g * bg.a * (1 - fg.a)) / a,
      b: (fg.b * fg.a + bg.b * bg.a * (1 - fg.a)) / a,
      a,
    };
  };
  function lum(c) {
    const f = (v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  }
  const ratio = (a, b) => {
    const l1 = lum(a), l2 = lum(b);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  };

  /** Fondo efectivo: sube por ancestros hasta encontrar opacidad total. */
  function effectiveBg(el) {
    let node = el;
    let acc = null; // capa acumulada de arriba a abajo
    while (node && node.nodeType === 1) {
      const cs = getComputedStyle(node);
      if (cs.backgroundImage && cs.backgroundImage !== 'none') return { color: null, image: true };
      const c = parseColor(cs.backgroundColor);
      if (c && c.a > 0) {
        acc = acc ? composite(acc, c) : c;
        if (acc.a >= 0.999) return { color: acc, image: false };
      }
      node = node.parentElement;
    }
    return { color: acc && acc.a >= 0.999 ? acc : { r: 255, g: 255, b: 255, a: 1 }, image: false };
  }

  /** ¿El elemento tiene texto propio (no solo de sus hijos)? */
  function ownText(el) {
    let out = '';
    for (const n of el.childNodes) if (n.nodeType === 3) out += n.nodeValue;
    return out.replace(/\s+/g, ' ').trim();
  }

  // ── 1. Contraste AA de texto ─────────────────────────────────────────────
  const seenContrast = new Set();
  for (const el of document.querySelectorAll('body *')) {
    const t = ownText(el);
    if (!t || !visible(el)) continue;
    // Un SVG con role=img es una imagen atómica: su aria-label es la
    // alternativa. Sus rect/path de fondo son hermanos del texto, no
    // ancestros, por lo que el DOM no permite calcular aquí su contraste.
    if (el instanceof SVGElement && el.closest('svg[role="img"]')) continue;
    const cs = getComputedStyle(el);
    const fgRaw = parseColor(cs.color);
    if (!fgRaw) continue;
    const bg = effectiveBg(el);
    if (bg.image) continue; // texto sobre imagen: no computable, se revisa a ojo
    const opacity = Number(cs.opacity);
    const fg = over({ ...fgRaw, a: fgRaw.a * (Number.isFinite(opacity) ? opacity : 1) }, bg.color);
    const size = parseFloat(cs.fontSize);
    const weight = Number(cs.fontWeight) || 400;
    const large = size >= 24 || (size >= 18.66 && weight >= 700);
    const need = large ? 3 : 4.5;
    const r = ratio(fg, bg.color);
    if (r < need) {
      const key = cs.color + '|' + Math.round(bg.color.r) + ',' + Math.round(bg.color.g) + ',' + Math.round(bg.color.b) + '|' + Math.round(size);
      if (seenContrast.has(key)) continue;
      seenContrast.add(key);
      add('contraste', 'error',
        'ratio ' + r.toFixed(2) + ':1 (necesita ' + need + ') — "' + snip(t) + '" ' + cs.color + ' sobre rgb(' +
        [bg.color.r, bg.color.g, bg.color.b].map(Math.round).join(',') + ') a ' + size.toFixed(0) + 'px/' + weight, el);
    }
  }

  // ── 2. Nombre accesible de controles ─────────────────────────────────────
  const nameOf = (el) => {
    const labelledby = el.getAttribute('aria-labelledby');
    if (labelledby) {
      const t = labelledby.split(/\s+/).map((id) => document.getElementById(id)).filter(Boolean).map(text).join(' ');
      if (t) return t;
    }
    const al = (el.getAttribute('aria-label') || '').trim();
    if (al) return al;
    if (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA') {
      if (el.id) {
        const lab = document.querySelector('label[for="' + CSS.escape(el.id) + '"]');
        if (lab && text(lab)) return text(lab);
      }
      const wrap = el.closest('label');
      if (wrap && text(wrap)) return text(wrap);
      const title = (el.getAttribute('title') || '').trim();
      if (title) return title;
      if (el.type === 'submit' || el.type === 'button') return (el.value || '').trim();
      return '';
    }
    const t = text(el);
    if (t) return t;
    const img = el.querySelector('img[alt]:not([alt=""])');
    if (img) return img.getAttribute('alt').trim();
    const svgTitle = el.querySelector('svg > title');
    if (svgTitle && text(svgTitle)) return text(svgTitle);
    return (el.getAttribute('title') || '').trim();
  };

  const CONTROLS = 'a[href], button, input:not([type="hidden"]), select, textarea, summary, [role="button"], [role="link"]';
  for (const el of document.querySelectorAll(CONTROLS)) {
    if (!visible(el)) continue;
    if (el.tagName === 'INPUT' && el.type === 'hidden') continue;
    if (!nameOf(el)) add('nombre-accesible', 'error', '<' + el.tagName.toLowerCase() + '> sin nombre accesible', el);
  }

  // ── 3. Imágenes sin alternativa ──────────────────────────────────────────
  for (const img of document.querySelectorAll('img')) {
    if (!img.hasAttribute('alt')) add('img-alt', 'error', 'img sin atributo alt: ' + snip(img.getAttribute('src') || '', 60), img);
  }
  for (const v of document.querySelectorAll('video')) {
    if (!v.getAttribute('aria-label') && !v.getAttribute('aria-labelledby') && v.getAttribute('aria-hidden') !== 'true') {
      add('video-nombre', 'warn', 'video sin aria-label ni aria-hidden', v);
    }
  }

  // ── 4. Jerarquía de encabezados ──────────────────────────────────────────
  const heads = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].filter(visible);
  const h1s = heads.filter((h) => h.tagName === 'H1');
  if (h1s.length === 0) add('h1', 'error', 'la página no tiene H1 visible', document.body);
  if (h1s.length > 1) add('h1', 'error', h1s.length + ' H1 en la página: ' + h1s.map((h) => '"' + snip(text(h), 24) + '"').join(', '), h1s[1]);
  let prev = 0;
  for (const h of heads) {
    const lvl = Number(h.tagName[1]);
    if (prev && lvl > prev + 1) add('jerarquia', 'warn', 'salto h' + prev + ' → h' + lvl + ' en "' + snip(text(h), 30) + '"', h);
    prev = lvl;
  }
  for (const h of heads) if (!text(h)) add('encabezado-vacio', 'error', '<' + h.tagName.toLowerCase() + '> vacío', h);

  // ── 5. Landmarks y documento ─────────────────────────────────────────────
  if (!document.documentElement.getAttribute('lang')) add('lang', 'error', '<html> sin atributo lang', document.documentElement);
  const mains = [...document.querySelectorAll('main, [role="main"]')];
  if (mains.length !== 1) add('landmark-main', 'error', mains.length + ' landmarks main (debe haber 1)', document.body);
  if (!document.title.trim()) add('title', 'error', 'documento sin <title>', document.documentElement);

  // ── 6. IDs duplicados ────────────────────────────────────────────────────
  const ids = new Map();
  for (const el of document.querySelectorAll('[id]')) {
    const id = el.id;
    ids.set(id, (ids.get(id) || 0) + 1);
  }
  for (const [id, n] of ids) if (n > 1) add('id-duplicado', 'error', 'id "' + id + '" aparece ' + n + ' veces', document.getElementById(id));

  // ── 7. Interactivos anidados ─────────────────────────────────────────────
  for (const el of document.querySelectorAll('a[href], button')) {
    const inner = el.querySelector('a[href], button, input, select, textarea');
    if (inner) add('interactivo-anidado', 'error', '<' + el.tagName.toLowerCase() + '> contiene <' + inner.tagName.toLowerCase() + '>', el);
  }

  // ── 8. Área táctil (WCAG 2.5.8 AA, mínimo 24×24 CSS px) ──────────────────
  // Con sus dos excepciones aplicadas, que es lo que separa un hallazgo real
  // de un falso positivo:
  //   · «inline»    — el destino está dentro de una frase o bloque de texto.
  //   · «spacing»   — un círculo de 24 px centrado en el destino no se solapa
  //                   con el de ningún otro destino (centros a >=24 px).
  const TARGETS = 'a[href], button, [role="button"], input[type="checkbox"], input[type="radio"], summary';
  const targets = [...document.querySelectorAll(TARGETS)].filter(visible).map((el) => {
    const r = el.getBoundingClientRect();
    return { el, r, cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
  });
  const seenTarget = new Set();
  for (const t of targets) {
    if (t.r.width >= 24 && t.r.height >= 24) continue;
    const cs = getComputedStyle(t.el);
    // Excepción «inline»: display inline dentro de contenido de texto.
    if (cs.display.startsWith('inline') && t.el.closest('p, li, span, h1, h2, h3, h4, h5, h6')) continue;
    // Excepción «spacing»: ningún otro destino a menos de 24 px de centro a centro.
    const crowded = targets.some((o) => o !== t && Math.hypot(o.cx - t.cx, o.cy - t.cy) < 24);
    if (!crowded) continue;
    const key = path(t.el) + Math.round(t.r.width) + 'x' + Math.round(t.r.height);
    if (seenTarget.has(key)) continue;
    seenTarget.add(key);
    add('area-tactil', 'warn', Math.round(t.r.width) + '×' + Math.round(t.r.height) + 'px (<24, sin holgura de 24 px) — "' + snip(nameOf(t.el), 24) + '"', t.el);
  }

  // ── 9. Etiquetas de formulario ───────────────────────────────────────────
  for (const f of document.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]), select, textarea')) {
    if (!visible(f)) continue;
    const hasVisibleLabel = f.id && document.querySelector('label[for="' + CSS.escape(f.id) + '"]');
    if (!hasVisibleLabel && !f.closest('label') && !f.getAttribute('aria-label') && !f.getAttribute('aria-labelledby')) {
      add('label', 'error', '<' + f.tagName.toLowerCase() + (f.type ? '[' + f.type + ']' : '') + '> sin label', f);
    }
    if (f.hasAttribute('required') && f.getAttribute('aria-required') === 'false') {
      add('required', 'warn', 'required con aria-required="false"', f);
    }
  }

  // ── 10. Foco visible ─────────────────────────────────────────────────────
  // Comprueba que el primer control real recibe un indicador de foco propio y
  // no un "outline: none" sin sustituto.
  const focusables = [...document.querySelectorAll(CONTROLS)]
    .filter((el) => visible(el) && !(el instanceof HTMLButtonElement && el.disabled) &&
      !(el instanceof HTMLInputElement && el.disabled) &&
      !(el instanceof HTMLSelectElement && el.disabled) &&
      !(el instanceof HTMLTextAreaElement && el.disabled))
    .slice(0, 12);
  for (const el of focusables) {
    el.focus({ preventScroll: true });
    const cs = getComputedStyle(el);
    const outlineOff = cs.outlineStyle === 'none' || parseFloat(cs.outlineWidth) === 0;
    const hasShadow = cs.boxShadow && cs.boxShadow !== 'none';
    const hasRing = cs.borderColor !== '' && cs.borderWidth !== '0px';
    if (outlineOff && !hasShadow && !hasRing) {
      add('foco-visible', 'error', 'sin indicador de foco: "' + snip(nameOf(el), 30) + '"', el);
      break; // un caso basta: el fallo será sistémico
    }
  }
  if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();

  // ── 11. Overflow horizontal ──────────────────────────────────────────────
  const docW = document.documentElement.clientWidth;
  if (document.documentElement.scrollWidth > docW + 1) {
    const offenders = [...document.querySelectorAll('body *')].filter((el) => {
      if (!visible(el)) return false;
      const r = el.getBoundingClientRect();
      return r.right > docW + 1 && r.width <= docW * 1.5 && getComputedStyle(el).overflowX !== 'auto' && getComputedStyle(el).overflowX !== 'scroll';
    });
    const worst = offenders[offenders.length - 1];
    add('overflow-x', 'error',
      'scrollWidth ' + document.documentElement.scrollWidth + ' > ancho ' + docW +
      (worst ? ' — sobresale ' + path(worst) : ''), worst || document.body);
  }

  // ── 12. Reduced motion: nada infinito en marcha ──────────────────────────
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
    for (const el of document.querySelectorAll('body *')) {
      if (!visible(el)) continue;
      const cs = getComputedStyle(el);
      if (cs.animationName !== 'none' && cs.animationIterationCount === 'infinite' && cs.animationPlayState === 'running') {
        add('reduced-motion', 'error', 'animación infinita "' + cs.animationName + '" con reduced-motion', el);
        break;
      }
    }
    for (const v of document.querySelectorAll('video[autoplay]')) {
      add('reduced-motion', 'error', 'video autoplay con reduced-motion', v);
    }
  }

  // ── 13. aria-current en la navegación ────────────────────────────────────
  // Se compara ruta + query: en este repo la categoría activa viaja en la query
  // ("?categoria=…"), así que mirar solo el pathname marcaría como «actual»
  // cualquier enlace de categoría del pie. Los enlaces con hash quedan fuera
  // (F12.0): un ancla a una sección ("#precios" en la landing, el TOC de
  // /ayuda) no es un autoenlace de página — ponerle aria-current="page" sería
  // mentir, y el aria-current="location" de un scrollspy exigiría un JS que
  // estas páginas no tienen.
  const navs = [...document.querySelectorAll('nav')].filter(visible);
  const hereUrl = location.pathname + location.search;
  for (const nav of navs) {
    const links = [...nav.querySelectorAll('a[href]')].filter(visible);
    const here = links.filter((a) => {
      const u = new URL(a.href, location.href);
      if (u.hash) return false;
      return u.pathname + u.search === hereUrl;
    });
    if (here.length && !here.some((a) => a.hasAttribute('aria-current'))) {
      add('aria-current', 'warn', 'nav con enlace a la página actual sin aria-current: "' + snip(text(here[0]), 24) + '"', here[0]);
    }
  }

  // ── 14. Idioma del contenido vs marcado ──────────────────────────────────
  for (const el of document.querySelectorAll('[aria-hidden="true"]')) {
    const controls = [
      ...(el.matches(CONTROLS) ? [el] : []),
      ...el.querySelectorAll(CONTROLS),
    ];
    const hasFocusable = controls.some((control) => {
      const disabled = 'disabled' in control && control.disabled;
      return !disabled && control.tabIndex >= 0;
    });
    if (hasFocusable) {
      add('aria-hidden-focusable', 'error', 'aria-hidden con contenido enfocable dentro', el);
    }
  }

  return findings;
})()`;

// ─────────────────────────────────────────────────────────────────────────
// CDP mínimo (mismo patrón que capture-screens.mjs)
// ─────────────────────────────────────────────────────────────────────────
class CDP {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message));
        else resolve(msg.result);
      }
    });
  }
  send(method, params = {}, sessionId) {
    const id = ++this.id;
    const payload = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify(payload));
    });
  }
}

function connect(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    ws.addEventListener('open', () => resolve(ws));
    ws.addEventListener('error', (e) => reject(new Error('WebSocket error: ' + (e.message || 'unknown'))));
  });
}

async function launchChrome(bin) {
  const userDataDir = join(ROOT, '.wrangler', 'chrome-a11y');
  await rm(userDataDir, { recursive: true, force: true });
  const child = spawn(
    bin,
    [
      '--headless=new',
      '--disable-gpu',
      '--no-sandbox',
      '--hide-scrollbars',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-extensions',
      '--force-color-profile=srgb',
      // Chrome puede heredar un proxy del sistema con credenciales caducadas:
      // Node/curl responden, pero la pestaña queda en un documento vacío.
      '--no-proxy-server',
      '--remote-allow-origins=*',
      `--user-data-dir=${userDataDir}`,
      '--remote-debugging-port=0',
      'about:blank',
    ],
    { stdio: ['ignore', 'ignore', 'pipe'] },
  );
  const wsUrl = await new Promise((resolve, reject) => {
    let buf = '';
    const to = globalThis.setTimeout(() => reject(new Error('Chrome no expuso DevTools en 20 s')), 20000);
    child.stderr.on('data', (d) => {
      buf += d.toString();
      const m = buf.match(/DevTools listening on (ws:\/\/\S+)/);
      if (m) {
        globalThis.clearTimeout(to);
        resolve(m[1]);
      }
    });
    child.on('exit', (code) => reject(new Error('Chrome salió con código ' + code)));
  });
  return { child, wsUrl };
}

const SETTLE_JS = `(async () => {
  const h = document.body.scrollHeight;
  for (let y = 0; y <= h; y += 600) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 30)); }
  window.scrollTo(0, 0);
  try { await document.fonts.ready; } catch {}
  await Promise.all(Array.from(document.images).map((img) => img.complete ? 1 : new Promise((r) => { img.onload = img.onerror = r; setTimeout(r, 2000); })));
  await new Promise((r) => setTimeout(r, 350));
})()`;

async function main() {
  const CHROME = CHROME_CANDIDATES.find((p) => existsSync(p));
  if (!CHROME) {
    console.error('No encuentro Chrome. Define CHROME_BIN.');
    process.exit(1);
  }
  try {
    const ping = await fetch(`${BASE}/demo/tienda`, { redirect: 'manual' });
    if (!ping.ok && ping.status !== 302) throw new Error('status ' + ping.status);
  } catch {
    console.error(`El servidor no responde en ${BASE}. Arranca: npx wrangler dev --port 8787`);
    process.exit(1);
  }

  const { child, wsUrl } = await launchChrome(CHROME);
  const browserWs = await connect(wsUrl);
  const cdp = new CDP(browserWs);
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
  const S = (m, p) => cdp.send(m, p, sessionId);

  await S('Page.enable');
  await S('Runtime.enable');
  await S('Emulation.setScriptExecutionDisabled', { value: false });

  const surfaces = SURFACES.filter((s) => !ONLY || s.name.includes(ONLY));
  const report = [];
  let errors = 0;
  let warns = 0;
  let loggedIn = false;

  /** Entra al panel una sola vez por tanda; devuelve el motivo si no lo logra. */
  const ensureLogin = async () => {
    if (loggedIn) return null;
    const attempt = async () => {
      await S('Page.navigate', { url: `${BASE}/demo/admin/login` });
      await new Promise((r) => globalThis.setTimeout(r, 900));
      const res = await S('Runtime.evaluate', { expression: ADMIN_LOGIN, awaitPromise: true, returnByValue: true });
      return String(res.result.value ?? res.exceptionDetails?.text);
    };
    let value = await attempt();
    if (value === 'limitado') {
      // Un solo reintento tras la ventana de 60 s: suficiente para encadenar
      // `pnpm test:e2e` y esta tanda sin repetirla a mano.
      console.log('· login limitado por el rate limit (cola del E2E): esperando 65 s y reintentando…');
      await new Promise((r) => globalThis.setTimeout(r, 65_000));
      value = await attempt();
    }
    if (value !== 'ok') return value;
    loggedIn = true;
    return null;
  };

  for (const surface of surfaces) {
    await S('Emulation.setDeviceMetricsOverride', {
      width: surface.vp.w,
      height: surface.vp.h,
      deviceScaleFactor: surface.vp.dsf,
      mobile: surface.vp.mobile,
    });
    const features = [];
    if (surface.dark) features.push({ name: 'prefers-color-scheme', value: 'dark' });
    if (surface.reducedMotion) features.push({ name: 'prefers-reduced-motion', value: 'reduce' });
    await S('Emulation.setEmulatedMedia', { features });

    if (surface.storage) {
      // Hay que estar YA en el origen antes de escribir: sobre about:blank el
      // origen es opaco y el setItem se pierde en silencio, que es como la
      // batería acababa auditando siempre el carrito vacío. Se espera al load
      // y se relee para confirmar que la escritura ha cuajado.
      await Promise.all([
        S('Page.navigate', { url: `${BASE}/404` }),
        new Promise((r) => globalThis.setTimeout(r, 1200)),
      ]);
      const wrote = await S('Runtime.evaluate', {
        returnByValue: true,
        expression: `(() => {
          try {
            localStorage.setItem(${JSON.stringify(surface.storage.key)}, ${JSON.stringify(surface.storage.value)});
            return localStorage.getItem(${JSON.stringify(surface.storage.key)});
          } catch (e) { return 'ERROR: ' + e.message; }
        })()`,
      });
      if (wrote.result.value !== surface.storage.value) {
        console.error(`✗ ${surface.name} — no se pudo sembrar el carrito (${wrote.result.value})`);
        errors++;
        continue;
      }
    }

    if (surface.auth) {
      const fail = await ensureLogin();
      if (fail) {
        console.error(`✗ ${surface.name} — no se pudo entrar al panel (${fail})`);
        errors++;
        continue;
      }
    }

    let url = surface.url;
    if (surface.resolve) {
      // La resolución va DESPUÉS del login: el listado del que sale el id
      // también está protegido.
      const res = await S('Runtime.evaluate', { expression: surface.resolve, awaitPromise: true, returnByValue: true });
      url = res.result.value ?? res.exceptionDetails?.text;
      if (typeof url !== 'string' || !url.startsWith('/')) {
        console.error(`✗ ${surface.name} — no se pudo resolver la URL (${url})`);
        errors++;
        continue;
      }
    }

    await S('Page.navigate', { url: BASE + url });
    await new Promise((r) => globalThis.setTimeout(r, 900));
    await S('Runtime.evaluate', { expression: SETTLE_JS, awaitPromise: true });

    if (surface.eval) {
      const step = await S('Runtime.evaluate', { expression: surface.eval, awaitPromise: true, returnByValue: true });
      // Si el paso previo no deja la pantalla en el estado que se quería
      // auditar, el ✓ sería mentira: se falla en vez de auditar otra cosa.
      if (surface.expect && step.result.value !== surface.expect) {
        console.error(`✗ ${surface.name} — no se alcanzó el estado "${surface.expect}" (${step.result.value ?? step.exceptionDetails?.text})`);
        errors++;
        continue;
      }
    }

    const res = await S('Runtime.evaluate', { expression: AUDIT_JS, returnByValue: true });
    if (res.exceptionDetails) {
      console.error(`✗ ${surface.name} — la batería falló: ${res.exceptionDetails.text} ${res.exceptionDetails.exception?.description ?? ''}`);
      errors++;
      continue;
    }
    const findings = res.result.value ?? [];
    const e = findings.filter((f) => f.severity === 'error').length;
    const w = findings.length - e;
    errors += e;
    warns += w;
    report.push({ surface: surface.name, url, findings });

    if (!AS_JSON) {
      const mark = e ? '✗' : w ? '·' : '✓';
      console.log(`${mark} ${surface.name}${findings.length ? ` — ${e} error${e === 1 ? '' : 'es'}, ${w} aviso${w === 1 ? '' : 's'}` : ''}`);
      for (const f of findings) {
        console.log(`    ${f.severity === 'error' ? '✗' : '·'} [${f.rule}] ${f.message}${f.where ? `  @ ${f.where}` : ''}`);
      }
    }
  }

  if (AS_JSON) console.log(JSON.stringify(report, null, 2));
  else {
    console.log(`\n${errors} errores · ${warns} avisos · ${surfaces.length} superficies`);
    const byRule = new Map();
    for (const r of report) for (const f of r.findings) byRule.set(f.rule, (byRule.get(f.rule) || 0) + 1);
    if (byRule.size) {
      console.log('Por regla: ' + [...byRule.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(' · '));
    }
  }

  // Esperar al cierre evita que la siguiente tanda intente borrar un perfil
  // de Chrome que el proceso anterior todavía está terminando de escribir.
  await new Promise((resolve) => {
    if (child.exitCode !== null || child.signalCode !== null) {
      resolve();
      return;
    }
    child.once('exit', resolve);
    child.kill();
  });
  process.exit(errors ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
