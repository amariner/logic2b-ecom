import type {
  CustomerOrderListCursor,
  CustomerOrderListReadPage,
  CustomerOwnedOrderListReader,
} from './resource-ownership-ports';
import { customerResourceTarget } from '../domain/resource-ownership';

export const CUSTOMER_ORDER_LIST_PAGE_SIZE = 10;
const MAX_CURSOR_LENGTH = 512;

function encodeBase64Url(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
}

function decodeBase64Url(value: string): string {
  const base64 = value.replaceAll('-', '+').replaceAll('_', '/');
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
  const binary = atob(padded);
  return new TextDecoder('utf-8', { fatal: true }).decode(
    Uint8Array.from(binary, (character) => character.charCodeAt(0)),
  );
}

export function encodeCustomerOrderListCursor(cursor: CustomerOrderListCursor): string {
  return encodeBase64Url(JSON.stringify({ v: 1, t: cursor.createdAt, r: cursor.publicRef }));
}

export function decodeCustomerOrderListCursor(token: string | null): CustomerOrderListCursor | null {
  if (token === null || token.length === 0) return null;
  if (token.length > MAX_CURSOR_LENGTH) throw new RangeError('Cursor de pedidos inválido.');
  try {
    const value = JSON.parse(decodeBase64Url(token)) as Record<string, unknown>;
    if (Object.keys(value).toSorted().join(',') !== 'r,t,v' || value.v !== 1 ||
        typeof value.t !== 'string' || value.t.length > 64 ||
        !Number.isFinite(Date.parse(value.t)) || typeof value.r !== 'string') {
      throw new RangeError('Cursor de pedidos inválido.');
    }
    customerResourceTarget('order', value.r);
    return Object.freeze({ createdAt: value.t, publicRef: value.r });
  } catch {
    throw new RangeError('Cursor de pedidos inválido.');
  }
}

export function createCustomerOrderListService(reader: CustomerOwnedOrderListReader) {
  return Object.freeze({
    async list(input: Readonly<{
      ownerProfileId: string;
      cursorToken: string | null;
    }>): Promise<Readonly<{
      orders: CustomerOrderListReadPage['orders'];
      nextCursor: string | null;
    }>> {
      const cursor = decodeCustomerOrderListCursor(input.cursorToken);
      const page = await reader.listOwned({
        ownerProfileId: input.ownerProfileId,
        cursor,
        limit: CUSTOMER_ORDER_LIST_PAGE_SIZE,
      });
      return Object.freeze({
        orders: page.orders,
        nextCursor: page.nextCursor === null
          ? null
          : encodeCustomerOrderListCursor(page.nextCursor),
      });
    },
  });
}
