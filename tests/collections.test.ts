/**
 * Integridad del registro de COLECCIONES.
 *
 * La colección activa se resuelve desde la URL contra este registro. Lo que se
 * verifica aquí es que esa resolución no tenga escapes: un id desconocido no
 * puede caer a otra tienda, y una categoría de otra tienda no puede filtrar.
 */
import { describe, expect, it } from 'vitest';
import {
  allCategoryLabels,
  categoryLabel,
  collections,
  DEFAULT_COLLECTION_ID,
  defaultCollection,
  resolveCategory,
  resolveCollection,
} from '../src/lib/collections';
import { demoThemes } from '../src/lib/demo-themes';

describe('registro de colecciones', () => {
  it('no está vacío y los ids son únicos', () => {
    expect(collections.length).toBeGreaterThan(0);
    const ids = collections.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('cada colección apunta a un tema que existe', () => {
    const themeIds = new Set(demoThemes.map((t) => t.id));
    for (const collection of collections) {
      expect(themeIds.has(collection.themeId), `tema desconocido: ${collection.themeId}`).toBe(true);
    }
  });

  it('cada colección declara identidad y al menos una categoría', () => {
    for (const collection of collections) {
      expect(collection.name.length, `${collection.id} sin nombre`).toBeGreaterThan(0);
      expect(collection.categories.length, `${collection.id} sin categorías`).toBeGreaterThan(0);
      const catIds = collection.categories.map((c) => c.id);
      expect(new Set(catIds).size, `${collection.id} con categorías duplicadas`).toBe(catIds.length);
    }
  });

  it('la colección por defecto está registrada', () => {
    expect(resolveCollection(DEFAULT_COLLECTION_ID)).not.toBeNull();
    expect(defaultCollection().id).toBe(DEFAULT_COLLECTION_ID);
  });
});

describe('resolución desde la URL', () => {
  it('un id desconocido devuelve null — nunca cae a otra tienda', () => {
    expect(resolveCollection('no-existe')).toBeNull();
    expect(resolveCollection('')).toBeNull();
    expect(resolveCollection(undefined)).toBeNull();
  });

  it('resuelve un id registrado', () => {
    expect(resolveCollection(DEFAULT_COLLECTION_ID)?.id).toBe(DEFAULT_COLLECTION_ID);
  });
});

describe('validación de categoría contra su colección', () => {
  const collection = defaultCollection();
  const known = collection.categories[0]!.id;

  it('acepta una categoría de la propia colección', () => {
    expect(resolveCategory(collection, known)).toBe(known);
  });

  it('descarta una categoría ajena o vacía', () => {
    expect(resolveCategory(collection, 'categoria-de-otra-tienda')).toBeUndefined();
    expect(resolveCategory(collection, '')).toBeUndefined();
    expect(resolveCategory(collection, null)).toBeUndefined();
  });

  it('la etiqueta cae al id cuando la categoría no está declarada', () => {
    expect(categoryLabel(collection, known)).toBe(collection.categories[0]!.label);
    expect(categoryLabel(collection, 'desconocida')).toBe('desconocida');
  });

  it('el mapa del backoffice cubre las categorías de todas las colecciones', () => {
    const labels = allCategoryLabels();
    for (const c of collections) {
      for (const cat of c.categories) expect(labels.get(cat.id)).toBeDefined();
    }
  });
});
