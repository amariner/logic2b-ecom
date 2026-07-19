/**
 * E2E del flujo de compra simulado contra un `wrangler dev` en marcha.
 *
 *   pnpm preview            # terminal 1 (o cualquier deploy con DEMO_MODE)
 *   pnpm test:e2e           # terminal 2  (BASE_URL para apuntar a otro sitio)
 *
 * Cubre: reset → quote → checkout simulado (con NIF opcional) → pedido pagado
 * → stock decrementado → login admin → CSV → marcar enviado → email de aviso
 * en la bandeja → APIs admin cerradas sin sesión. Sin dependencias.
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

// ── 0. Estado limpio ─────────────────────────────────────────────────
const reset = await fetch(`${BASE}/api/demo/reset`, { method: 'POST', headers: { origin: ORIGIN.origin } });
check('reset de la demo', reset.ok, `HTTP ${reset.status}`);

// ── 1. Quote con CP peninsular ───────────────────────────────────────
const LINES = [
  { slug: 'aove-picual-500', qty: 2 },
  { slug: 'miel-romero-500', qty: 1 },
];
const quoteRes = await fetch(`${BASE}/api/cart/quote`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ lines: LINES, postal_code: '12001' }),
});
const quote = await json(quoteRes);
check('quote responde', quoteRes.ok && quote?.purchasable === true, `HTTP ${quoteRes.status}`);
check('quote recalcula en servidor', quote?.subtotal_cents === 890 * 2 + 750, `subtotal ${quote?.subtotal_cents}`);
const stockBefore = quote?.lines?.find((l) => l.slug === 'aove-picual-500')?.available_stock;
check('quote expone stock', typeof stockBefore === 'number', String(stockBefore));

// ── 2. Checkout simulado con datos de factura ────────────────────────
const checkoutRes = await fetch(`${BASE}/api/checkout/session`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    lines: LINES,
    customer: {
      name: 'Prova E2E',
      email: 'e2e@example.com',
      street: 'C/ Mayor 1',
      city: 'Castelló',
      postal_code: '12001',
      nif: 'B12345678',
      company: 'Prova SL',
    },
  }),
});
const checkout = await json(checkoutRes);
check('checkout crea el pedido', checkoutRes.ok && typeof checkout?.order_number === 'string', `HTTP ${checkoutRes.status}`);
check('checkout simulado redirige a gracias', String(checkout?.url ?? '').includes('/demo/gracias?session_id=sim_'), checkout?.url);

const sessionId = new URL(checkout.url).searchParams.get('session_id');
const gracias = await fetch(`${BASE}/demo/gracias?session_id=${sessionId}`);
const graciasHtml = await gracias.text();
check('gracias muestra el pedido', gracias.ok && graciasHtml.includes(checkout.order_number));
check('gracias guía el recorrido de la demo', graciasHtml.includes('Sigue el recorrido de la demo'));

// ── 3. El pago simulado decrementa stock ─────────────────────────────
const quote2 = await json(
  await fetch(`${BASE}/api/cart/quote`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ lines: [{ slug: 'aove-picual-500', qty: 1 }] }),
  }),
);
const stockAfter = quote2?.lines?.find((l) => l.slug === 'aove-picual-500')?.available_stock;
check('stock decrementado tras el pago', stockAfter === stockBefore - 2, `${stockBefore} → ${stockAfter}`);

// ── 4. Admin cerrado sin sesión ──────────────────────────────────────
const noAuth = await fetch(`${BASE}/api/admin/orders/export.csv`);
check('API admin sin sesión → 401', noAuth.status === 401, `HTTP ${noAuth.status}`);
const adminRedirect = await fetch(`${BASE}/demo/admin`, { redirect: 'manual' });
check('panel sin sesión redirige al login', adminRedirect.status === 302 && String(adminRedirect.headers.get('location')).includes('/demo/admin/login'));

// ── 5. Login y CSV ───────────────────────────────────────────────────
const login = await fetch(`${BASE}/demo/admin/login`, {
  method: 'POST',
  redirect: 'manual',
  headers: { 'content-type': 'application/x-www-form-urlencoded', ...{ origin: ORIGIN.origin } },
  body: 'password=demo',
});
const cookie = String(login.headers.get('set-cookie') ?? '').split(';')[0];
check('login demo devuelve cookie de sesión', login.status === 303 && cookie.startsWith('admin_session='));

const csv = await fetch(`${BASE}/api/admin/orders/export.csv`, { headers: { cookie } });
const csvText = await csv.text();
check('CSV incluye el pedido pagado', csv.ok && csvText.includes(checkout.order_number));

const backup = await fetch(`${BASE}/api/admin/backup.sql`, { headers: { cookie } });
const backupText = await backup.text();
check(
  'copia de seguridad SQL con catálogo y pedido',
  backup.ok && backupText.includes('INSERT INTO products') && backupText.includes(checkout.order_number),
);

// ── 6. Marcar enviado → email de aviso en la bandeja ─────────────────
const orderIdMatch = (await (await fetch(`${BASE}/demo/admin`, { headers: { cookie } })).text()).match(
  new RegExp(`/demo/admin/pedidos/(\\d+)"[^>]*>${checkout.order_number}`),
);
check('el panel lista el pedido', orderIdMatch !== null);
const orderId = orderIdMatch?.[1];

const ship = await fetch(`${BASE}/api/admin/orders/${orderId}`, {
  method: 'PATCH',
  headers: { 'content-type': 'application/json', cookie },
  body: JSON.stringify({ status: 'shipped', tracking_carrier: 'SEUR', tracking_number: 'E2E123' }),
});
check('transición a enviado', ship.ok, `HTTP ${ship.status}`);

const detailHtml = await (await fetch(`${BASE}/demo/admin/pedidos/${orderId}`, { headers: { cookie } })).text();
check('detalle muestra los datos de factura', detailHtml.includes('B12345678') && detailHtml.includes('Prova SL'));

const emailsHtml = await (await fetch(`${BASE}/demo/admin/emails`, { headers: { cookie } })).text();
check('bandeja con confirmación de pedido', emailsHtml.includes(checkout.order_number));
check('bandeja con aviso de envío (tracking)', emailsHtml.includes('E2E123') || emailsHtml.includes('camino'));

// ── 7. Validación de la API de productos del admin ───────────────────
const productosHtml = await (await fetch(`${BASE}/demo/admin/productos`, { headers: { cookie } })).text();
const productIdMatch = productosHtml.match(/data-field="name" data-id="(\d+)"/);
const productId = productIdMatch?.[1];
check('el panel de productos expone al menos un id', productId !== undefined);

const emptyPatch = await fetch(`${BASE}/api/admin/products/${productId}`, {
  method: 'PATCH',
  headers: { 'content-type': 'application/json', cookie },
  body: '{}',
});
check('PATCH producto vacío → 400 (nada que actualizar)', emptyPatch.status === 400, `HTTP ${emptyPatch.status}`);

const negativePricePatch = await fetch(`${BASE}/api/admin/products/${productId}`, {
  method: 'PATCH',
  headers: { 'content-type': 'application/json', cookie },
  body: JSON.stringify({ price_cents: -1 }),
});
check('PATCH producto con precio negativo → 400', negativePricePatch.status === 400, `HTTP ${negativePricePatch.status}`);

const unknownIdPatch = await fetch(`${BASE}/api/admin/products/999999`, {
  method: 'PATCH',
  headers: { 'content-type': 'application/json', cookie },
  body: JSON.stringify({ stock: 5 }),
});
check('PATCH producto inexistente → 404', unknownIdPatch.status === 404, `HTTP ${unknownIdPatch.status}`);

const stockPatch = await fetch(`${BASE}/api/admin/products/${productId}`, {
  method: 'PATCH',
  headers: { 'content-type': 'application/json', cookie },
  body: JSON.stringify({ stock: 0 }),
});
check('PATCH producto con stock 0 → 200', stockPatch.ok, `HTTP ${stockPatch.status}`);
const productSlugMatch = productosHtml.match(/Nombre de ([a-z0-9-]+)"/);
const productSlug = productSlugMatch?.[1];
const quoteAfterStockPatch = await json(
  await fetch(`${BASE}/api/cart/quote`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ lines: [{ slug: productSlug, qty: 1 }] }),
  }),
);
check(
  'el stock a 0 se refleja en la siguiente quote',
  quoteAfterStockPatch?.lines?.[0]?.status === 'out-of-stock',
  JSON.stringify(quoteAfterStockPatch?.lines?.[0]),
);

// ── 8. Rate limit del login (10/min por IP; ya gastamos 1 en el paso 5) ──
let lastLoginRes;
for (let i = 0; i < 9; i++) {
  lastLoginRes = await fetch(`${BASE}/demo/admin/login`, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded', ...{ origin: ORIGIN.origin } },
    body: 'password=incorrecta',
  });
}
// Contraseña incorrecta: la página se re-renderiza con el error (200), no redirige.
check('9 intentos fallidos más (10 en total) todavía no bloquean', lastLoginRes.status === 200, `HTTP ${lastLoginRes.status}`);
const lockedOutRes = await fetch(`${BASE}/demo/admin/login`, {
  method: 'POST',
  redirect: 'manual',
  headers: { 'content-type': 'application/x-www-form-urlencoded', ...{ origin: ORIGIN.origin } },
  body: 'password=demo',
});
check(
  'el 11º intento en la ventana → redirige con ?limited=1',
  lockedOutRes.status === 303 && String(lockedOutRes.headers.get('location')).includes('limited=1'),
  `HTTP ${lockedOutRes.status} location=${lockedOutRes.headers.get('location')}`,
);

// ── Resultado ────────────────────────────────────────────────────────
if (failures > 0) {
  console.error(`\nE2E: ${failures} comprobaciones fallidas`);
  process.exit(1);
}
console.log('\nE2E: flujo completo de compra verificado ✔');
