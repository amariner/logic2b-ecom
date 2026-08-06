import { createOrderReaderService } from './application/order-reader';
import { createD1OrderReader } from './infrastructure/d1-order-reader';

export type { OrderDetail, OrderEvent, OrderItem, OrderListRow, OrderStatusCount } from './application/order-reader';
export const createOrderReader = (db: D1Database) => createOrderReaderService(createD1OrderReader(db));
