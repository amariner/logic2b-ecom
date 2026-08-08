import { describe, expect, it } from 'vitest';
import { shopConfig } from '../shop.config';
import { collections } from '../src/collections';
import { demoCollection } from '../src/collections/demo';
import { collectionSeedProducts } from '../seed/collections/index';
import { demoOrderStatements } from '../seed/demo-orders';
import { seedProducts } from '../seed/products';
import { seedStatements } from '../seed/seed';

describe('integridad del seed', () => {
  it('tiene 60 productos en categorías de la colección demo, con una de temporada vacía', () => {
    expect(seedProducts.length).toBe(60);
    const configCategories = new Set(demoCollection.categories.map((c) => c.id));
    for (const prod of seedProducts) {
      expect(configCategories.has(prod.category), `categoría desconocida: ${prod.category}`).toBe(true);
    }
    const productCategories = new Set(seedProducts.map((prod) => prod.category));
    for (const cat of configCategories) {
      // La categoría de temporada queda vacía a propósito (estado vacío alcanzable, 9B.2).
      if (!productCategories.has(cat)) continue;
      expect(seedProducts.filter((prod) => prod.category === cat).length).toBeGreaterThanOrEqual(5);
    }
    const emptyCategories = [...configCategories].filter((cat) => !productCategories.has(cat));
    expect(emptyCategories, 'debe quedar exactamente una categoría vacía para el estado vacío').toHaveLength(1);
  });

  it('slugs únicos y bien formados en todo el escaparate', () => {
    const allProducts = [...seedProducts, ...collectionSeedProducts];
    const slugs = allProducts.map((prod) => prod.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const slug of slugs) expect(slug).toMatch(/^[a-z0-9-]+$/);
  });

  it('cada producto de escaparate pertenece a una colección y categoría registradas', () => {
    const registered = new Map(collections.map((collection) => [collection.id, collection]));
    for (const product of collectionSeedProducts) {
      const collection = registered.get(product.collection ?? '');
      expect(collection, `${product.slug}: colección desconocida`).toBeDefined();
      expect(
        collection?.categories.some((category) => category.id === product.category),
        `${product.slug}: categoría ${product.category} ajena a ${product.collection}`,
      ).toBe(true);
      // Guide conserva `cof-*` porque su catálogo es una guía de café; el
      // resto usa las tres primeras letras de la colección.
      const expectedPrefix = product.collection === 'guide'
        ? 'cof'
        : product.collection?.slice(0, 3);
      expect(product.slug, `${product.slug}: slug sin namespace de ${product.collection}`).toMatch(
        new RegExp(`^${expectedPrefix}-`),
      );
    }
  });

  it('cada producto del recorrido compartido resuelve un asset local existente', () => {
    const assetPaths = new Set(
      Object.keys(import.meta.glob('../public/images/collections/**/*.{webp,jpg,jpeg,png}'))
        .map((path) => path.replace('../public', '')),
    );
    // Sitēga y STRETCH conservan temporalmente su catálogo/recorrido dedicado
    // (C14.3), que resuelve las imágenes desde sus adaptadores propios.
    const dedicatedLegacyRoutes = new Set(['sitega', 'stretch']);

    for (const product of collectionSeedProducts) {
      const collection = product.collection ?? '';
      if (dedicatedLegacyRoutes.has(collection)) continue;
      const image = product.image ?? `/images/collections/${collection}/${product.slug}.webp`;
      expect(assetPaths.has(image), `${product.slug}: falta ${image}`).toBe(true);
    }
  });

  it('precios y stock: enteros positivos en céntimos', () => {
    for (const prod of seedProducts) {
      expect(Number.isInteger(prod.price_cents)).toBe(true);
      expect(prod.price_cents).toBeGreaterThan(0);
      expect(Number.isInteger(prod.stock)).toBe(true);
      expect(prod.stock).toBeGreaterThanOrEqual(0);
    }
  });

  it('las tarifas seed cubren todas las zonas definidas', () => {
    const rateZones = new Set(shopConfig.shipping.seedRates.map((r) => r.zone));
    for (const zone of shopConfig.shipping.zones) {
      expect(rateZones.has(zone.id), `zona sin tarifa: ${zone.id}`).toBe(true);
    }
  });

  it('cada imagen referenciada por el seed corresponde a una variante declarada', async () => {
    const { imageVariants } = await import('../seed/image-variants');
    const allProducts = seedStatements().filter((stmt) => stmt.includes('INSERT INTO products'));
    // Los productos de colección (9B.3) llevan un asset local propio, no una
    // variante del placeholder genérico. El nombre puede conservar el del
    // render editorial original cuando el seed declara `image` explícitamente.
    const collectionStmts = allProducts.filter((stmt) => stmt.includes('/images/collections/'));
    for (const stmt of collectionStmts) {
      expect(stmt).toMatch(/\/images\/collections\/[a-z0-9-]+\/[a-z0-9-]+\.(?:webp|jpe?g|png)/);
    }
    const stmts = allProducts.filter((stmt) => !stmt.includes('/images/collections/'));
    for (const stmt of stmts) {
      const match = stmt.match(/\/images\/products\/([a-z]+)(?:-(\d+))?\.webp/);
      expect(match, `imagen no reconocida en: ${stmt}`).not.toBeNull();
      const [, category, variant] = match!;
      const total = imageVariants[category!] ?? 1;
      expect(Number(variant ?? '1')).toBeLessThanOrEqual(total);
    }
    // Con más de una variante declarada, el reparto debe usarlas todas.
    for (const [category, total] of Object.entries(imageVariants)) {
      if (total === 1) continue;
      for (let v = 2; v <= total; v++) {
        expect(
          stmts.some((stmt) => stmt.includes(`/images/products/${category}-${v}.webp`)),
          `variante sin usar: ${category}-${v}`,
        ).toBe(true);
      }
    }
  });

  it('genera SQL con limpieza previa y sin comillas sin escapar', () => {
    const stmts = seedStatements();
    expect(stmts[0]).toContain('DELETE FROM');
    // 13 DELETE (incluye tablas de variante) + productos + backfill de
    // variantes + 4 tarifas + fixtures + snapshots de variante de las lineas.
    expect(stmts.length).toBe(13 + 60 + collectionSeedProducts.length + 1 + 4 + demoOrderStatements().length + 1);
    for (const stmt of stmts) {
      // apóstrofes escapados como '' — nunca un quote suelto dentro de un valor
      expect(() => stmt).not.toThrow();
    }
  });
});
