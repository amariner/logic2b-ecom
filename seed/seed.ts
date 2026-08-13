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
  type SeedProductAttribute,
  type SeedProductMedia,
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

function sqlJson(value: unknown): string {
  return sqlString(JSON.stringify(value));
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

function assertMediaSeed(prod: SeedProduct): void {
  if (prod.media === undefined) return;
  if (prod.media.length === 0 || !prod.media.some((item) => item.kind === 'image')) {
    throw new Error(`"${prod.slug}": media debe contener al menos una imagen`);
  }
  const knownVariantSkus = new Set((prod.variants ?? []).map((variant) => variant.sku));
  for (const media of prod.media) {
    if (!media.source.trim() || media.source.length > 500 || !media.alt.trim() || media.alt.length > 240) {
      throw new Error(`"${prod.slug}": source o alt de media inválido`);
    }
    for (const focal of [media.focal_x_bps ?? 5000, media.focal_y_bps ?? 5000]) {
      if (!Number.isInteger(focal) || focal < 0 || focal > 10000) {
        throw new Error(`"${prod.slug}": foco de media fuera de 0..10000`);
      }
    }
    if ((media.variant_skus ?? []).some((sku) => !knownVariantSkus.has(sku))) {
      throw new Error(`"${prod.slug}": media asociada a una variante inexistente`);
    }
  }
}

function definitionSignature(attribute: SeedProductAttribute): string {
  return JSON.stringify({
    label: attribute.label,
    value_type: attribute.value_type,
    unit: attribute.unit ?? null,
    constraints: attribute.constraints ?? {},
  });
}

function assertAttributeValue(prod: SeedProduct, attribute: SeedProductAttribute): void {
  const { value } = attribute;
  const valid =
    (attribute.value_type === 'text' && typeof value === 'string' && value.length > 0 && value.length <= 5000) ||
    (attribute.value_type === 'reference' && typeof value === 'string' && value.trim().length > 0 && value.length <= 500) ||
    (attribute.value_type === 'number' && typeof value === 'number' && Number.isFinite(value)) ||
    (attribute.value_type === 'boolean' && typeof value === 'boolean') ||
    (attribute.value_type === 'list' && Array.isArray(value) && value.length > 0 && value.every((item) => typeof item === 'string' && item.length > 0));
  if (!valid) throw new Error(`"${prod.slug}": valor inválido para atributo ${attribute.code}`);
  if (attribute.unit !== undefined && attribute.value_type !== 'number') {
    throw new Error(`"${prod.slug}": solo un atributo numérico admite unidad`);
  }
  if (attribute.variant_sku && !(prod.variants ?? []).some((variant) => variant.sku === attribute.variant_sku)) {
    throw new Error(`"${prod.slug}": atributo asociado a una variante inexistente`);
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
  const definitions = new Map<string, string>();
  for (const prod of products) {
    assertCompareAtPrice(prod);
    assertVariantSeed(prod, knownSkus);
    assertMediaSeed(prod);
    const collection = prod.collection ?? DEFAULT_COLLECTION;
    const seenValues = new Set<string>();
    for (const attribute of prod.attributes ?? []) {
      if (!/^[a-z][a-z0-9_-]{0,79}$/.test(attribute.code) || !attribute.label.trim()) {
        throw new Error(`"${prod.slug}": código o etiqueta de atributo inválidos`);
      }
      assertAttributeValue(prod, attribute);
      const definitionKey = `${collection}\0${prod.category}\0${attribute.code.toLocaleLowerCase('en')}`;
      const signature = definitionSignature(attribute);
      const previous = definitions.get(definitionKey);
      if (previous !== undefined && previous !== signature) {
        throw new Error(`"${prod.slug}": definición contradictoria para ${attribute.code}`);
      }
      definitions.set(definitionKey, signature);
      const valueKey = `${attribute.variant_sku ?? 'product'}\0${attribute.code.toLocaleLowerCase('en')}`;
      if (seenValues.has(valueKey)) throw new Error(`"${prod.slug}": atributo duplicado en el mismo scope`);
      seenValues.add(valueKey);
    }
  }
}

function attributeDefinitionIdSql(collection: string, category: string, code: string): string {
  return `(SELECT id FROM attribute_definitions WHERE collection = ${sqlString(collection)} ` +
    `AND category = ${sqlString(category)} AND code = ${sqlString(code)})`;
}

function attributeValueSql(attribute: SeedProductAttribute): string {
  if (attribute.value_type === 'number') return `NULL, ${attribute.value}, NULL, NULL, NULL`;
  if (attribute.value_type === 'boolean') return `NULL, NULL, ${attribute.value ? 1 : 0}, NULL, NULL`;
  if (attribute.value_type === 'reference') return `NULL, NULL, NULL, ${sqlString(String(attribute.value))}, NULL`;
  if (attribute.value_type === 'list') return `NULL, NULL, NULL, NULL, ${sqlJson(attribute.value)}`;
  return `${sqlString(String(attribute.value))}, NULL, NULL, NULL, NULL`;
}

/** Sentencias que dejan la base en el estado demo inicial. Orden: hijos antes que padres. */
export function seedStatements(): string[] {
  const statements: string[] = [
    'DELETE FROM audit_log',
    'DELETE FROM event_outbox_deliveries',
    'DELETE FROM event_outbox_events',
    'DELETE FROM order_hold_events',
    'DELETE FROM order_holds',
    'DELETE FROM order_tag_events',
    'DELETE FROM order_tag_assignments',
    'DELETE FROM order_note_revisions',
    'DELETE FROM order_notes',
    'DELETE FROM order_tags',
    'DELETE FROM order_events',
    'DELETE FROM refund_items',
    'DELETE FROM refunds',
    'DELETE FROM payment_transactions',
    'DELETE FROM payments',
    'DELETE FROM fulfillment_items',
    'DELETE FROM fulfillments',
    'DELETE FROM order_items',
    'DELETE FROM inventory_reservation_balance_events',
    'DELETE FROM inventory_reservation_events',
    'DELETE FROM inventory_reservation_lines',
    'DELETE FROM inventory_reservations',
    'DELETE FROM inventory_movements',
    'DELETE FROM inventory_balances',
    'DELETE FROM emails_outbox',
    'DELETE FROM orders',
    'DELETE FROM product_attribute_values',
    'DELETE FROM product_variant_media',
    'DELETE FROM product_variant_option_values',
    'DELETE FROM product_option_values',
    'DELETE FROM product_options',
    'DELETE FROM product_variants',
    'DELETE FROM product_media',
    'DELETE FROM attribute_definitions',
    'DELETE FROM shipping_rates',
    'DELETE FROM products',
  ];

  const products = [...seedProducts, ...collectionSeedProducts];
  validateSeedProducts(products);

  const definitionPositions = new Map<string, number>();
  const scopePositions = new Map<string, number>();
  for (const prod of products) {
    const collection = prod.collection ?? DEFAULT_COLLECTION;
    const scope = `${collection}\0${prod.category}`;
    for (const attribute of prod.attributes ?? []) {
      const key = `${scope}\0${attribute.code.toLocaleLowerCase('en')}`;
      if (definitionPositions.has(key)) continue;
      const position = scopePositions.get(scope) ?? 0;
      scopePositions.set(scope, position + 1);
      definitionPositions.set(key, position);
      statements.push(
        `INSERT INTO attribute_definitions (` +
          `collection, category, code, label, value_type, unit, constraints_json, position, active` +
        `) VALUES (` +
          `${sqlString(collection)}, ${sqlString(prod.category)}, ${sqlString(attribute.code)}, ` +
          `${sqlString(attribute.label)}, ${sqlString(attribute.value_type)}, ${sqlNullable(attribute.unit)}, ` +
          `${sqlJson(attribute.constraints ?? {})}, ${position}, 1)`,
      );
    }
  }

  const perCategory: Record<string, number> = {};
  const mediaBySlug = new Map<string, readonly SeedProductMedia[]>();
  for (const prod of products) {
    const collection = prod.collection ?? DEFAULT_COLLECTION;
    // Imagen: explícita > por-slug (colecciones) > placeholder por categoría
    // con reparto round-robin de variantes (tienda genérica).
    const index = perCategory[prod.category] ?? 0;
    perCategory[prod.category] = index + 1;
    const variant = (index % (imageVariants[prod.category] ?? 1)) + 1;
    const suffix = variant === 1 ? '' : `-${variant}`;
    const fallbackImage =
      prod.image ??
      (collection === DEFAULT_COLLECTION
        ? `/images/products/${prod.category}${suffix}.webp`
        : `/images/collections/${collection}/${prod.slug}.webp`);
    const media = prod.media ?? [{ kind: 'image', source: fallbackImage, alt: prod.name } as const];
    const image = media.find((item) => item.kind === 'image')?.source ?? fallbackImage;
    mediaBySlug.set(prod.slug, media);
    const specsJson = prod.specs === undefined ? undefined : JSON.stringify(prod.specs);
    statements.push(
      `INSERT INTO products (slug, name, description, price_cents, stock, image, category, active, ` +
        `collection, subtitle, compare_at_price_cents, specs_json) VALUES (` +
        `${sqlString(prod.slug)}, ${sqlString(prod.name)}, ${sqlString(prod.description)}, ` +
        `${prod.price_cents}, ${prod.stock}, ${sqlString(image)}, ${sqlString(prod.category)}, ${prod.active ?? 1}, ` +
        `${sqlString(collection)}, ${sqlNullable(prod.subtitle)}, ` +
        `${prod.compare_at_price_cents ?? 'NULL'}, ${sqlNullable(specsJson)})`,
    );
    for (const [position, item] of media.entries()) {
      statements.push(
        `INSERT INTO product_media (` +
          `product_id, kind, source, alt_text, focal_x_bps, focal_y_bps, position` +
        `) VALUES (` +
          `${productIdSql(prod.slug)}, ${sqlString(item.kind)}, ${sqlString(item.source)}, ` +
          `${sqlString(item.alt)}, ${item.focal_x_bps ?? 5000}, ${item.focal_y_bps ?? 5000}, ${position})`,
      );
    }
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

  // R2.7: toda variante nace con su apertura, incluido stock cero. El stock
  // legacy se replica porque el seed histórico no distinguía pools.
  statements.push(
    `INSERT INTO inventory_balances (variant_id, on_hand, reserved, version, updated_at) ` +
      `SELECT pv.id, p.stock, 0, 1, datetime('now') FROM product_variants pv ` +
      `JOIN products p ON p.id = pv.product_id ORDER BY pv.id`,
    `INSERT INTO inventory_movements (` +
      `variant_id, delta, reason, balance_after, version_after, actor_kind, actor_id, ` +
      `reference_type, reference_id, idempotency_key, correlation_id, occurred_at, created_at` +
    `) SELECT b.variant_id, b.on_hand, 'legacy_opening_balance', b.on_hand, 1, ` +
      `'system', 'demo-seed', 'seed', 'demo', 'r2:inventory:opening:' || b.variant_id, ` +
      `'inventory:variant:' || b.variant_id, b.updated_at, b.updated_at ` +
      `FROM inventory_balances b ORDER BY b.variant_id`,
  );

  for (const prod of products) {
    const media = mediaBySlug.get(prod.slug) ?? [];
    for (const [position, item] of media.entries()) {
      for (const sku of item.variant_skus ?? []) {
        statements.push(
          `INSERT INTO product_variant_media (variant_id, product_id, media_id, position) VALUES (` +
            `(SELECT id FROM product_variants WHERE sku = ${sqlString(sku)}), ` +
            `${productIdSql(prod.slug)}, ` +
            `(SELECT pm.id FROM product_media pm JOIN products p ON p.id = pm.product_id ` +
              `WHERE p.slug = ${sqlString(prod.slug)} AND pm.position = ${position}), ` +
            `${position})`,
        );
      }
    }

    const collection = prod.collection ?? DEFAULT_COLLECTION;
    for (const attribute of prod.attributes ?? []) {
      const variantId = attribute.variant_sku
        ? `(SELECT id FROM product_variants WHERE sku = ${sqlString(attribute.variant_sku)})`
        : 'NULL';
      statements.push(
        `INSERT INTO product_attribute_values (` +
          `product_id, variant_id, attribute_definition_id, value_text, value_number, ` +
          `value_boolean, value_reference, value_list_json` +
        `) VALUES (` +
          `${productIdSql(prod.slug)}, ${variantId}, ` +
          `${attributeDefinitionIdSql(collection, prod.category, attribute.code)}, ` +
          `${attributeValueSql(attribute)})`,
      );
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

  // R3.2: colaboración ficticia visible en el panel público de solo lectura.
  statements.push(
    `INSERT INTO order_tags (slug, label, active, created_at, updated_at) VALUES ` +
      `('prioritario', 'Prioritario', 1, datetime('now'), datetime('now')), ` +
      `('mayorista', 'Mayorista', 1, datetime('now'), datetime('now')), ` +
      `('revisar-direccion', 'Revisar dirección', 1, datetime('now'), datetime('now'))`,
    `INSERT INTO order_tag_assignments (order_id, tag_id, actor_kind, actor_id, actor_label, created_at) VALUES ` +
      `((SELECT id FROM orders WHERE order_number = 'BM-DEMO-1003'), (SELECT id FROM order_tags WHERE slug = 'prioritario'), 'admin', 'demo-seed', 'Equipo demo', datetime('now', '-2 hours')), ` +
      `((SELECT id FROM orders WHERE order_number = 'BM-DEMO-1003'), (SELECT id FROM order_tags WHERE slug = 'revisar-direccion'), 'admin', 'demo-seed', 'Equipo demo', datetime('now', '-90 minutes')), ` +
      `((SELECT id FROM orders WHERE order_number = 'BM-DEMO-1006'), (SELECT id FROM order_tags WHERE slug = 'mayorista'), 'admin', 'demo-seed', 'Equipo demo', datetime('now', '-1 day'))`,
    `INSERT INTO order_notes (id, order_id, visibility, body, version, actor_kind, actor_id, actor_label, created_at, updated_at) VALUES ` +
      `('demo-note-1003-a', (SELECT id FROM orders WHERE order_number = 'BM-DEMO-1003'), 'internal', 'Confirmar el portal antes de preparar el envío.', 2, 'admin', 'demo-seed', 'Equipo demo', datetime('now', '-2 hours'), datetime('now', '-75 minutes')), ` +
      `('demo-note-1006-a', (SELECT id FROM orders WHERE order_number = 'BM-DEMO-1006'), 'customer', 'Entrega coordinada para el viernes por la mañana.', 1, 'admin', 'demo-seed', 'Equipo demo', datetime('now', '-1 day'), datetime('now', '-1 day'))`,
    `INSERT INTO order_note_revisions (id, note_id, order_id, version, visibility, body, actor_kind, actor_id, actor_label, created_at) VALUES ` +
      `('demo-note-1003-a:1', 'demo-note-1003-a', (SELECT id FROM orders WHERE order_number = 'BM-DEMO-1003'), 1, 'internal', 'Revisar la dirección antes de preparar el envío.', 'admin', 'demo-seed', 'Equipo demo', datetime('now', '-2 hours')), ` +
      `('demo-note-1003-a:2', 'demo-note-1003-a', (SELECT id FROM orders WHERE order_number = 'BM-DEMO-1003'), 2, 'internal', 'Confirmar el portal antes de preparar el envío.', 'admin', 'demo-seed', 'Equipo demo', datetime('now', '-75 minutes')), ` +
      `('demo-note-1006-a:1', 'demo-note-1006-a', (SELECT id FROM orders WHERE order_number = 'BM-DEMO-1006'), 1, 'customer', 'Entrega coordinada para el viernes por la mañana.', 'admin', 'demo-seed', 'Equipo demo', datetime('now', '-1 day'))`,
    `INSERT INTO order_tag_events (id, order_id, tag_id, action, tag_slug_snapshot, tag_label_snapshot, actor_kind, actor_id, actor_label, created_at) VALUES ` +
      `('demo-tag-event-1003-a', (SELECT id FROM orders WHERE order_number = 'BM-DEMO-1003'), (SELECT id FROM order_tags WHERE slug = 'prioritario'), 'assigned', 'prioritario', 'Prioritario', 'admin', 'demo-seed', 'Equipo demo', datetime('now', '-2 hours')), ` +
      `('demo-tag-event-1003-b', (SELECT id FROM orders WHERE order_number = 'BM-DEMO-1003'), (SELECT id FROM order_tags WHERE slug = 'revisar-direccion'), 'assigned', 'revisar-direccion', 'Revisar dirección', 'admin', 'demo-seed', 'Equipo demo', datetime('now', '-90 minutes')), ` +
      `('demo-tag-event-1006-a', (SELECT id FROM orders WHERE order_number = 'BM-DEMO-1006'), (SELECT id FROM order_tags WHERE slug = 'mayorista'), 'assigned', 'mayorista', 'Mayorista', 'admin', 'demo-seed', 'Equipo demo', datetime('now', '-1 day'))`,
  );

  // R3.4: una incidencia activa y otra resuelta demuestran varios estados sin
  // habilitar efectos en la muestra pública. El texto libre sigue en R3.2.
  statements.push(
    `INSERT INTO order_holds (
      id, order_id, status, source, reason_code, owner_kind, owner_id, owner_label,
      due_at, idempotency_key, version, created_at, updated_at, resolved_at, resolution_code
    ) VALUES
      ('demo-hold-1005', (SELECT id FROM orders WHERE order_number = 'BM-DEMO-1005'),
       'active', 'manual', 'address_issue', 'admin', 'operations', 'Operaciones',
       strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '+2 hours'), 'demo:hold:1005:address', 1,
       strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-45 minutes'),
       strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-45 minutes'), NULL, NULL),
      ('demo-hold-1006', (SELECT id FROM orders WHERE order_number = 'BM-DEMO-1006'),
       'resolved', 'automatic', 'inventory_issue', 'system', 'inventory-policy', 'Política de inventario',
       strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-20 hours'), 'demo:hold:1006:inventory', 2,
       strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-1 day'),
       strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-18 hours'),
       strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-18 hours'), 'cleared')`,
    `INSERT INTO order_hold_events (
      id, hold_id, order_id, event_type, hold_version, source, reason_code,
      owner_kind, owner_id, owner_label, resolution_code,
      actor_kind, actor_id, actor_label, created_at
    ) VALUES
      ('demo-hold-event-1005-a', 'demo-hold-1005',
       (SELECT id FROM orders WHERE order_number = 'BM-DEMO-1005'),
       'created', 1, 'manual', 'address_issue', 'admin', 'operations', 'Operaciones', NULL,
       'admin', 'demo-seed', 'Equipo demo', strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-45 minutes')),
      ('demo-hold-event-1006-a', 'demo-hold-1006',
       (SELECT id FROM orders WHERE order_number = 'BM-DEMO-1006'),
       'created', 1, 'automatic', 'inventory_issue', 'system', 'inventory-policy', 'Política de inventario', NULL,
       'system', 'demo-seed', 'Equipo demo', strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-1 day')),
      ('demo-hold-event-1006-b', 'demo-hold-1006',
       (SELECT id FROM orders WHERE order_number = 'BM-DEMO-1006'),
       'resolved', 2, NULL, NULL, NULL, NULL, NULL, 'cleared',
       'admin', 'demo-seed', 'Equipo demo', strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-18 hours'))`,
  );

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
