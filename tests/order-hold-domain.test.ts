import { describe, expect, it } from 'vitest';
import {
  activeOrderHoldIds,
  assertOrderPreparationAllowed,
  orderHoldSlaState,
  planOrderHold,
  planOrderHoldAssignment,
  planOrderHoldResolution,
  type OrderHoldSnapshot,
} from '../src/modules/orders';

const CREATED_AT = '2026-08-13T08:00:00.000Z';
const DUE_AT = '2026-08-13T12:00:00.000Z';

const activeHold: OrderHoldSnapshot = {
  id: 'hold_1',
  order_id: 42,
  status: 'active',
  source: 'manual',
  reason_code: 'address_issue',
  owner: { kind: 'admin', id: 'operations', label: 'Operaciones' },
  due_at: DUE_AT,
  version: 2,
  created_at: CREATED_AT,
  resolved_at: null,
  resolution_code: null,
};

describe('dominio de holds e incidencias R3.4', () => {
  it('crea un hold determinista con responsable, SLA e idempotencia', () => {
    expect(planOrderHold({
      source: 'automatic',
      reasonCode: 'inventory_issue',
      owner: { kind: 'system', id: 'inventory-policy', label: 'Política de inventario' },
      createdAt: CREATED_AT,
      dueAt: DUE_AT,
      idempotencyKey: ' order:42:inventory:shortage:7 ',
    })).toEqual({
      status: 'active',
      source: 'automatic',
      reason_code: 'inventory_issue',
      owner: { kind: 'system', id: 'inventory-policy', label: 'Política de inventario' },
      due_at: DUE_AT,
      version: 1,
      created_at: CREATED_AT,
      resolved_at: null,
      resolution_code: null,
      idempotency_key: 'order:42:inventory:shortage:7',
    });
  });

  it('rechaza SLA no futuro, timestamps ambiguos y actores vacíos', () => {
    const base = {
      source: 'manual' as const,
      reasonCode: 'other' as const,
      owner: { kind: 'admin' as const, id: 'operations', label: 'Operaciones' },
      createdAt: CREATED_AT,
      dueAt: DUE_AT,
      idempotencyKey: 'hold:1',
    };
    expect(() => planOrderHold({ ...base, dueAt: CREATED_AT })).toThrow(/posterior/);
    expect(() => planOrderHold({ ...base, createdAt: '2026-08-13 08:00' })).toThrow(/ISO UTC/);
    expect(() => planOrderHold({ ...base, owner: { ...base.owner, id: ' ' } })).toThrow(/owner.id/);
    expect(() => planOrderHold({ ...base, reasonCode: 'hostile' as never })).toThrow(/reasonCode/);
  });

  it('reasigna con versión optimista y conserva el histórico como un plan', () => {
    expect(planOrderHoldAssignment(activeHold, {
      expectedVersion: 2,
      owner: { kind: 'admin', id: 'warehouse', label: 'Almacén' },
      assignedAt: '2026-08-13T09:00:00.000Z',
    })).toEqual({
      owner: { kind: 'admin', id: 'warehouse', label: 'Almacén' },
      version: 3,
      assigned_at: '2026-08-13T09:00:00.000Z',
    });
    expect(() => planOrderHoldAssignment(activeHold, {
      expectedVersion: 1,
      owner: { kind: 'admin', id: 'warehouse', label: 'Almacén' },
      assignedAt: '2026-08-13T09:00:00.000Z',
    })).toThrow(/obsoleto/);
    expect(() => planOrderHoldAssignment(activeHold, {
      expectedVersion: 2,
      owner: activeHold.owner,
      assignedAt: '2026-08-13T09:00:00.000Z',
    })).toThrow(/responsable/);
  });

  it('resuelve una sola vez y exige la versión observada', () => {
    expect(planOrderHoldResolution(activeHold, {
      expectedVersion: 2,
      resolutionCode: 'cleared',
      resolvedAt: '2026-08-13T10:00:00.000Z',
    })).toEqual({
      status: 'resolved',
      resolution_code: 'cleared',
      resolved_at: '2026-08-13T10:00:00.000Z',
      version: 3,
    });
    const resolved = {
      ...activeHold,
      status: 'resolved' as const,
      resolved_at: '2026-08-13T10:00:00.000Z',
      resolution_code: 'cleared' as const,
    };
    expect(() => planOrderHoldResolution(resolved, {
      expectedVersion: 2,
      resolutionCode: 'duplicate',
      resolvedAt: '2026-08-13T10:30:00.000Z',
    })).toThrow(/resuelto/);
    expect(() => planOrderHoldResolution(activeHold, {
      expectedVersion: 2,
      resolutionCode: 'hostile' as never,
      resolvedAt: '2026-08-13T10:30:00.000Z',
    })).toThrow(/resolutionCode/);
  });

  it('calcula el SLA sin leer el reloj global', () => {
    expect(orderHoldSlaState(activeHold, '2026-08-13T11:59:59.999Z')).toBe('on_track');
    expect(orderHoldSlaState(activeHold, DUE_AT)).toBe('breached');
    expect(orderHoldSlaState({ ...activeHold, status: 'resolved' }, DUE_AT)).toBe('resolved');
  });

  it('bloquea preparación mientras quede cualquier hold activo', () => {
    const resolved = { ...activeHold, id: 'hold_2', status: 'resolved' as const };
    expect(activeOrderHoldIds([resolved, activeHold])).toEqual(['hold_1']);
    expect(() => assertOrderPreparationAllowed([resolved, activeHold])).toThrow(/1 hold/);
    expect(() => assertOrderPreparationAllowed([resolved])).not.toThrow();
  });
});
