/**
 * Generador de sentencias SQL de seed. Puro: devuelve strings.
 * Lo consumen: el script db:seed (local) y /api/demo/reset (Fase 3+).
 */

import { shopConfig } from '../shop.config.ts';
import { imageVariants } from './image-variants.ts';
import { seedProducts } from './products.ts';

function sqlString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

/** Sentencias que dejan la base en el estado demo inicial. Orden: hijos antes que padres. */
export function seedStatements(): string[] {
  const statements: string[] = [
    'DELETE FROM order_events',
    'DELETE FROM order_items',
    'DELETE FROM emails_outbox',
    'DELETE FROM orders',
    'DELETE FROM shipping_rates',
    'DELETE FROM products',
  ];

  const perCategory: Record<string, number> = {};
  for (const prod of seedProducts) {
    // Reparto round-robin de las variantes de foto dentro de cada categoría.
    const index = perCategory[prod.category] ?? 0;
    perCategory[prod.category] = index + 1;
    const variant = (index % (imageVariants[prod.category] ?? 1)) + 1;
    const suffix = variant === 1 ? '' : `-${variant}`;
    const image = `/images/products/${prod.category}${suffix}.webp`;
    statements.push(
      `INSERT INTO products (slug, name, description, price_cents, stock, image, category, active) VALUES (` +
        `${sqlString(prod.slug)}, ${sqlString(prod.name)}, ${sqlString(prod.description)}, ` +
        `${prod.price_cents}, ${prod.stock}, ${sqlString(image)}, ${sqlString(prod.category)}, 1)`,
    );
  }

  for (const rate of shopConfig.shipping.seedRates) {
    statements.push(
      `INSERT INTO shipping_rates (zone, label, price_cents, free_over_cents, active) VALUES (` +
        `${sqlString(rate.zone)}, ${sqlString(rate.label)}, ${rate.price_cents}, ` +
        `${rate.free_over_cents === null ? 'NULL' : rate.free_over_cents}, 1)`,
    );
  }

  return statements;
}
