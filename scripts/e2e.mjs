/**
 * E2E de aislamiento de la demo pública contra un `wrangler dev` en marcha.
 *
 * Verifica que los escaparates cargan, que quote/checkout/reset no aceptan
 * peticiones en DEMO_MODE y que el panel enseña fixtures sin permitir writes.
 */
const BASE = process.env.BASE_URL ?? 'http://localhost:8787';
const ORIGIN = { origin: new URL(BASE).origin };
const CACHE_BUST = `e2e-${Date.now()}`;
const adminUrl = (path) => `${BASE}${path}${path.includes('?') ? '&' : '?'}e2e=${CACHE_BUST}`;

let failures = 0;
function check(name, condition, detail = '') {
  const ok = Boolean(condition);
  console.log(`${ok ? '✓' : '✗'} ${name}${!ok && detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

function checkWhatsappContact(name, html, pathname) {
  check(
    `${name} incluye contacto WhatsApp con origen`,
    html.includes('data-whatsapp-contact')
      && html.includes('Contacta')
      && html.includes(encodeURIComponent(pathname)),
  );
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
checkWhatsappContact('catálogo ARCE', catalogHtml, '/demo/tiendas/arce');

const product = await fetch(`${BASE}/demo/tiendas/arce/arc-silla-alba`);
const productHtml = await product.text();
check('ficha ARCE disponible', product.ok && productHtml.includes('680,00'));
check('ficha conserva acción local de carrito', productHtml.includes('data-commerce-action="add-to-cart"'));
checkWhatsappContact('ficha ARCE', productHtml, '/demo/tiendas/arce/arc-silla-alba');

for (const [surface, path] of [
  ['cart', '/demo/tiendas/arce/carrito'],
  ['checkout', '/demo/tiendas/arce/checkout'],
  ['thanks', '/demo/tiendas/arce/gracias'],
]) {
  const response = await fetch(`${BASE}${path}`);
  const html = await response.text();
  check(`${surface} ARCE disponible`, response.ok && html.includes(`data-commerce-surface="${surface}"`));
  checkWhatsappContact(`${surface} ARCE`, html, path);
}

for (const [surface, path] of [
  ['landing', '/'],
  ['arquitectura', '/arquitectura'],
  ['catálogo de temas', '/temas'],
  ['ayuda', '/ayuda'],
  ['reset', '/demo/reset'],
  ['404', '/404'],
]) {
  const requestPath = surface === '404' ? '/esta-ruta-no-existe' : path;
  const response = await fetch(`${BASE}${requestPath}`);
  const html = await response.text();
  checkWhatsappContact(surface, html, requestPath);
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

const adminResponse = await fetch(adminUrl('/demo/admin'), { headers: { cookie } });
const adminHtml = await adminResponse.text();
checkWhatsappContact('panel', adminHtml, '/demo/admin');
check('panel privado no permite caché compartida', adminResponse.headers.get('cache-control')?.includes('no-store'));
check('panel usa la identidad Logic2B Gestión', adminHtml.includes('Logic2B Gestión'));
check('panel declara fixtures independientes', adminHtml.includes('independientes de los escaparates'));
check('panel vuelve a ARCE', adminHtml.includes('href="/demo/tiendas/arce"'));
check(
  'índice de pedidos expone filtros URL y orden estable R3.1',
  adminHtml.includes('name="orden"')
    && adminHtml.includes('name="etiqueta"')
    && adminHtml.includes('name="incidencia"')
    && adminHtml.includes('name="desde"')
    && adminHtml.includes('name="min"')
    && !adminHtml.includes('name="pagina"'),
);
check(
  'panel expone selección y dry-run R3.5 sin habilitar efectos en demo',
  adminHtml.includes('id="bulk-action-form"')
    && adminHtml.includes('data-bulk-order')
    && adminHtml.includes('data-can-execute="false"')
    && adminHtml.includes('nunca crea lotes ni modifica pedidos'),
);
const heldOrdersHtml = await (await fetch(adminUrl('/demo/admin?incidencia=active'), { headers: { cookie } })).text();
const heldOrderId = heldOrdersHtml.match(/\/demo\/admin\/pedidos\/(\d+)"/)?.[1];
check(
  'filtro de incidencias localiza el fixture activo y muestra su SLA R3.4',
  heldOrderId !== undefined && heldOrdersHtml.includes('value="active" selected')
    && heldOrdersHtml.includes('1 incidencia'),
);
if (heldOrderId) {
  const holdDetailHtml = await (await fetch(adminUrl(`/demo/admin/pedidos/${heldOrderId}`), { headers: { cookie } })).text();
  check(
    'detalle muestra responsable, SLA y pausa de preparación sin controles demo',
    holdDetailHtml.includes('Incidencias y bloqueos')
      && holdDetailHtml.includes('Responsable: Operaciones')
      && holdDetailHtml.includes('La preparación queda pausada')
      && !holdDetailHtml.includes('data-hold-create')
      && !holdDetailHtml.includes('data-ship-form'),
  );
}
const taggedOrdersHtml = await (await fetch(adminUrl('/demo/admin?etiqueta=prioritario'), { headers: { cookie } })).text();
const taggedOrderId = taggedOrdersHtml.match(/\/demo\/admin\/pedidos\/(\d+)"/)?.[1];
check(
  'filtro por etiqueta conserva la URL y localiza el fixture R3.2',
  taggedOrdersHtml.includes('value="prioritario" selected') && taggedOrderId !== undefined,
);
if (taggedOrderId) {
  const collaborationHtml = await (await fetch(adminUrl(`/demo/admin/pedidos/${taggedOrderId}`), { headers: { cookie } })).text();
  check(
    'detalle unifica notas, etiquetas, actor y visibilidad sin acciones demo',
    collaborationHtml.includes('Confirmar el portal')
      && collaborationHtml.includes('Prioritario')
      && collaborationHtml.includes('Equipo demo')
      && collaborationHtml.includes('Interno')
      && !collaborationHtml.includes('data-note-create'),
  );
  check(
    'detalle demuestra ORD-005 sin controles mutables en la demo',
    collaborationHtml.includes('Editar pedido')
      && collaborationHtml.includes('Ejemplo inerte')
      && !collaborationHtml.includes('data-amendment-form'),
  );
}
const filteredOrdersHtml = await (await fetch(
  `${BASE}/demo/admin?estado=paid&q=BM-DEMO&orden=total-desc`,
  { headers: { cookie } },
)).text();
check(
  'búsqueda FTS combina estado y orden sin perder pedidos',
  filteredOrdersHtml.includes('name="estado" value="paid"')
    && filteredOrdersHtml.includes('value="BM-DEMO"')
    && filteredOrdersHtml.includes('BM-DEMO-'),
);

const productsHtml = await (await fetch(`${BASE}/demo/admin/productos`, { headers: { cookie } })).text();
const productId = productsHtml.match(/data-field="name" data-id="(\d+)"/)?.[1];
const variantProductsHtml = await (await fetch(`${BASE}/demo/admin/productos?q=Shell%2007`, { headers: { cookie } })).text();
const variantProductId = variantProductsHtml.match(/data-field="name" data-id="(\d+)" value="Shell 07"/)?.[1];
check('productos son visibles como fixtures', productId !== undefined && productsHtml.includes('solo lectura'));
check('controles de producto están deshabilitados', productsHtml.includes('disabled'));
check('producto con variantes enlaza su editor', variantProductId !== undefined);
const locationsHtml = await (await fetch(`${BASE}/demo/admin/ubicaciones`, { headers: { cookie } })).text();
check('ubicaciones muestran principal y secundaria sin repartir stock',
  locationsHtml.includes('Almacén central') && locationsHtml.includes('Tienda de muestra')
    && locationsHtml.includes('Principal') && locationsHtml.includes('solo lectura'));
const transfersHtml = await (await fetch(`${BASE}/demo/admin/transferencias`, { headers: { cookie } })).text();
check('transferencias muestran borrador trazable y demo inerte',
  transfersHtml.includes('TRF-DEMO-0001') && transfersHtml.includes('Borrador')
    && transfersHtml.includes('stock en tránsito no se vende') && transfersHtml.includes('disabled'));
const countsHtml = await (await fetch(`${BASE}/demo/admin/conteos`, { headers: { cookie } })).text();
check('conteos muestran foto versionada, doble control y demo inerte',
  countsHtml.includes('CNT-DEMO-0001') && countsHtml.includes('Conteo cíclico')
    && countsHtml.includes('Doble') && countsHtml.includes('disabled'));
const routingHtml = await (await fetch(`${BASE}/demo/admin/asignacion`, { headers: { cookie } })).text();
check('asignación explica una decisión y mantiene reglas demo inertes',
  routingHtml.includes('BM-DEMO-1001') && routingHtml.includes('Almacén central')
    && routingHtml.includes('Stock insuficiente') && routingHtml.includes('disabled'));
const returnsHtml = await (await fetch(`${BASE}/demo/admin/devoluciones`, { headers: { cookie } })).text();
check('devoluciones muestran RMA recibido y demo inerte',
  returnsHtml.includes('RMA-DEMO-1001') && returnsHtml.includes('Recibida')
    && returnsHtml.includes('Registrar recepción') === false && returnsHtml.includes('disabled'));
const documentsHtml = await (await fetch(`${BASE}/demo/admin/documentos`, { headers: { cookie } })).text();
check('documentos separan artefacto logístico y referencia fiscal sin efectos',
  documentsHtml.includes('ALB-DEMO-1004') && documentsHtml.includes('FAC-DEMO-1004')
    && documentsHtml.includes('Logic2B no actúa como software fiscal') && documentsHtml.includes('disabled'));
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
  check(
    'editor enseña galería canónica con foco y asociación a variante',
    variantsHtml.includes('Galería') && variantsHtml.includes('campaign-glacier.webp') && variantsHtml.includes('Foco horizontal'),
  );
  check(
    'editor enseña los cinco tipos de atributo y el override sembrado',
    variantsHtml.includes('Atributos técnicos') && variantsHtml.includes('Peso')
      && variantsHtml.includes('Impermeable') && variantsHtml.includes('Materiales')
      && variantsHtml.includes('Referencia de colección') && variantsHtml.includes('Construcción'),
  );
}

const shippingHtml = await (await fetch(`${BASE}/demo/admin/envios`, { headers: { cookie } })).text();
const rateId = shippingHtml.match(/data-field="price" data-id="(\d+)"/)?.[1];
check('tarifas son fixtures de solo lectura', rateId !== undefined && shippingHtml.includes('solo lectura'));

const orderId = adminHtml.match(/\/demo\/admin\/pedidos\/(\d+)"/)?.[1];
check('panel contiene pedidos ficticios sembrados', orderId !== undefined);
const paidOrdersHtml = await (await fetch(`${BASE}/demo/admin?estado=paid`, { headers: { cookie } })).text();
const paidOrderId = paidOrdersHtml.match(/\/demo\/admin\/pedidos\/(\d+)"/)?.[1];
check('panel contiene un pedido pagado para demostrar operaciones', paidOrderId !== undefined);
if (paidOrderId) {
  const detailHtml = await (await fetch(`${BASE}/demo/admin/pedidos/${paidOrderId}`, { headers: { cookie } })).text();
  check('detalle identifica el pedido como ficticio', detailHtml.includes('Pedido ficticio de ejemplo'));
  check(
    'detalle muestra progreso y grupos de envío como fuente canónica',
    detailHtml.includes('Envíos') && detailHtml.includes('unidades pendientes') && detailHtml.includes('Enviado '),
  );
  check(
    'detalle muestra la cancelación parcial sin habilitar efectos',
    detailHtml.includes('Cancelación parcial') && detailHtml.includes('la API responde 403')
      && detailHtml.includes('Reembolsar selección') && detailHtml.includes('disabled'),
  );
  check('detalle no ofrece acciones mutables', !detailHtml.includes('<form data-ship-form'));
}

// ── 4. El backoffice público rechaza mutaciones aunque haya sesión ───
for (const [label, path, body] of [
  ['producto', `/api/admin/products/${productId ?? 1}`, { stock: 0 }],
  ['tarifa', `/api/admin/shipping-rates/${rateId ?? 1}`, { price_cents: 0 }],
  ['pedido', `/api/admin/orders/${orderId ?? 1}`, { status: 'shipped' }],
]) {
  const response = await fetch(adminUrl(path), {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify(body),
  });
  const responseBody = await json(response);
  check(`mutación de ${label} rechazada`, response.status === 403 && responseBody?.error?.includes('solo lectura'));
}

for (const [label, method, path] of [
  ['opciones', 'POST', `/api/admin/catalog-options/product/${variantProductId ?? 1}`],
  ['reembolso parcial', 'POST', `/api/admin/refunds/${orderId ?? 1}`],
  ['envío parcial', 'POST', '/api/admin/fulfillments'],
  ['entrega de envío', 'PATCH', '/api/admin/fulfillments/1'],
  ['variantes', 'PATCH', `/api/admin/catalog-variants/${variantId ?? 1}`],
  ['galería', 'PUT', `/api/admin/catalog-media/product/${variantProductId ?? 1}`],
  ['atributos', 'POST', `/api/admin/catalog-attributes/definitions/product/${variantProductId ?? 1}`],
  ['nota de pedido', 'POST', '/api/admin/order-notes'],
  ['etiqueta de pedido', 'POST', '/api/admin/order-tags'],
  ['asignación de etiqueta', 'POST', '/api/admin/order-tags/assignments'],
  ['preview de edición', 'POST', '/api/admin/order-amendments/preview'],
  ['edición de pedido', 'POST', '/api/admin/order-amendments'],
  ['alta de incidencia', 'POST', '/api/admin/order-holds'],
  ['resolución de incidencia', 'PATCH', '/api/admin/order-holds/demo-hold-active'],
  ['ubicación de inventario', 'POST', '/api/admin/inventory-locations'],
  ['transferencia de inventario', 'POST', '/api/admin/inventory-transfers'],
  ['conteo de inventario', 'POST', '/api/admin/inventory-counts'],
  ['regla de asignación', 'PATCH', '/api/admin/inventory-routing'],
  ['solicitud de devolución', 'POST', '/api/admin/returns'],
  ['transición de devolución', 'PATCH', '/api/admin/returns/rma_demo_1001'],
  ['alta de documento', 'POST', '/api/admin/order-documents'],
  ['anulación de documento', 'POST', '/api/admin/order-documents/doc_demo_albaran_1004/void'],
]) {
  const response = await fetch(adminUrl(path), {
    method,
    headers: { 'content-type': 'application/json', cookie },
    body: '{}',
  });
  const responseBody = await json(response);
  check(`mutación de ${label} rechazada`, response.status === 403 && responseBody?.error?.includes('solo lectura'));
}

const bulkPreviewResponse = await fetch(adminUrl('/api/admin/order-bulk-actions/preview'), {
  method: 'POST',
  headers: { 'content-type': 'application/json', cookie },
  body: JSON.stringify({
    order_ids: [Number(orderId ?? heldOrderId ?? 1)],
    action: {
      type: 'create_hold', reasonCode: 'other',
      owner: { kind: 'admin', id: 'operations' }, dueAt: '2099-01-01T12:00:00.000Z',
    },
  }),
});
const bulkPreviewBody = await json(bulkPreviewResponse);
check(
  'dry-run masivo demo es lectura pura y devuelve fingerprint',
  bulkPreviewResponse.status === 200
    && String(bulkPreviewBody?.preview?.previewFingerprint ?? '').startsWith('sha256:'),
);
const bulkConfirmResponse = await fetch(adminUrl('/api/admin/order-bulk-actions'), {
  method: 'POST',
  headers: { 'content-type': 'application/json', cookie },
  body: JSON.stringify({ preview: bulkPreviewBody?.preview }),
});
check('confirmación masiva demo rechazada', bulkConfirmResponse.status === 403, `HTTP ${bulkConfirmResponse.status}`);

const csv = await fetch(`${BASE}/api/admin/orders/export.csv`, { headers: { cookie } });
check('CSV de fixtures sigue disponible', csv.ok && (await csv.text()).includes('BM-'));
const backup = await fetch(`${BASE}/api/admin/backup.sql`, { headers: { cookie } });
const backupSql = await backup.text();
check('backup de fixtures sigue disponible', backup.ok && backupSql.includes('INSERT INTO products'));
check(
  'backup conserva media, asociaciones y atributos tipados',
  backupSql.includes('INSERT INTO product_media') && backupSql.includes('INSERT INTO product_variant_media')
    && backupSql.includes('INSERT INTO attribute_definitions') && backupSql.includes('INSERT INTO product_attribute_values'),
);
check(
  'backup esquema 19 conserva operación, RMA, documentos y snapshots de precio',
  backupSql.includes('logic2b-backup-schema: 19')
    && backupSql.includes('INSERT INTO payments')
    && backupSql.includes('INSERT INTO payment_transactions')
    && backupSql.includes('DELETE FROM refunds')
    && backupSql.includes('DELETE FROM refund_items')
    && backupSql.includes('INSERT INTO fulfillments')
    && backupSql.includes('INSERT INTO fulfillment_items')
    && backupSql.includes('INSERT INTO order_notes')
    && backupSql.includes('INSERT INTO order_tag_assignments')
    && backupSql.includes('DELETE FROM order_amendments')
    && backupSql.includes('DELETE FROM order_amendment_lines')
    && backupSql.includes('DELETE FROM refund_payment_allocations')
    && backupSql.includes('INSERT INTO order_holds')
    && backupSql.includes('INSERT INTO order_hold_events')
    && backupSql.includes('DELETE FROM order_bulk_batches')
    && backupSql.includes('DELETE FROM order_bulk_batch_rows')
    && backupSql.includes('0025_price_rule_snapshots')
    && backupSql.includes('INSERT INTO inventory_locations')
    && backupSql.includes('INSERT INTO inventory_location_balances')
    && backupSql.includes('INSERT INTO inventory_transfers')
    && backupSql.includes('INSERT INTO inventory_transfer_lines')
    && backupSql.includes('INSERT INTO inventory_counts')
    && backupSql.includes('INSERT INTO inventory_count_lines')
    && backupSql.includes('INSERT OR REPLACE INTO inventory_routing_policies')
    && backupSql.includes('INSERT INTO inventory_allocation_decisions')
    && backupSql.includes('INSERT INTO inventory_allocation_lines')
    && backupSql.includes('INSERT INTO return_requests')
    && backupSql.includes('INSERT INTO return_request_lines')
    && backupSql.includes('INSERT INTO return_events')
    && backupSql.includes('INSERT INTO order_document_templates')
    && backupSql.includes('INSERT INTO order_documents')
    && backupSql.includes('INSERT INTO order_document_artifacts')
    && backupSql.includes('INSERT INTO order_document_events')
);

if (failures > 0) {
  console.error(`\nE2E: ${failures} comprobaciones fallidas`);
  process.exit(1);
}
console.log('\nE2E: aislamiento de demos y panel verificado ✔');
