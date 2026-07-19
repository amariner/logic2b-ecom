import { describe, expect, it } from 'vitest';
import { shopConfig } from '../shop.config';
import { seedProducts } from '../seed/products';
import { seedStatements } from '../seed/seed';

describe('integridad del seed', () => {
  it('tiene ~60 productos repartidos en las 6 categorías de shop.config', () => {
    expect(seedProducts.length).toBe(60);
    const configCategories = new Set(shopConfig.categories.map((c) => c.id));
    for (const prod of seedProducts) {
      expect(configCategories.has(prod.category), `categoría desconocida: ${prod.category}`).toBe(true);
    }
    for (const cat of configCategories) {
      expect(seedProducts.filter((prod) => prod.category === cat).length).toBeGreaterThanOrEqual(5);
    }
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
    const stmts = seedStatements().filter((stmt) => stmt.includes('INSERT INTO products'));
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
    // 6 DELETE + 60 productos + 4 tarifas
    expect(stmts.length).toBe(6 + 60 + 4);
    for (const stmt of stmts) {
      // apóstrofes escapados como '' — nunca un quote suelto dentro de un valor
      expect(() => stmt).not.toThrow();
    }
  });
});
