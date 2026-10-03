import {
  CustomerSegmentationContractError, defineCustomerSegmentFactsPolicy,
  projectCustomerSegmentFacts, normalizeCustomerSegmentFactsSnapshot,
  MAX_CUSTOMER_SEGMENT_CANDIDATES, segmentFingerprint, segmentInteger,
  segmentOpaqueId, segmentTimestamp,
  type CustomerSegmentFactsSource, type CustomerSegmentOrderEvidence,
} from '../modules/customers';

type Row = Record<string, unknown>;

/** Límites de lectura, no límites comerciales. Un exceso aborta toda la captura. */
export const CUSTOMER_SEGMENT_SOURCE_LIMITS = Object.freeze({
  profiles: MAX_CUSTOMER_SEGMENT_CANDIDATES, orders: 1_000, payments: 5_000,
  transactions: 10_000, storedValueEntries: 10_000, amendments: 1_000,
});

function invalid(message: string): never { throw new CustomerSegmentationContractError(message); }
const integer = (value: unknown, field: string, min = 0) => segmentInteger(value, min, field);
function add(left: number, right: number): number { return integer(left + right, 'suma de evidencia'); }
function currency(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Z]{3}$/.test(value)) invalid('Moneda ausente o inválida en la fuente.');
  return value;
}

// SQLite legacy guarda UTC sin sufijo; no se admiten zonas implícitas del host.
function timestamp(value: unknown, nowMs: number): string {
  if (typeof value !== 'string') invalid('Fecha ausente en la fuente.');
  const legacy = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value);
  return segmentTimestamp(legacy ? `${value.replace(' ', 'T')}.000Z` : value, nowMs, 'fecha de fuente');
}

/**
 * Captura transversal interna: un único batch de lecturas, sin escritor, ruta,
 * job ni registro en el runtime. No reconstruye un estado histórico por fecha.
 */
export function createD1CustomerSegmentFactsSource(
  db: D1Database,
  policyInput: unknown,
  options: Readonly<{ now?: () => number }> = {},
): CustomerSegmentFactsSource {
  const policy = defineCustomerSegmentFactsPolicy(policyInput);
  const now = options.now ?? Date.now;
  const limits = CUSTOMER_SEGMENT_SOURCE_LIMITS;
  // El sentinel +1 detecta el exceso; jamás se devuelve una población truncada.
  const scope = `WITH profiles AS (
    SELECT id, version, created_at FROM customer_profiles WHERE status='active'
    ORDER BY id COLLATE BINARY LIMIT ${limits.profiles + 1}
  ), selected_orders AS (
    SELECT o.id, o.customer_profile_id, o.status, o.currency, o.total_cents,
      o.edit_version, o.created_at FROM orders o JOIN profiles p ON p.id=o.customer_profile_id
    ORDER BY o.id LIMIT ${limits.orders + 1}
  ), selected_payments AS (
    SELECT p.id, p.order_id, p.currency, p.status FROM payments p
    JOIN selected_orders o ON o.id=p.order_id ORDER BY p.id LIMIT ${limits.payments + 1}
  )`;
  const statements = [
    "SELECT strftime('%Y-%m-%dT%H:%M:%fZ','now') AS captured_at",
    `${scope} SELECT id,version,created_at FROM profiles ORDER BY id COLLATE BINARY`,
    `${scope} SELECT id,customer_profile_id,status,currency,total_cents,edit_version,created_at FROM selected_orders ORDER BY id`,
    `${scope} SELECT id,order_id,currency,status FROM selected_payments ORDER BY id`,
    `${scope} SELECT t.id,t.payment_id,t.type,t.amount_cents,t.currency,t.status,t.occurred_at
      FROM payment_transactions t JOIN selected_payments p ON p.id=t.payment_id
      ORDER BY t.id LIMIT ${limits.transactions + 1}`,
    `${scope} SELECT l.id,l.order_id,l.type,l.balance_delta_cents,l.occurred_at,a.currency
      FROM stored_value_ledger_entries l JOIN selected_orders o ON o.id=l.order_id
      JOIN stored_value_accounts a ON a.id=l.account_id WHERE l.type IN ('capture','refund')
      ORDER BY l.id COLLATE BINARY LIMIT ${limits.storedValueEntries + 1}`,
    `${scope} SELECT a.order_id,a.expected_order_version,a.total_before_cents,a.total_after_cents,
      a.currency,a.applied_at FROM order_amendments a JOIN selected_orders o ON o.id=a.order_id
      WHERE a.status='applied' ORDER BY a.order_id,a.expected_order_version
      LIMIT ${limits.amendments + 1}`,
  ];
  return Object.freeze({
    async capture() {
      // Validar el reloj antes de I/O, también si D1 devolviera población vacía.
      const before = now();
      segmentTimestamp('1970-01-01T00:00:00.000Z', before, 'reloj');
      const batches = await db.batch<Row>(statements.map((sql) => db.prepare(sql)));
      if (batches.length !== statements.length || batches.some((result) =>
        result.success !== true || !Array.isArray(result.results))) invalid('Captura D1 incompleta.');
      // El tamaño y cada result se han validado; la tupla conserva esa prueba
      // para no convertir una respuesta ausente en un array vacío.
      const rows = batches.map((result) => result.results) as [Row[], Row[], Row[], Row[], Row[], Row[], Row[]];
      const [clockRows, profiles, orders, payments, transactions, stored, amendments] = rows;
      if (clockRows.length !== 1) invalid('Reloj D1 ausente.');
      const capturedAt = timestamp(clockRows[0]!.captured_at, now());
      const captureMs = Date.parse(capturedAt);
      const bounds = [limits.profiles, limits.orders, limits.payments, limits.transactions, limits.storedValueEntries, limits.amendments];
      for (const [index, bound] of bounds.entries()) {
        if (rows[index + 1]!.length > bound) invalid(`La captura supera el límite técnico de ${bound} (${Object.keys(limits)[index]}).`);
      }
      const orderMap = new Map<number, { owner: string; version: number; evidence: MutableOrder }>();
      for (const row of orders) {
        const id = integer(row.id, 'order.id', 1);
        if (orderMap.has(id)) invalid('Pedido duplicado en la captura.');
        const total = integer(row.total_cents, 'order.total');
        orderMap.set(id, { owner: segmentOpaqueId(row.customer_profile_id, 'order.owner'),
          version: integer(row.edit_version, 'order.version', 1), evidence: {
            id, status: row.status as CustomerSegmentOrderEvidence['status'],
            currency: currency(row.currency), createdAt: timestamp(row.created_at, captureMs),
            originalTotalCents: total, currentTotalCents: total, paymentCount: 0,
            captureCount: 0, capturedCents: 0, refundedCents: 0,
            storedValueCaptureCount: 0, storedValueCapturedCents: 0, storedValueRefundedCents: 0,
            firstCaptureAt: null, lastCaptureAt: null,
            firstStoredValueCaptureAt: null, lastStoredValueCaptureAt: null,
            adjustmentCount: 0, unsettledPaymentCount: 0,
          } });
      }
      function order(id: unknown): MutableOrder {
        const found = orderMap.get(integer(id, 'order.id', 1));
        if (!found) invalid('Evidencia sin pedido en la captura.');
        return found.evidence;
      }
      function sameCurrency(evidence: MutableOrder, value: unknown) {
        if (currency(value) !== evidence.currency) invalid('Monedas incompatibles en la evidencia del pedido.');
      }
      const paymentMap = new Map<number, MutableOrder>();
      for (const row of payments) {
        const id = integer(row.id, 'payment.id', 1);
        if (paymentMap.has(id)) invalid('Pago duplicado en la captura.');
        const evidence = order(row.order_id);
        sameCurrency(evidence, row.currency);
        if (!['pending', 'authorized', 'captured', 'partially_refunded', 'refunded', 'failed', 'cancelled', 'requires_review'].includes(String(row.status))) invalid('Estado de pago inválido.');
        if (['pending', 'authorized', 'requires_review'].includes(String(row.status))) evidence.unsettledPaymentCount++;
        paymentMap.set(id, evidence);
      }
      for (const row of transactions) {
        const evidence = paymentMap.get(integer(row.payment_id, 'transaction.payment', 1));
        if (!evidence) invalid('Asiento sin pago en la captura.');
        sameCurrency(evidence, row.currency);
        const amount = integer(row.amount_cents, 'transaction.amount');
        const at = timestamp(row.occurred_at, captureMs);
        // La conversión de un presupuesto conserva depósitos cobrados antes
        // de crear el pedido; occurred_at mantiene esa historia financiera.
        if (!['authorization', 'capture', 'refund', 'void', 'adjustment'].includes(String(row.type)) ||
          !['pending', 'succeeded', 'failed', 'requires_review'].includes(String(row.status))) invalid('Asiento no reconocido.');
        evidence.paymentCount++;
        if (row.status === 'pending' || row.status === 'requires_review') evidence.unsettledPaymentCount++;
        if (row.status !== 'succeeded') continue;
        if (row.type === 'adjustment') evidence.adjustmentCount++;
        if (row.type === 'capture') {
          evidence.captureCount++;
          evidence.capturedCents = add(evidence.capturedCents, amount);
          evidence.firstCaptureAt = earliest(evidence.firstCaptureAt, at);
          evidence.lastCaptureAt = latest(evidence.lastCaptureAt, at);
        }
        if (row.type === 'refund') evidence.refundedCents = add(evidence.refundedCents, amount);
      }
      for (const row of stored) {
        const evidence = order(row.order_id);
        sameCurrency(evidence, row.currency);
        const at = timestamp(row.occurred_at, captureMs);
        if (typeof row.balance_delta_cents !== 'number' || !Number.isSafeInteger(row.balance_delta_cents)) invalid('Movimiento de saldo inválido.');
        if (row.type === 'capture') {
          const amount = integer(-row.balance_delta_cents, 'stored.capture', 1);
          evidence.storedValueCaptureCount++;
          evidence.storedValueCapturedCents = add(evidence.storedValueCapturedCents, amount);
          evidence.firstStoredValueCaptureAt = earliest(evidence.firstStoredValueCaptureAt, at);
          evidence.lastStoredValueCaptureAt = latest(evidence.lastStoredValueCaptureAt, at);
        } else if (row.type === 'refund') {
          evidence.storedValueRefundedCents = add(evidence.storedValueRefundedCents, integer(row.balance_delta_cents, 'stored.refund', 1));
        } else invalid('Tipo de saldo inválido.');
      }
      const amendmentVersions = new Map<number, number>();
      const amendmentTotals = new Map<number, number>();
      for (const row of amendments) {
        const evidence = order(row.order_id);
        sameCurrency(evidence, row.currency);
        if (timestamp(row.applied_at, captureMs) < evidence.createdAt) invalid('Modificación anterior al pedido.');
        const version = integer(row.expected_order_version, 'amendment.version', 1);
        if (version !== (amendmentVersions.get(evidence.id) ?? 0) + 1) invalid('Historia de modificaciones incompleta.');
        const beforeTotal = integer(row.total_before_cents, 'amendment.before');
        if (version === 1) evidence.originalTotalCents = beforeTotal;
        else if (beforeTotal !== amendmentTotals.get(evidence.id)) invalid('Importes de modificaciones discontinuos.');
        amendmentVersions.set(evidence.id, version);
        amendmentTotals.set(evidence.id, integer(row.total_after_cents, 'amendment.after'));
      }
      for (const { evidence, version } of orderMap.values()) {
        if (version !== (amendmentVersions.get(evidence.id) ?? 0) + 1 ||
          (amendmentTotals.has(evidence.id) && amendmentTotals.get(evidence.id) !== evidence.currentTotalCents)) invalid('Pedido sin historia coherente de modificaciones.');
      }
      const owners = new Set<string>();
      const candidates = profiles.map((row) => {
        const customerProfileId = segmentOpaqueId(row.id, 'profile.id');
        if (owners.has(customerProfileId)) invalid('Perfil duplicado en la captura.');
        owners.add(customerProfileId);
        return {
          customerProfileId, customerProfileVersion: integer(row.version, 'profile.version', 1),
          facts: projectCustomerSegmentFacts(policy, {
            createdAt: timestamp(row.created_at, captureMs),
            orders: [...orderMap.values()].filter((entry) => entry.owner === customerProfileId).map((entry) => entry.evidence),
          }, capturedAt),
        };
      });
      if ([...orderMap.values()].some((entry) => !owners.has(entry.owner))) invalid('Pedido sin perfil en la captura.');
      const content = { policyId: policy.id, policyVersion: policy.version, capturedAt, currency: policy.currency, candidates };
      // La huella de reglas queda en la referencia aun sin DDL de políticas.
      const ref = `source:${await segmentFingerprint(policy)}:${await segmentFingerprint(content)}`;
      return normalizeCustomerSegmentFactsSnapshot({ ref, ...content }, now());
    },
  });
}

type MutableOrder = { -readonly [K in keyof CustomerSegmentOrderEvidence]: CustomerSegmentOrderEvidence[K] };
function earliest(previous: string | null, value: string): string { return previous === null || value < previous ? value : previous; }
function latest(previous: string | null, value: string): string { return previous === null || value > previous ? value : previous; }
