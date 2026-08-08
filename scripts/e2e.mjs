/**
 * E2E de aislamiento de la demo pública contra un `wrangler dev` en marcha.
 *
 * Verifica que los escaparates cargan, que quote/checkout/reset no aceptan
 * peticiones en DEMO_MODE y que el panel enseña fixtures sin permitir writes.
 */
const BASE = process.env.BASE_URL ?? 'http://localhost:8787';
const ORIGIN = { origin: new URL(BASE).origin };

let failures = 0;
function check(name, condition, detail = '') {
  const ok = Boolean(condition);
  console.log(`${ok ? '✓' : '✗'} ${name}${!ok && detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

async function json(res) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

// ── 1. Escaparate principal: HTML y simulación local ─────────────────
const catalog = await fetch(`${BASE}/demo/tiendas/arce`);
const catalogHtml = await catalog.text();
check('ARCE es la demo principal disponible', catalog.ok && catalogHtml.includes('Butaca Alba'));
check('ARCE enlaza su ficha local', catalogHtml.includes('/demo/tiendas/arce/arc-silla-alba'));

const product = await fetch(`${BASE}/demo/tiendas/arce/arc-silla-alba`);
const productHtml = await product.text();
check('ficha ARCE disponible', product.ok && productHtml.includes('680,00'));
check('ficha conserva acción local de carrito', productHtml.includes('data-commerce-action="add-to-cart"'));

for (const [surface, path] of [
  ['cart', '/demo/tiendas/arce/carrito'],
  ['checkout', '/demo/tiendas/arce/checkout'],
  ['thanks', '/demo/tiendas/arce/gracias'],
]) {
  const response = await fetch(`${BASE}${path}`);
  const html = await response.text();
  check(`${surface} ARCE disponible`, response.ok && html.includes(`data-commerce-surface="${surface}"`));
}

// ── 2. Ningún endpoint público escribe o consulta comercio en la demo ──
const quote = await fetch(`${BASE}/api/cart/quote`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ lines: [{ slug: 'arc-silla-alba', qty: 1 }], postal_code: '12001' }),
});
check('quote remota cerrada en DEMO_MODE', quote.status === 410, `HTTP ${quote.status}`);

const checkout = await fetch(`${BASE}/api/checkout/session`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: '{}',
});
check('checkout remoto cerrado en DEMO_MODE', checkout.status === 410, `HTTP ${checkout.status}`);

const reset = await fetch(`${BASE}/api/demo/reset`, {
  method: 'POST',
  headers: ORIGIN,
});
check('reset público retirado', reset.status === 410, `HTTP ${reset.status}`);

// ── 3. Panel protegido y con identidad/fixtures independientes ───────
const noAuth = await fetch(`${BASE}/api/admin/orders/export.csv`);
check('API admin sin sesión → 401', noAuth.status === 401, `HTTP ${noAuth.status}`);
const adminRedirect = await fetch(`${BASE}/demo/admin`, { redirect: 'manual' });
check(
  'panel sin sesión redirige al login',
  adminRedirect.status === 302 && String(adminRedirect.headers.get('location')).includes('/demo/admin/login'),
);

const login = await fetch(`${BASE}/demo/admin/login`, {
  method: 'POST',
  redirect: 'manual',
  headers: { 'content-type': 'application/x-www-form-urlencoded', ...ORIGIN },
  body: 'password=demo',
});
const cookie = String(login.headers.get('set-cookie') ?? '').split(';')[0];
check('login demo devuelve cookie de sesión', login.status === 303 && cookie.startsWith('admin_session='));

const adminHtml = await (await fetch(`${BASE}/demo/admin`, { headers: { cookie } })).text();
check('panel usa la identidad Logic2B Getion', adminHtml.includes('Logic2B Getion'));
check('panel declara fixtures independientes', adminHtml.includes('independientes de los escaparates'));
check('panel vuelve a ARCE', adminHtml.includes('href="/demo/tiendas/arce"'));

const productsHtml = await (await fetch(`${BASE}/demo/admin/productos`, { headers: { cookie } })).text();
const productId = productsHtml.match(/data-field="name" data-id="(\d+)"/)?.[1];
const variantProductId = productsHtml.match(/data-field="name" data-id="(\d+)" value="Shell 07"/)?.[1];
check('productos son visibles como fixtures', productId !== undefined && productsHtml.includes('solo lectura'));
check('controles de producto están deshabilitados', productsHtml.includes('disabled'));
check('producto con variantes enlaza su editor', variantProductId !== undefined);
let variantId;
if (variantProductId) {
  const variantsHtml = await (await fetch(
    `${BASE}/demo/admin/productos/${variantProductId}`,
    { headers: { cookie } },
  )).text();
  variantId = variantsHtml.match(/data-variant-id="(\d+)"/)?.[1];
  check(
    'editor enseña opciones y combinaciones sembradas',
    variantsHtml.includes('Opciones y valores') && variantsHtml.includes('SUM-SHELL-07-M'),
  );
  check(
    'editor de variantes también es de solo lectura',
    variantId !== undefined && variantsHtml.includes('disabled') && !variantsHtml.includes('>Añadir variante</summary>'),
  );
}

const shippingHtml = await (await fetch(`${BASE}/demo/admin/envios`, { headers: { cookie } })).text();
const rateId = shippingHtml.match(/data-field="price" data-id="(\d+)"/)?.[1];
check('tarifas son fixtures de solo lectura', rateId !== undefined && shippingHtml.includes('solo lectura'));

const orderId = adminHtml.match(/\/demo\/admin\/pedidos\/(\d+)"/)?.[1];
check('panel contiene pedidos ficticios sembrados', orderId !== undefined);
if (orderId) {
  const detailHtml = await (await fetch(`${BASE}/demo/admin/pedidos/${orderId}`, { headers: { cookie } })).text();
  check('detalle identifica el pedido como ficticio', detailHtml.includes('Pedido ficticio de ejemplo'));
  check('detalle no ofrece acciones mutables', !detailHtml.includes('<form data-ship-form'));
}

// ── 4. El backoffice público rechaza mutaciones aunque haya sesión ───
for (const [label, path, body] of [
  ['producto', `/api/admin/products/${productId ?? 1}`, { stock: 0 }],
  ['tarifa', `/api/admin/shipping-rates/${rateId ?? 1}`, { price_cents: 0 }],
  ['pedido', `/api/admin/orders/${orderId ?? 1}`, { status: 'shipped' }],
]) {
  const response = await fetch(`${BASE}${path}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify(body),
  });
  const responseBody = await json(response);
  check(`mutación de ${label} rechazada`, response.status === 403 && responseBody?.error?.includes('solo lectura'));
}

for (const [label, method, path] of [
  ['opciones', 'POST', `/api/admin/catalog-options/product/${variantProductId ?? 1}`],
  ['variantes', 'PATCH', `/api/admin/catalog-variants/${variantId ?? 1}`],
]) {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'content-type': 'application/json', cookie },
    body: '{}',
  });
  const responseBody = await json(response);
  check(`mutación de ${label} rechazada`, response.status === 403 && responseBody?.error?.includes('solo lectura'));
}

const csv = await fetch(`${BASE}/api/admin/orders/export.csv`, { headers: { cookie } });
check('CSV de fixtures sigue disponible', csv.ok && (await csv.text()).includes('BM-'));
const backup = await fetch(`${BASE}/api/admin/backup.sql`, { headers: { cookie } });
check('backup de fixtures sigue disponible', backup.ok && (await backup.text()).includes('INSERT INTO products'));

if (failures > 0) {
  console.error(`\nE2E: ${failures} comprobaciones fallidas`);
  process.exit(1);
}
console.log('\nE2E: aislamiento de demos y panel verificado ✔');
