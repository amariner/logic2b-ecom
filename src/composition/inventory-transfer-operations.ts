import {
  assertInventoryTransferDraft,
  assertInventoryTransferReceipt,
  createD1InventoryLedger,
  createD1InventoryTransfers,
  planInventoryMovement,
  transferStatusAfterReceipt,
  type InventoryTransferDetail,
  type InventoryTransferLineDraft,
  type InventoryTransferReceiptDraft,
} from '../modules/inventory';
import { createAuditDiff, createAuditEntry, serializeAuditDiff } from '../shared-kernel/audit';

const ACTOR = Object.freeze({ kind: 'admin', id: 'admin-panel', label: 'Panel de administración' } as const);

type LocationBalance = Readonly<{
  variant_id: number;
  on_hand: number;
  reserved: number;
  movement_version: number;
  reservation_version: number;
}>;

type VariantRow = Readonly<{
  id: number;
  product_id: number;
  is_default: number;
}>;

export type CreateInventoryTransferInput = Readonly<{
  sourceLocationId: number;
  destinationLocationId: number;
  lines: readonly InventoryTransferLineDraft[];
  idempotencyKey: string;
  note?: string;
}>;

export type ReceiveInventoryTransferInput = Readonly<{
  expectedVersion: number;
  lines: readonly InventoryTransferReceiptDraft[];
  idempotencyKey: string;
  note?: string;
}>;

export type InventoryTransferMutation = Readonly<{
  outcome: 'applied' | 'idempotent' | 'conflict' | 'not-found';
  detail: InventoryTransferDetail | null;
}>;

function auditValues(entry: ReturnType<typeof createAuditEntry>): readonly unknown[] {
  return [entry.audit_id, entry.occurred_at, entry.actor.kind, entry.actor.id,
    entry.actor.label ?? null, entry.action, entry.entity.type, entry.entity.id,
    entry.entity.reference ?? null, entry.correlation_id, entry.source_event_id,
    serializeAuditDiff(entry.diff), entry.occurred_at];
}

function assertIdempotencyKey(value: string): void {
  if (value.trim() !== value || value.length < 8 || value.length > 160) {
    throw new RangeError('Idempotency key inválida.');
  }
}

function transferId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

function transferNumber(now: string, id: string): string {
  return `TRF-${now.slice(0, 10).replaceAll('-', '')}-${id.slice(-8).toUpperCase()}`;
}

function directLocationMovementStatements(
  db: D1Database,
  input: Readonly<{
    locationId: number;
    balance: LocationBalance | null;
    variant: VariantRow;
    delta: number;
    idempotencyKey: string;
    transferId: string;
    transferLineId: string;
    receiptId: string | null;
    direction: 'dispatch' | 'receipt';
    occurredAt: string;
    auditId: string;
  }>,
): readonly D1PreparedStatement[] {
  const opening = input.balance ?? {
    variant_id: input.variant.id,
    on_hand: 0,
    reserved: 0,
    movement_version: 1,
    reservation_version: 1,
  };
  const planned = planInventoryMovement({
    variant_id: opening.variant_id,
    on_hand: opening.on_hand,
    reserved: opening.reserved,
    version: opening.movement_version,
  }, {
    delta: input.delta,
    reason: 'manual_adjustment',
    actor_kind: 'admin',
    actor_id: ACTOR.id,
    reference_type: 'inventory_transfer',
    reference_id: input.transferId,
    idempotency_key: input.idempotencyKey,
    correlation_id: input.transferId,
  });
  const statements: D1PreparedStatement[] = [];
  if (input.balance === null) {
    statements.push(db.prepare(`INSERT INTO inventory_location_balances (
      location_id, variant_id, on_hand, reserved, movement_version,
      reservation_version, updated_at
    ) SELECT ?, ?, 0, 0, 1, 1, ?
      WHERE EXISTS (SELECT 1 FROM audit_log WHERE audit_id = ?)
        AND NOT EXISTS (SELECT 1 FROM inventory_location_balances WHERE location_id = ? AND variant_id = ?)`)
      .bind(input.locationId, input.variant.id, input.occurredAt, input.auditId,
        input.locationId, input.variant.id));
  }
  statements.push(
    db.prepare(`UPDATE inventory_location_balances
      SET on_hand = ?, movement_version = ?, updated_at = ?
      WHERE location_id = ? AND variant_id = ? AND movement_version = ?
        AND on_hand + ? >= reserved
        AND EXISTS (SELECT 1 FROM audit_log WHERE audit_id = ?)
        AND NOT EXISTS (SELECT 1 FROM inventory_location_movements WHERE idempotency_key = ?)`)
      .bind(planned.on_hand, planned.version_after, input.occurredAt, input.locationId,
        input.variant.id, opening.movement_version, input.delta, input.auditId, input.idempotencyKey),
    db.prepare(`INSERT INTO inventory_location_movements (
      location_id, variant_id, source_movement_id, delta, reason, balance_after,
      version_after, actor_kind, actor_id, reference_type, reference_id,
      idempotency_key, correlation_id, occurred_at, created_at
    ) SELECT ?, ?, NULL, ?, 'manual_adjustment', ?, ?, 'admin', ?,
      'inventory_transfer', ?, ?, ?, ?, ?
      WHERE EXISTS (SELECT 1 FROM audit_log WHERE audit_id = ?)`)
      .bind(input.locationId, input.variant.id, input.delta, planned.balance_after,
        planned.version_after, ACTOR.id, input.transferId, input.idempotencyKey,
        input.transferId, input.occurredAt, input.occurredAt, input.auditId),
    db.prepare(`INSERT INTO inventory_transfer_movements (
      id, transfer_id, transfer_line_id, receipt_id, location_movement_id,
      direction, quantity, created_at
    ) SELECT ?, ?, ?, ?, id, ?, ?, ? FROM inventory_location_movements
      WHERE idempotency_key = ?
        AND EXISTS (SELECT 1 FROM audit_log WHERE audit_id = ?)`)
      .bind(transferId('itm'), input.transferId, input.transferLineId, input.receiptId,
        input.direction, Math.abs(input.delta), input.occurredAt, input.idempotencyKey, input.auditId),
  );
  return statements;
}

function primaryMovementMappingStatement(db: D1Database, input: Readonly<{
  transferId: string;
  transferLineId: string;
  receiptId: string | null;
  direction: 'dispatch' | 'receipt';
  quantity: number;
  globalIdempotencyKey: string;
  occurredAt: string;
  auditId: string;
}>): D1PreparedStatement {
  return db.prepare(`INSERT INTO inventory_transfer_movements (
    id, transfer_id, transfer_line_id, receipt_id, location_movement_id,
    direction, quantity, created_at
  ) SELECT ?, ?, ?, ?, id, ?, ?, ? FROM inventory_location_movements
    WHERE idempotency_key = ?
      AND EXISTS (SELECT 1 FROM audit_log WHERE audit_id = ?)`)
    .bind(transferId('itm'), input.transferId, input.transferLineId, input.receiptId,
      input.direction, input.quantity, input.occurredAt,
      `location:principal:${input.globalIdempotencyKey}`, input.auditId);
}

export function createInventoryTransferOperations(db: D1Database, now = () => new Date().toISOString()) {
  const transfers = createD1InventoryTransfers(db);
  const ledger = createD1InventoryLedger(db);

  async function activeLocation(id: number): Promise<{ id: number; is_primary: number } | null> {
    return db.prepare(`SELECT id, is_primary FROM inventory_locations WHERE id = ? AND status = 'active'`)
      .bind(id).first<{ id: number; is_primary: number }>();
  }

  async function variants(ids: readonly number[]): Promise<ReadonlyMap<number, VariantRow>> {
    const unique = [...new Set(ids)];
    if (unique.length === 0) return new Map();
    const { results } = await db.prepare(`SELECT id, product_id, is_default FROM product_variants
      WHERE status = 'active' AND id IN (${unique.map(() => '?').join(',')})`)
      .bind(...unique).all<VariantRow>();
    return new Map(results.map((variant) => [variant.id, variant]));
  }

  async function locationBalances(locationId: number, variantIds: readonly number[]): Promise<ReadonlyMap<number, LocationBalance>> {
    const unique = [...new Set(variantIds)];
    if (unique.length === 0) return new Map();
    const { results } = await db.prepare(`SELECT variant_id, on_hand, reserved,
      movement_version, reservation_version FROM inventory_location_balances
      WHERE location_id = ? AND variant_id IN (${unique.map(() => '?').join(',')})`)
      .bind(locationId, ...unique).all<LocationBalance>();
    return new Map(results.map((balance) => [balance.variant_id, balance]));
  }

  return Object.freeze({
    list: transfers.list,
    find: transfers.find,
    stockOptions: transfers.stockOptions,

    async create(input: CreateInventoryTransferInput): Promise<InventoryTransferMutation> {
      assertIdempotencyKey(input.idempotencyKey);
      assertInventoryTransferDraft(input);
      const existing = await transfers.findByCreateKey(input.idempotencyKey);
      if (existing) return { outcome: 'idempotent', detail: existing };
      const [source, destination, variantMap] = await Promise.all([
        activeLocation(input.sourceLocationId),
        activeLocation(input.destinationLocationId),
        variants(input.lines.map((line) => line.variantId)),
      ]);
      if (!source || !destination) throw new RangeError('Origen y destino deben estar activos.');
      if (variantMap.size !== input.lines.length) throw new RangeError('La transferencia contiene una variante no disponible.');
      const sourceBalances = await locationBalances(source.id, input.lines.map((line) => line.variantId));
      if (sourceBalances.size !== input.lines.length) {
        throw new RangeError('Una variante no pertenece al inventario de la ubicación de origen.');
      }

      const occurredAt = now();
      const id = transferId('trf');
      const number = transferNumber(occurredAt, id);
      const auditId = transferId('ita');
      const quantity = input.lines.reduce((sum, line) => sum + line.quantity, 0);
      const audit = createAuditEntry({ event_id: auditId, occurred_at: occurredAt }, {
        actor: ACTOR,
        action: 'inventory.transfer_created',
        entity: { type: 'inventory_transfer', id, reference: number },
        diff: createAuditDiff(
          { status: null, source_location_id: null, destination_location_id: null, line_count: 0, quantity: 0 },
          { status: 'draft', source_location_id: source.id, destination_location_id: destination.id, line_count: input.lines.length, quantity },
          ['status', 'source_location_id', 'destination_location_id', 'line_count', 'quantity'],
        ),
      });
      const statements: D1PreparedStatement[] = [
        db.prepare(`INSERT INTO audit_log (
          audit_id, occurred_at, actor_kind, actor_id, actor_label, action,
          entity_type, entity_id, entity_reference, correlation_id,
          source_event_id, diff_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(...auditValues(audit)),
        db.prepare(`INSERT INTO inventory_transfers (
          id, transfer_number, source_location_id, destination_location_id,
          status, version, create_idempotency_key, note, created_at, updated_at
        ) SELECT ?, ?, ?, ?, 'draft', 1, ?, ?, ?, ?
          WHERE EXISTS (SELECT 1 FROM audit_log WHERE audit_id = ?)`)
          .bind(id, number, source.id, destination.id, input.idempotencyKey,
            input.note?.trim() || null, occurredAt, occurredAt, auditId),
      ];
      for (const line of input.lines) {
        statements.push(db.prepare(`INSERT INTO inventory_transfer_lines (
          id, transfer_id, variant_id, requested_quantity, sent_quantity,
          received_quantity, discrepancy_quantity, created_at, updated_at
        ) SELECT ?, ?, ?, ?, 0, 0, 0, ?, ?
          WHERE EXISTS (SELECT 1 FROM inventory_transfers WHERE id = ?)`)
          .bind(transferId('itl'), id, line.variantId, line.quantity, occurredAt, occurredAt, id));
      }
      try {
        await db.batch(statements);
      } catch (error) {
        const raced = await transfers.findByCreateKey(input.idempotencyKey);
        if (raced) return { outcome: 'idempotent', detail: raced };
        throw error;
      }
      return { outcome: 'applied', detail: await transfers.find(id) };
    },

    async ship(id: string, expectedVersion: number, idempotencyKey: string): Promise<InventoryTransferMutation> {
      assertIdempotencyKey(idempotencyKey);
      const duplicate = await db.prepare('SELECT id FROM inventory_transfers WHERE ship_idempotency_key = ?')
        .bind(idempotencyKey).first<{ id: string }>('id');
      if (typeof duplicate === 'string') return { outcome: 'idempotent', detail: await transfers.find(duplicate) };
      const detail = await transfers.find(id);
      if (!detail) return { outcome: 'not-found', detail: null };
      if (detail.transfer.status !== 'draft' || detail.transfer.version !== expectedVersion) {
        return { outcome: 'conflict', detail };
      }
      const source = await activeLocation(detail.transfer.source_location_id);
      if (!source) throw new RangeError('La ubicación de origen ya no está activa.');
      const variantMap = await variants(detail.lines.map((line) => line.variant_id));
      const ids = detail.lines.map((line) => line.variant_id);
      const primaryBalances = source.is_primary === 1 ? await ledger.balances(ids) : null;
      const secondaryBalances = source.is_primary === 0 ? await locationBalances(source.id, ids) : null;
      for (const line of detail.lines) {
        const balance = primaryBalances?.get(line.variant_id) ?? secondaryBalances?.get(line.variant_id);
        if (!balance || balance.on_hand - balance.reserved < line.requested_quantity) {
          throw new RangeError(`Stock insuficiente para ${line.sku}.`);
        }
      }

      const occurredAt = now();
      const auditId = transferId('ita');
      const total = detail.lines.reduce((sum, line) => sum + line.requested_quantity, 0);
      const audit = createAuditEntry({ event_id: auditId, occurred_at: occurredAt }, {
        actor: ACTOR,
        action: 'inventory.transfer_shipped',
        entity: { type: 'inventory_transfer', id, reference: detail.transfer.transfer_number },
        diff: createAuditDiff({ status: 'draft', sent_quantity: 0 }, { status: 'in_transit', sent_quantity: total }, ['status', 'sent_quantity']),
      });
      const statements: D1PreparedStatement[] = [db.prepare(`INSERT INTO audit_log (
        audit_id, occurred_at, actor_kind, actor_id, actor_label, action,
        entity_type, entity_id, entity_reference, correlation_id,
        source_event_id, diff_json, created_at
      ) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? FROM inventory_transfers
        WHERE id = ? AND status = 'draft' AND version = ?`)
        .bind(...auditValues(audit), id, expectedVersion)];

      for (const line of detail.lines) {
        const variant = variantMap.get(line.variant_id)!;
        const movementKey = `transfer:${id}:dispatch:${line.id}`;
        if (source.is_primary === 1) {
          const balance = primaryBalances!.get(line.variant_id)!;
          statements.push(...ledger.movementStatements(
            balance,
            { variant_id: variant.id, product_id: variant.product_id, is_default: variant.is_default === 1, delta: -line.requested_quantity },
            { delta: -line.requested_quantity, reason: 'manual_adjustment', actor_kind: 'admin', actor_id: ACTOR.id,
              reference_type: 'inventory_transfer', reference_id: id, idempotency_key: movementKey, correlation_id: id },
            occurredAt,
            { kind: 'audit', id: auditId },
          ));
          statements.push(primaryMovementMappingStatement(db, {
            transferId: id, transferLineId: line.id, receiptId: null, direction: 'dispatch',
            quantity: line.requested_quantity, globalIdempotencyKey: movementKey, occurredAt, auditId,
          }));
        } else {
          statements.push(...directLocationMovementStatements(db, {
            locationId: source.id, balance: secondaryBalances!.get(line.variant_id)!,
            variant, delta: -line.requested_quantity, idempotencyKey: movementKey,
            transferId: id, transferLineId: line.id, receiptId: null,
            direction: 'dispatch', occurredAt, auditId,
          }));
        }
        statements.push(db.prepare(`UPDATE inventory_transfer_lines
          SET sent_quantity = requested_quantity, updated_at = ?
          WHERE id = ? AND transfer_id = ? AND sent_quantity = 0
            AND EXISTS (SELECT 1 FROM audit_log WHERE audit_id = ?)`)
          .bind(occurredAt, line.id, id, auditId));
      }
      statements.push(db.prepare(`UPDATE inventory_transfers SET status = 'in_transit',
        version = version + 1, ship_idempotency_key = ?, shipped_at = ?, updated_at = ?
        WHERE id = ? AND status = 'draft' AND version = ?
          AND EXISTS (SELECT 1 FROM audit_log WHERE audit_id = ?)`)
        .bind(idempotencyKey, occurredAt, occurredAt, id, expectedVersion, auditId));
      try {
        const results = await db.batch(statements);
        if ((results.at(-1)?.meta.changes ?? 0) === 1) return { outcome: 'applied', detail: await transfers.find(id) };
      } catch (error) {
        const raced = await db.prepare('SELECT id FROM inventory_transfers WHERE ship_idempotency_key = ?')
          .bind(idempotencyKey).first<{ id: string }>('id');
        if (typeof raced === 'string') return { outcome: 'idempotent', detail: await transfers.find(raced) };
        if ((await transfers.find(id))?.transfer.version !== expectedVersion) return { outcome: 'conflict', detail: await transfers.find(id) };
        throw error;
      }
      return { outcome: 'conflict', detail: await transfers.find(id) };
    },

    async receive(id: string, input: ReceiveInventoryTransferInput): Promise<InventoryTransferMutation> {
      assertIdempotencyKey(input.idempotencyKey);
      const duplicate = await db.prepare('SELECT transfer_id FROM inventory_transfer_receipts WHERE idempotency_key = ?')
        .bind(input.idempotencyKey).first<{ transfer_id: string }>('transfer_id');
      if (typeof duplicate === 'string') return { outcome: 'idempotent', detail: await transfers.find(duplicate) };
      const detail = await transfers.find(id);
      if (!detail) return { outcome: 'not-found', detail: null };
      if (!['in_transit', 'partially_received'].includes(detail.transfer.status) || detail.transfer.version !== input.expectedVersion) {
        return { outcome: 'conflict', detail };
      }
      assertInventoryTransferReceipt(detail.lines.map((line) => ({
        id: line.id, sentQuantity: line.sent_quantity,
        receivedQuantity: line.received_quantity, discrepancyQuantity: line.discrepancy_quantity,
      })), input.lines);
      if ((input.note?.trim().length ?? 0) > 500) throw new RangeError('La nota de recepción supera el máximo permitido.');
      const destination = await activeLocation(detail.transfer.destination_location_id);
      if (!destination) throw new RangeError('La ubicación de destino ya no está activa.');
      const variantMap = await variants(detail.lines.map((line) => line.variant_id));
      const receivedLines = new Map(input.lines.map((line) => [line.transferLineId, line]));
      const nextLines = detail.lines.map((line) => {
        const receipt = receivedLines.get(line.id);
        return {
          sentQuantity: line.sent_quantity,
          receivedQuantity: line.received_quantity + (receipt?.receivedQuantity ?? 0),
          discrepancyQuantity: line.discrepancy_quantity + (receipt?.discrepancyQuantity ?? 0),
        };
      });
      const nextStatus = transferStatusAfterReceipt(nextLines);
      const destinationIds = input.lines.filter((line) => line.receivedQuantity > 0)
        .map((receipt) => detail.lines.find((line) => line.id === receipt.transferLineId)!.variant_id);
      const primaryBalances = destination.is_primary === 1 ? await ledger.balances(destinationIds) : null;
      const secondaryBalances = destination.is_primary === 0 ? await locationBalances(destination.id, destinationIds) : null;
      const occurredAt = now();
      const receiptId = transferId('itr');
      const auditId = transferId('ita');
      const receivedTotal = input.lines.reduce((sum, line) => sum + line.receivedQuantity, 0);
      const discrepancyTotal = input.lines.reduce((sum, line) => sum + line.discrepancyQuantity, 0);
      const audit = createAuditEntry({ event_id: auditId, occurred_at: occurredAt }, {
        actor: ACTOR,
        action: 'inventory.transfer_received',
        entity: { type: 'inventory_transfer', id, reference: detail.transfer.transfer_number },
        diff: createAuditDiff(
          { status: detail.transfer.status, received_quantity: detail.transfer.received_quantity, discrepancy_quantity: detail.transfer.discrepancy_quantity },
          { status: nextStatus, received_quantity: detail.transfer.received_quantity + receivedTotal, discrepancy_quantity: detail.transfer.discrepancy_quantity + discrepancyTotal },
          ['status', 'received_quantity', 'discrepancy_quantity'],
        ),
      });
      const statements: D1PreparedStatement[] = [
        db.prepare(`INSERT INTO audit_log (
          audit_id, occurred_at, actor_kind, actor_id, actor_label, action,
          entity_type, entity_id, entity_reference, correlation_id,
          source_event_id, diff_json, created_at
        ) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? FROM inventory_transfers
          WHERE id = ? AND status IN ('in_transit', 'partially_received') AND version = ?`)
          .bind(...auditValues(audit), id, input.expectedVersion),
        db.prepare(`INSERT INTO inventory_transfer_receipts (
          id, transfer_id, idempotency_key, note, occurred_at, created_at
        ) SELECT ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM audit_log WHERE audit_id = ?)`)
          .bind(receiptId, id, input.idempotencyKey, input.note?.trim() || null, occurredAt, occurredAt, auditId),
      ];

      for (const receipt of input.lines) {
        const line = detail.lines.find((candidate) => candidate.id === receipt.transferLineId)!;
        statements.push(
          db.prepare(`INSERT INTO inventory_transfer_receipt_lines (
            receipt_id, transfer_line_id, received_quantity, discrepancy_quantity
          ) SELECT ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM inventory_transfer_receipts WHERE id = ?)`)
            .bind(receiptId, line.id, receipt.receivedQuantity, receipt.discrepancyQuantity, receiptId),
          db.prepare(`UPDATE inventory_transfer_lines SET
            received_quantity = received_quantity + ?,
            discrepancy_quantity = discrepancy_quantity + ?, updated_at = ?
            WHERE id = ? AND transfer_id = ?
              AND received_quantity + discrepancy_quantity + ? + ? <= sent_quantity
              AND EXISTS (SELECT 1 FROM inventory_transfer_receipts WHERE id = ?)`)
            .bind(receipt.receivedQuantity, receipt.discrepancyQuantity, occurredAt,
              line.id, id, receipt.receivedQuantity, receipt.discrepancyQuantity, receiptId),
        );
        if (receipt.receivedQuantity < 1) continue;
        const variant = variantMap.get(line.variant_id)!;
        const movementKey = `transfer:${id}:receipt:${receiptId}:${line.id}`;
        if (destination.is_primary === 1) {
          const balance = primaryBalances!.get(line.variant_id);
          if (!balance) throw new RangeError(`No existe el balance principal de ${line.sku}.`);
          statements.push(...ledger.movementStatements(
            balance,
            { variant_id: variant.id, product_id: variant.product_id, is_default: variant.is_default === 1, delta: receipt.receivedQuantity },
            { delta: receipt.receivedQuantity, reason: 'manual_adjustment', actor_kind: 'admin', actor_id: ACTOR.id,
              reference_type: 'inventory_transfer', reference_id: id, idempotency_key: movementKey, correlation_id: id },
            occurredAt,
            { kind: 'audit', id: auditId },
          ));
          statements.push(primaryMovementMappingStatement(db, {
            transferId: id, transferLineId: line.id, receiptId, direction: 'receipt',
            quantity: receipt.receivedQuantity, globalIdempotencyKey: movementKey, occurredAt, auditId,
          }));
        } else {
          statements.push(...directLocationMovementStatements(db, {
            locationId: destination.id, balance: secondaryBalances!.get(line.variant_id) ?? null,
            variant, delta: receipt.receivedQuantity, idempotencyKey: movementKey,
            transferId: id, transferLineId: line.id, receiptId,
            direction: 'receipt', occurredAt, auditId,
          }));
        }
      }
      statements.push(db.prepare(`UPDATE inventory_transfers SET status = ?,
        version = version + 1, updated_at = ?, completed_at = ?
        WHERE id = ? AND status IN ('in_transit', 'partially_received') AND version = ?
          AND EXISTS (SELECT 1 FROM inventory_transfer_receipts WHERE id = ?)`)
        .bind(nextStatus, occurredAt, nextStatus === 'received' ? occurredAt : null,
          id, input.expectedVersion, receiptId));
      try {
        const results = await db.batch(statements);
        if ((results.at(-1)?.meta.changes ?? 0) === 1) return { outcome: 'applied', detail: await transfers.find(id) };
      } catch (error) {
        const raced = await db.prepare('SELECT transfer_id FROM inventory_transfer_receipts WHERE idempotency_key = ?')
          .bind(input.idempotencyKey).first<{ transfer_id: string }>('transfer_id');
        if (typeof raced === 'string') return { outcome: 'idempotent', detail: await transfers.find(raced) };
        if ((await transfers.find(id))?.transfer.version !== input.expectedVersion) return { outcome: 'conflict', detail: await transfers.find(id) };
        throw error;
      }
      return { outcome: 'conflict', detail: await transfers.find(id) };
    },
  });
}

export type InventoryTransferOperations = ReturnType<typeof createInventoryTransferOperations>;
