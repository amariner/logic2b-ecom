export type OrderListRow = Readonly<{
  id: number;
  order_number: string;
  customer_name: string;
  email: string;
  total_cents: number;
  status: string;
  created_at: string;
}>;

export type OrderStatusCount = Readonly<{ status: string; n: number }>;

export type OrderDetail = Readonly<{
  id: number;
  order_number: string;
  email: string;
  customer_name: string;
  address_json: string;
  subtotal_cents: number;
  shipping_cents: number;
  total_cents: number;
  status: string;
  tracking_carrier: string | null;
  tracking_number: string | null;
  created_at: string;
}>;

export type OrderItem = Readonly<{ name_snapshot: string; unit_price_cents: number; qty: number }>;
export type OrderEvent = Readonly<{
  from_status: string | null;
  to_status: string;
  note: string | null;
  created_at: string;
}>;

export interface OrderReader {
  list(status: string | undefined, limit: number): Promise<readonly OrderListRow[]>;
  counts(): Promise<readonly OrderStatusCount[]>;
  detail(id: number): Promise<OrderDetail | null>;
  items(id: number): Promise<readonly OrderItem[]>;
  events(id: number): Promise<readonly OrderEvent[]>;
}

export function createOrderReaderService(reader: OrderReader) {
  return Object.freeze({
    async list(status: string | undefined, limit: number) {
      const [orders, counts] = await Promise.all([reader.list(status, limit), reader.counts()]);
      return Object.freeze({ orders, counts });
    },
    async detail(id: number) {
      const order = await reader.detail(id);
      if (!order) return null;
      const [items, events] = await Promise.all([reader.items(id), reader.events(id)]);
      return Object.freeze({ order, items, events });
    },
  });
}
