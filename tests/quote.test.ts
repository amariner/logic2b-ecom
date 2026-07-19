import { describe, expect, it } from 'vitest';
import { aggregateLineQuantities } from '../src/lib/quote';

describe('aggregateLineQuantities', () => {
  it('suma qty de líneas repetidas del mismo slug', () => {
    const map = aggregateLineQuantities([
      { slug: 'aove-picual', qty: 2 },
      { slug: 'fuet', qty: 1 },
      { slug: 'aove-picual', qty: 3 },
    ]);
    expect(map.get('aove-picual')).toBe(5);
    expect(map.get('fuet')).toBe(1);
  });

  it('topa la suma a 99 aunque cada línea individual cumpla el máximo del schema (99)', () => {
    // Petición fabricada a mano: dos líneas del mismo slug, cada una válida por
    // separado (≤99), que sin este tope acumularían 198 unidades de un producto.
    const map = aggregateLineQuantities([
      { slug: 'aove-picual', qty: 99 },
      { slug: 'aove-picual', qty: 99 },
    ]);
    expect(map.get('aove-picual')).toBe(99);
  });
});
