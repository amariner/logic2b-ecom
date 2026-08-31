// @ts-nocheck -- parser Node manual, no forma parte del runtime Workers.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { cleanText, parseCategoryLinks, parseProduct } from '../scripts/import-inlogem-catalog.mjs';

describe('adaptador manual Liderpapel', () => {
  it('deduplica enlaces públicos de categoría sin realizar red', () => {
    const html = '<a href="/PStores?s=7132&o=product_b2c&codProduct=92385&descProduct=demo">A</a><a href="/PStores?s=7132&o=product_b2c&codProduct=92385&descProduct=demo">B</a>';
    expect(parseCategoryLinks(html)).toEqual([{ code: '92385', url: 'https://www.liderpapel.com/PStores?s=7132&o=product_b2c&codProduct=92385&descProduct=demo' }]);
  });

  it('normaliza una fixture versionada con trazabilidad y logística', () => {
    const html = readFileSync(new URL('./fixtures/liderpapel-product.html', import.meta.url), 'utf8');
    const item = parseProduct(html, {
      code: '92385',
      url: 'https://www.liderpapel.com/PStores?o=product_b2c&codProduct=92385&descProduct=boligrafo-demo',
      category: { id: 'inl-escritura' },
      demoPriceCents: 599,
    });
    expect(item).toMatchObject({
      sourceCode: '92385', sourceReference: 'REF-001', brand: 'BIC', category: 'inl-escritura',
      stockSnapshot: 24, demoPriceCents: 599, ean: '8410000000001', recommendedQuantity: 10,
      saleUnit: '1 ud.', dimensionsMm: '150 x 12 x 12', weightGrams: '15',
    });
    expect(item.image).toBe('/images/proposals/inlogem/products/92385.webp');
    expect(cleanText('  Uno &amp; <b>dos</b>  ')).toBe('Uno & dos');
  });
});
