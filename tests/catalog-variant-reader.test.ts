import { describe, expect, it } from 'vitest';
import { seedStatements } from '../seed/seed';
import {
  CatalogInvariantError,
  CatalogShadowReadMismatchError,
  createCatalogEntry,
  createCatalogReader,
  createD1CatalogRepository,
  optionSignature,
  resolveCatalogReadMode,
  type ProductOptionSelection,
  type ProductVariant,
} from '../src/modules/catalog';
import { quoteCart, quoteRequestSchema } from '../src/lib/quote';
import { SqliteD1 } from './sqlite-d1';

const CREATED_AT = '2026-08-08 12:00:00';

function option(overrides: Partial<ProductOptionSelection> = {}): ProductOptionSelection {
  return {
    option_id: 10,
    option_name: 'Talla',
    option_position: 0,
    value_id: 11,
    value: 'M',
    value_position: 0,
    ...overrides,
  };
}

function variant(overrides: Partial<ProductVariant> = {}): ProductVariant {
  return {
    id: 100,
    product_id: 1,
    sku: 'SKU-DEFAULT',
    gtin: null,
    mpn: null,
    title: '',
    price_cents: 1200,
    compare_at_price_cents: null,
    status: 'active',
    is_default: true,
    option_signature: null,
    options: [],
    created_at: CREATED_AT,
    updated_at: CREATED_AT,
    ...overrides,
  };
}

function entry(variants: readonly ProductVariant[]) {
  return createCatalogEntry({
    product: {
      id: 1,
      slug: 'camiseta',
      name: 'Camiseta',
      description: 'Algodón',
      image: '/camiseta.webp',
      category: 'ropa',
      collection: 'demo',
      active: true,
      subtitle: null,
      specs_json: null,
      created_at: CREATED_AT,
    },
    variants,
    available_stock: 8,
  });
}

function insertSimpleProduct(db: SqliteD1, legacyPrice = 1000, variantPrice = legacyPrice): void {
  db.sqlite.prepare(`
    INSERT INTO products (
      id, slug, name, description, price_cents, stock, image, category,
      active, created_at, collection, subtitle, compare_at_price_cents, specs_json
    ) VALUES (1, 'camiseta', 'Camiseta', 'Algodón', ?, 8, '/camiseta.webp',
      'ropa', 1, ?, 'demo', NULL, NULL, NULL)
  `).run(legacyPrice, CREATED_AT);
  db.sqlite.prepare(`
    INSERT INTO product_variants (
      id, product_id, sku, title, price_cents, status, is_default,
      option_signature, created_at, updated_at
    ) VALUES (100, 1, 'SKU-DEFAULT', '', ?, 'active', 1, NULL, ?, ?)
  `).run(variantPrice, CREATED_AT, CREATED_AT);
}

describe('dominio producto-variante R2.3', () => {
  it('fija default, dinero, combinaciones y un agregado inmutable', () => {
    const tallaM = option();
    const aggregate = entry([
      variant(),
      variant({
        id: 101,
        sku: 'SKU-M',
        title: 'M',
        is_default: false,
        options: [tallaM],
        option_signature: optionSignature([tallaM]),
      }),
    ]);

    expect(aggregate.product.variants).toHaveLength(2);
    expect(aggregate.product.variants[1]?.option_signature).toBe('[11]');
    expect(Object.isFrozen(aggregate)).toBe(true);
    expect(Object.isFrozen(aggregate.product.variants)).toBe(true);
  });

  it('rechaza un default ausente y una firma que no representa sus opciones', () => {
    expect(() => entry([variant({ is_default: false })])).toThrow(CatalogInvariantError);
    expect(() => entry([
      variant(),
      variant({
        id: 101,
        sku: 'SKU-M',
        is_default: false,
        options: [option()],
        option_signature: '[999]',
      }),
    ])).toThrow(/option_signature/);
  });
});

describe('repositorio y rollout de lectura R2.3', () => {
  it('el repositorio canónico ensambla la variante y conserva stock como proyección separada', async () => {
    const db = new SqliteD1();
    insertSimpleProduct(db);

    const result = await createD1CatalogRepository(db.asD1()).findActive('demo', 'camiseta');

    expect(result?.product.variants[0]).toMatchObject({
      id: 100,
      product_id: 1,
      sku: 'SKU-DEFAULT',
      price_cents: 1000,
      is_default: true,
      status: 'active',
    });
    expect(result?.available_stock).toBe(8);
  });

  it('variant toma el precio vendible y shadow bloquea una divergencia legacy', async () => {
    const db = new SqliteD1();
    insertSimpleProduct(db, 1000, 1250);

    const legacy = await createCatalogReader(db.asD1(), 'legacy').findActive('demo', 'camiseta');
    const canonical = await createCatalogReader(db.asD1(), 'variant').findActive('demo', 'camiseta');

    expect(legacy?.price_cents).toBe(1000);
    expect(canonical?.price_cents).toBe(1250);
    await expect(createCatalogReader(db.asD1(), 'shadow').findActive('demo', 'camiseta'))
      .rejects.toBeInstanceOf(CatalogShadowReadMismatchError);
  });

  it('el shadow-read reconcilia todos los escaparates del seed v1 sin diferencias', async () => {
    const db = new SqliteD1();
    await db.batch(seedStatements().map((sql) => db.prepare(sql)));
    const reader = createCatalogReader(db.asD1(), 'shadow');
    const collections = db.query<{ collection: string }>(
      'SELECT DISTINCT collection FROM products ORDER BY collection',
    );

    for (const { collection } of collections) {
      const expected = Number(db.value(
        'SELECT count(*) AS value FROM products WHERE collection = ? AND active = 1',
        collection,
      ));
      await expect(reader.listActive(collection)).resolves.toHaveLength(expected);
    }

    const slugs = db.query<{ slug: string }>('SELECT slug FROM products WHERE active = 1 ORDER BY id')
      .map(({ slug }) => slug);
    await expect(reader.findActiveBySlugs(slugs)).resolves.toHaveLength(slugs.length);
  });

  it('la quote canónica decide el precio y elimina cualquier importe del payload cliente', async () => {
    const db = new SqliteD1();
    insertSimpleProduct(db, 1000, 1250);
    const parsed = quoteRequestSchema.parse({
      lines: [{ slug: 'camiseta', qty: 2, price_cents: 1 }],
    });

    expect(parsed.lines[0]).toEqual({ slug: 'camiseta', qty: 2 });
    const quote = await quoteCart(db.asD1(), parsed, { catalogReadMode: 'variant' });
    expect(quote.lines[0]?.unit_price_cents).toBe(1250);
    expect(quote.subtotal_cents).toBe(2500);
  });

  it('el flag es reversible y falla temprano ante configuración desconocida', () => {
    expect(resolveCatalogReadMode(undefined)).toBe('shadow');
    expect(resolveCatalogReadMode('legacy')).toBe('legacy');
    expect(resolveCatalogReadMode('variant')).toBe('variant');
    expect(() => resolveCatalogReadMode('automatic')).toThrow(/CATALOG_READ_MODE/);
  });
});
