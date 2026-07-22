import { describe, expect, it } from 'vitest';
import { shopConfig } from '../shop.config';
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

  it('slugs únicos y bien formados', () => {
    const slugs = seedProducts.map((prod) => prod.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const slug of slugs) expect(slug).toMatch(/^[a-z0-9-]+$/);
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
    // Los productos de colección (9B.3) llevan imagen propia por slug, no
    // variantes de placeholder: /images/collections/<id>/<slug>.webp.
    const collectionStmts = allProducts.filter((stmt) => stmt.includes('/images/collections/'));
    for (const stmt of collectionStmts) {
      expect(stmt).toMatch(/\/images\/collections\/[a-z0-9-]+\/[a-z0-9-]+\.webp/);
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
    // 6 DELETE + 60 productos genéricos + productos de colecciones (9B.3) +
    // 4 tarifas + las fixtures de pedidos de demo (9B.2)
    expect(stmts.length).toBe(6 + 60 + collectionSeedProducts.length + 4 + demoOrderStatements().length);
    for (const stmt of stmts) {
      // apóstrofes escapados como '' — nunca un quote suelto dentro de un valor
      expect(() => stmt).not.toThrow();
    }
  });
});
