/**
 * Generador de sentencias SQL de seed. Puro: devuelve strings.
 * Lo consumen: el script db:seed (local) y /api/demo/reset (Fase 3+).
 */

import { shopConfig } from '../shop.config.ts';
import { collectionSeedProducts } from './collections/index.ts';
import { demoOrderStatements } from './demo-orders.ts';
import { imageVariants } from './image-variants.ts';
import {
  seedProducts,
  type SeedProduct,
  type SeedProductVariant,
} from './products.ts';

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

function variantStatus(prod: SeedProduct, variant: SeedProductVariant): 'draft' | 'active' | 'archived' {
  if (variant.status) return variant.status;
  if (variant.default) return (prod.active ?? 1) === 1 ? 'active' : 'archived';
  return 'draft';
}

/** Valida el formato v2 antes de emitir una sola sentencia parcial. */
function assertVariantSeed(prod: SeedProduct, knownSkus: Set<string>): void {
  const hasOptions = prod.options !== undefined;
  const hasVariants = prod.variants !== undefined;
  if (hasOptions !== hasVariants) {
    throw new Error(`"${prod.slug}": options y variants deben declararse juntos`);
  }
  if (!prod.options || !prod.variants) return;
  if (prod.options.length === 0 || prod.variants.length === 0) {
    throw new Error(`"${prod.slug}": el formato v2 exige opciones y variantes`);
  }

  const optionNames = new Set<string>();
  for (const option of prod.options) {
    const normalizedName = option.name.trim().toLocaleLowerCase('en');
    if (!normalizedName || optionNames.has(normalizedName)) {
      throw new Error(`"${prod.slug}": nombre de opción vacío o duplicado`);
    }
    optionNames.add(normalizedName);
    const values = option.values.map((value) => value.trim().toLocaleLowerCase('en'));
    if (values.length === 0 || values.some((value) => !value) || new Set(values).size !== values.length) {
      throw new Error(`"${prod.slug}": valores vacíos o duplicados en ${option.name}`);
    }
  }

  const defaults = prod.variants.filter((variant) => variant.default);
  if (defaults.length !== 1) throw new Error(`"${prod.slug}": debe existir una variante default`);
  const combinations = new Set<string>();
  for (const variant of prod.variants) {
    const sku = variant.sku.trim();
    const normalizedSku = sku.toLocaleLowerCase('en');
    if (!sku || sku.length > 100 || /^legacy-/i.test(sku) || knownSkus.has(normalizedSku)) {
      throw new Error(`"${prod.slug}": SKU vacío, reservado o duplicado (${variant.sku})`);
    }
    knownSkus.add(normalizedSku);
    if (!Number.isInteger(variant.price_cents) || variant.price_cents < 0) {
      throw new Error(`"${prod.slug}"/${sku}: price_cents inválido`);
    }
    if (
      variant.compare_at_price_cents !== undefined &&
      (!Number.isInteger(variant.compare_at_price_cents) || variant.compare_at_price_cents <= variant.price_cents)
    ) {
      throw new Error(`"${prod.slug}"/${sku}: compare_at_price_cents inválido`);
    }
    if (variant.gtin !== undefined && !/^\d{8,14}$/.test(variant.gtin)) {
      throw new Error(`"${prod.slug}"/${sku}: GTIN inválido`);
    }

    const combination = prod.options.map((option) => {
      const value = variant.values[option.name];
      if (value === undefined || !option.values.includes(value)) {
        throw new Error(`"${prod.slug}"/${sku}: valor inválido para ${option.name}`);
      }
      return `${option.name.toLocaleLowerCase('en')}=${value.toLocaleLowerCase('en')}`;
    }).join('|');
    if (Object.keys(variant.values).length !== prod.options.length || combinations.has(combination)) {
      throw new Error(`"${prod.slug}"/${sku}: combinación incompleta o duplicada`);
    }
    combinations.add(combination);
  }

  const defaultVariant = defaults[0]!;
  const defaultStatus = variantStatus(prod, defaultVariant);
  const expectedActive = defaultStatus === 'active' ? 1 : 0;
  if (
    defaultVariant.price_cents !== prod.price_cents ||
    (defaultVariant.compare_at_price_cents ?? null) !== (prod.compare_at_price_cents ?? null) ||
    expectedActive !== (prod.active ?? 1)
  ) {
    throw new Error(`"${prod.slug}": la variante default contradice los espejos legacy`);
  }
}

function productIdSql(slug: string): string {
  return `(SELECT id FROM products WHERE slug = ${sqlString(slug)})`;
}

function optionIdSql(slug: string, option: string): string {
  return `(SELECT po.id FROM product_options po JOIN products p ON p.id = po.product_id ` +
    `WHERE p.slug = ${sqlString(slug)} AND po.name = ${sqlString(option)})`;
}

function optionValueIdSql(slug: string, option: string, value: string): string {
  return `(SELECT pov.id FROM product_option_values pov ` +
    `JOIN product_options po ON po.id = pov.option_id ` +
    `JOIN products p ON p.id = po.product_id ` +
    `WHERE p.slug = ${sqlString(slug)} AND po.name = ${sqlString(option)} ` +
    `AND pov.value = ${sqlString(value)})`;
}

export function validateSeedProducts(products: readonly SeedProduct[]): void {
  const knownSkus = new Set<string>();
  for (const prod of products) {
    assertCompareAtPrice(prod);
    assertVariantSeed(prod, knownSkus);
  }
}

/** Sentencias que dejan la base en el estado demo inicial. Orden: hijos antes que padres. */
export function seedStatements(): string[] {
  const statements: string[] = [
    'DELETE FROM audit_log',
    'DELETE FROM event_outbox_deliveries',
    'DELETE FROM event_outbox_events',
    'DELETE FROM order_events',
    'DELETE FROM order_items',
    'DELETE FROM emails_outbox',
    'DELETE FROM orders',
    'DELETE FROM product_variant_option_values',
    'DELETE FROM product_option_values',
    'DELETE FROM product_options',
    'DELETE FROM product_variants',
    'DELETE FROM shipping_rates',
    'DELETE FROM products',
  ];

  const products = [...seedProducts, ...collectionSeedProducts];
  validateSeedProducts(products);

  const perCategory: Record<string, number> = {};
  for (const prod of products) {
    const collection = prod.collection ?? DEFAULT_COLLECTION;
    // Imagen: explícita > por-slug (colecciones) > placeholder por categoría
    // con reparto round-robin de variantes (tienda genérica).
    const index = perCategory[prod.category] ?? 0;
    perCategory[prod.category] = index + 1;
    const variant = (index % (imageVariants[prod.category] ?? 1)) + 1;
    const suffix = variant === 1 ? '' : `-${variant}`;
    const image =
      prod.image ??
      (collection === DEFAULT_COLLECTION
        ? `/images/products/${prod.category}${suffix}.webp`
        : `/images/collections/${collection}/${prod.slug}.webp`);
    const specsJson = prod.specs === undefined ? undefined : JSON.stringify(prod.specs);
    statements.push(
      `INSERT INTO products (slug, name, description, price_cents, stock, image, category, active, ` +
        `collection, subtitle, compare_at_price_cents, specs_json) VALUES (` +
        `${sqlString(prod.slug)}, ${sqlString(prod.name)}, ${sqlString(prod.description)}, ` +
        `${prod.price_cents}, ${prod.stock}, ${sqlString(image)}, ${sqlString(prod.category)}, ${prod.active ?? 1}, ` +
        `${sqlString(collection)}, ${sqlNullable(prod.subtitle)}, ` +
        `${prod.compare_at_price_cents ?? 'NULL'}, ${sqlNullable(specsJson)})`,
    );
  }

  // Compatibilidad R2.4: cada producto v1 materializa una variante simple. Los
  // productos v2 crean primero opciones/valores y después sus combinaciones.
  const explicitProducts = products.filter((prod) => prod.variants !== undefined);
  const explicitSlugs = explicitProducts.map((prod) => sqlString(prod.slug));
  statements.push(
    `INSERT INTO product_variants (` +
      `product_id, sku, title, price_cents, compare_at_price_cents, status, is_default, ` +
      `option_signature, created_at, updated_at` +
    `) SELECT id, 'LEGACY-' || id, '', price_cents, compare_at_price_cents, ` +
      `CASE active WHEN 1 THEN 'active' ELSE 'archived' END, 1, NULL, created_at, created_at ` +
    `FROM products ` +
      (explicitSlugs.length > 0 ? `WHERE slug NOT IN (${explicitSlugs.join(', ')}) ` : '') +
      `ORDER BY id`,
  );

  for (const prod of explicitProducts) {
    for (const [optionPosition, option] of prod.options!.entries()) {
      statements.push(
        `INSERT INTO product_options (product_id, name, position) VALUES (` +
          `${productIdSql(prod.slug)}, ${sqlString(option.name)}, ${optionPosition})`,
      );
      for (const [valuePosition, value] of option.values.entries()) {
        statements.push(
          `INSERT INTO product_option_values (option_id, value, position) VALUES (` +
            `${optionIdSql(prod.slug, option.name)}, ${sqlString(value)}, ${valuePosition})`,
        );
      }
    }

    for (const variant of prod.variants!) {
      const valueIds = prod.options!.map((option) =>
        optionValueIdSql(prod.slug, option.name, variant.values[option.name]!),
      );
      statements.push(
        `INSERT INTO product_variants (` +
          `product_id, sku, gtin, mpn, title, price_cents, compare_at_price_cents, ` +
          `status, is_default, option_signature` +
        `) VALUES (` +
          `${productIdSql(prod.slug)}, ${sqlString(variant.sku)}, ${sqlNullable(variant.gtin)}, ` +
          `${sqlNullable(variant.mpn)}, ${sqlString(variant.title)}, ${variant.price_cents}, ` +
          `${variant.compare_at_price_cents ?? 'NULL'}, ${sqlString(variantStatus(prod, variant))}, ` +
          `${variant.default ? 1 : 0}, json_array(${valueIds.join(', ')}))`,
      );
      for (const option of prod.options!) {
        statements.push(
          `INSERT INTO product_variant_option_values (` +
            `variant_id, product_id, option_id, option_value_id` +
          `) VALUES (` +
            `(SELECT id FROM product_variants WHERE sku = ${sqlString(variant.sku)}), ` +
            `${productIdSql(prod.slug)}, ${optionIdSql(prod.slug, option.name)}, ` +
            `${optionValueIdSql(prod.slug, option.name, variant.values[option.name]!)})`,
        );
      }
    }
  }

  for (const rate of shopConfig.shipping.seedRates) {
    statements.push(
      `INSERT INTO shipping_rates (zone, label, price_cents, free_over_cents, active) VALUES (` +
        `${sqlString(rate.zone)}, ${sqlString(rate.label)}, ${rate.price_cents}, ` +
        `${rate.free_over_cents === null ? 'NULL' : rate.free_over_cents}, 1)`,
    );
  }

  // Pedidos de la demo genérica (Fase 9B.2): backoffice sembrado con todas las
  // variantes. Van al final: sus subconsultas por slug / order_number necesitan
  // los productos y pedidos ya insertados en esta misma batch. SOLO DEMO — un
  // cliente real borra esta línea (ver seed/demo-orders.ts).
  statements.push(...demoOrderStatements());

  // Las fixtures legacy aun insertan order_items por product_id. Congelamos
  // tambien su variante default para que un reset no deshaga el backfill.
  statements.push(
    `UPDATE order_items SET ` +
      `variant_id = (SELECT pv.id FROM product_variants pv ` +
        `WHERE pv.product_id = order_items.product_id AND pv.is_default = 1), ` +
      `sku_snapshot = (SELECT pv.sku FROM product_variants pv ` +
        `WHERE pv.product_id = order_items.product_id AND pv.is_default = 1), ` +
      `product_name_snapshot = name_snapshot, variant_name_snapshot = NULL`,
  );

  return statements;
}
