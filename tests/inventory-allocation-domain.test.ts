import { describe, expect, it } from 'vitest';
import {
  planInventoryRouting,
  type InventoryRoutingCandidate,
} from '../src/modules/inventory';

const candidate = (patch: Partial<InventoryRoutingCandidate>): InventoryRoutingCandidate => ({
  locationId: 1,
  code: 'principal',
  isPrimary: true,
  priority: 100,
  handlingCostCents: 0,
  policyVersion: 1,
  markets: ['*'],
  channels: ['*'],
  availableByVariant: { 11: 4, 12: 4 },
  ...patch,
});

describe('R3.9 planificador determinista de ubicación', () => {
  const demands = [
    { orderItemId: 101, variantId: 11, quantity: 2 },
    { orderItemId: 102, variantId: 12, quantity: 1 },
  ] as const;

  it('filtra mercado, canal y stock y desempata por prioridad, coste e id', () => {
    const plan = planInventoryRouting({
      market: 'es', channel: 'Storefront', demands,
      candidates: [
        candidate({ locationId: 9, code: 'sin-stock', priority: 1, availableByVariant: { 11: 1, 12: 4 } }),
        candidate({ locationId: 8, code: 'francia', priority: 1, markets: ['FR'] }),
        candidate({ locationId: 7, code: 'pos', priority: 1, channels: ['pos'] }),
        candidate({ locationId: 4, code: 'norte', isPrimary: false, priority: 10, handlingCostCents: 90 }),
        candidate({ locationId: 3, code: 'sur', isPrimary: false, priority: 10, handlingCostCents: 90 }),
        candidate({ locationId: 2, code: 'caro', isPrimary: false, priority: 10, handlingCostCents: 120 }),
      ],
    });
    expect(plan.selected.code).toBe('sur');
    expect(plan.candidates.map(({ code, reason }) => [code, reason])).toEqual([
      ['sin-stock', 'stock'], ['francia', 'market'], ['pos', 'channel'],
      ['norte', 'eligible'], ['sur', 'eligible'], ['caro', 'eligible'],
    ]);
  });

  it('exige que una sola ubicación cubra íntegramente el envío', () => {
    expect(() => planInventoryRouting({
      market: 'ES', channel: 'storefront', demands,
      candidates: [
        candidate({ locationId: 1, availableByVariant: { 11: 2, 12: 0 } }),
        candidate({ locationId: 2, availableByVariant: { 11: 0, 12: 1 } }),
      ],
    })).toThrowError('Ninguna ubicación puede cubrir íntegramente el envío.');
  });
});
