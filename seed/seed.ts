/**
 * Generador de sentencias SQL de seed. Puro: devuelve strings.
 * Lo consumen: el script db:seed (local) y /api/demo/reset (Fase 3+).
 */

import { shopConfig } from '../shop.config.ts';
import { imageVariants } from './image-variants.ts';
import { seedProducts, type SeedProduct } from './products.ts';

function sqlString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

/** `NULL` literal o el string escapado. Para las capacidades opcionales. */
function sqlNullable(value: string | undefined): string {
  return value === undefined ? 'NULL' : sqlString(value);
}

/** Colección por defecto de un producto del seed que no la declare. */
const DEFAULT_COLLECTION = 'demo';

/**
 * El precio anterior tachado tiene que ser MAYOR que el que se cobra: si no, no
 * es una oferta, es un error de datos que la tienda enseñaría como descuento
 * negativo. SQLite no admite CHECK en ALTER TABLE, así que la invariante se
 * sostiene aquí (y en el PATCH del admin), con test.
 */
function assertCompareAtPrice(prod: SeedProduct): void {
  if (prod.compare_at_price_cents === undefined) return;
  if (!Number.isInteger(prod.compare_at_price_cents) || prod.compare_at_price_cents <= prod.price_cents) {
    throw new Error(
      `compare_at_price_cents de "${prod.slug}" debe ser un entero mayor que price_cents ` +
        `(${prod.compare_at_price_cents} vs ${prod.price_cents})`,
    );
  }
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
    assertCompareAtPrice(prod);
    const specsJson = prod.specs === undefined ? undefined : JSON.stringify(prod.specs);
    statements.push(
      `INSERT INTO products (slug, name, description, price_cents, stock, image, category, active, ` +
        `collection, subtitle, compare_at_price_cents, specs_json) VALUES (` +
        `${sqlString(prod.slug)}, ${sqlString(prod.name)}, ${sqlString(prod.description)}, ` +
        `${prod.price_cents}, ${prod.stock}, ${sqlString(image)}, ${sqlString(prod.category)}, 1, ` +
        `${sqlString(prod.collection ?? DEFAULT_COLLECTION)}, ${sqlNullable(prod.subtitle)}, ` +
        `${prod.compare_at_price_cents ?? 'NULL'}, ${sqlNullable(specsJson)})`,
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
