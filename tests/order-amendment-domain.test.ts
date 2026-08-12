import { describe, expect, it } from 'vitest';
import { planOrderAmendment } from '../src/modules/orders';

const order = {
  id: 1,
  order_number: 'R33-1',
  email: 'qa@example.test',
  status: 'paid',
  edit_version: 3,
  address_json: '{"postal_code":"12001"}',
  subtotal_cents: 3000,
  shipping_cents: 500,
  total_cents: 3500,
  currency: 'EUR',
} as const;

const lines = [{
  order_item_id: 11,
  product_id: 1,
  variant_id: 101,
  name_snapshot: 'Producto',
  sku_snapshot: 'SKU-1',
  variant_name_snapshot: null,
  unit_price_cents: 1000,
  current_quantity: 3,
  fulfilled_quantity: 1,
  cancelled_quantity: 0,
}] as const;

const variants = [
  {
    product_id: 1, variant_id: 101, name: 'Producto', sku: 'SKU-1',
    variant_name: null, unit_price_cents: 1200, available_quantity: 4, active: true,
  },
  {
    product_id: 2, variant_id: 202, name: 'Otro', sku: 'SKU-2',
    variant_name: 'Grande', unit_price_cents: 750, available_quantity: 2, active: true,
  },
] as const;

function plan(overrides: Partial<Parameters<typeof planOrderAmendment>[0]> = {}) {
  return planOrderAmendment({
    order,
    lines,
    variants,
    requestedLines: [{ order_item_id: 11, quantity: 2 }],
    addressAfterJson: order.address_json,
    shippingAfterCents: 500,
    hasActiveFulfillment: true,
    hasActiveAmendment: false,
    ...overrides,
  });
}

describe('planificador de edición de pedido', () => {
  it('calcula una reducción y conserva el precio congelado de la línea', () => {
    const result = plan();
    expect(result.delta_cents).toBe(-1000);
    expect(result.status).toBe('pending_refund');
    expect(result.lines[0]).toMatchObject({
      quantity_before: 3,
      quantity_after: 2,
      amount_delta_cents: -1000,
      unit_price_cents: 1000,
    });
    expect(result.stock_restock).toEqual([{ product_id: 1, variant_id: 101, quantity: 1 }]);
  });

  it('añade una variante a precio servidor y exige cobro alojado', () => {
    const result = plan({
      requestedLines: [{ variant_id: 202, quantity: 2 }],
      hasActiveFulfillment: false,
    });
    expect(result.subtotal_after_cents).toBe(4500);
    expect(result.total_after_cents).toBe(5000);
    expect(result.delta_cents).toBe(1500);
    expect(result.status).toBe('pending_payment');
    expect(result.stock_increments).toEqual([{ product_id: 2, variant_id: 202, quantity: 2 }]);
  });

  it('permite una edición neutra de dirección antes del primer envío', () => {
    const address = '{"postal_code":"12002"}';
    const result = plan({
      requestedLines: [],
      addressAfterJson: address,
      hasActiveFulfillment: false,
    });
    expect(result.status).toBe('ready');
    expect(result.address_changed).toBe(true);
    expect(result.lines).toEqual([]);
  });

  it('rechaza precio hostil implícitamente: el contrato no acepta importes', () => {
    const hostile = { order_item_id: 11, quantity: 4, unit_price_cents: 1 } as unknown as {
      order_item_id: number; quantity: number;
    };
    const result = plan({ requestedLines: [hostile], hasActiveFulfillment: false });
    expect(result.lines[0]?.unit_price_cents).toBe(1000);
    expect(result.delta_cents).toBe(1000);
  });

  it('impide bajar de lo ya enviado o cambiar dirección tras fulfillment', () => {
    expect(() => plan({ requestedLines: [{ order_item_id: 11, quantity: 0 }] }))
      .toThrow(/enviado y cancelado/);
    expect(() => plan({
      requestedLines: [],
      addressAfterJson: '{"postal_code":"12002"}',
    })).toThrow(/dirección/);
  });

  it('rechaza stock insuficiente, una segunda edición y no-op', () => {
    expect(() => plan({
      requestedLines: [{ variant_id: 202, quantity: 3 }],
      hasActiveFulfillment: false,
    })).toThrow(/inventario/);
    expect(() => plan({ hasActiveAmendment: true })).toThrow(/edición activa/);
    expect(() => plan({ requestedLines: [], hasActiveFulfillment: false })).toThrow(/no contiene cambios/);
  });
});
