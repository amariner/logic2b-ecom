import { describe, expect, it, vi } from 'vitest';
import {
  CUSTOMER_ORDER_LIST_PAGE_SIZE,
  createCustomerOrderListService,
  decodeCustomerOrderListCursor,
  encodeCustomerOrderListCursor,
} from '../src/modules/customers/application/customer-order-list';

const REF = `ord_${'a'.repeat(32)}`;
const AT = '2026-08-21T12:00:00.000Z';

describe('cursor owner-only del historial de pedidos R5.5d', () => {
  it('roundtrip conserva solo instante y referencia pública', () => {
    const token = encodeCustomerOrderListCursor({ createdAt: AT, publicRef: REF });
    expect(token).not.toContain('customer_profile');
    expect(decodeCustomerOrderListCursor(token)).toEqual({ createdAt: AT, publicRef: REF });
  });

  it.each([
    'not-base64',
    encodeCustomerOrderListCursor({ createdAt: AT, publicRef: REF }).slice(1),
    btoa(JSON.stringify({ v: 1, t: AT, r: 'ORDER-123' })),
    btoa(JSON.stringify({ v: 1, t: 'ayer', r: REF })),
    btoa(JSON.stringify({ v: 1, t: AT, r: REF, owner: 'customer_profile:other' })),
  ])('rechaza forma manipulada %#', (token) => {
    expect(() => decodeCustomerOrderListCursor(token)).toThrow(RangeError);
  });

  it('el servicio fija el límite y no entrega owner al cursor', async () => {
    const listOwned = vi.fn(async () => ({ orders: [], nextCursor: null }));
    const service = createCustomerOrderListService({ listOwned });
    await expect(service.list({ ownerProfileId: 'customer_profile:one', cursorToken: null }))
      .resolves.toEqual({ orders: [], nextCursor: null });
    expect(listOwned).toHaveBeenCalledWith({
      ownerProfileId: 'customer_profile:one',
      cursor: null,
      limit: CUSTOMER_ORDER_LIST_PAGE_SIZE,
    });
  });
});
