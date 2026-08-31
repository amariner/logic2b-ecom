import rawCatalog from './catalog.json';
import type { ProposalCatalogItem } from '../types';

const categoryLabels: Readonly<Record<string, string>> = {
  'inl-escritura': 'Escritura',
  'inl-papel': 'Papel',
  'inl-archivo': 'Archivo',
  'inl-tecnologia': 'Tecnología',
  'inl-mobiliario': 'Mobiliario',
  'inl-embalaje': 'Embalaje',
  'inl-escolar': 'Escolar',
  'inl-servicios': 'Servicios generales',
};

export const inlogemCatalog = Object.freeze(
  (rawCatalog as ProposalCatalogItem[]).map((item) => ({
    ...item,
    categoryLabel: categoryLabels[item.category] ?? item.category,
  })),
);

export function inlogemCatalogItem(slug: string): ProposalCatalogItem | null {
  return inlogemCatalog.find((item) => item.slug === slug) ?? null;
}

export const inlogemBrands = Object.freeze(
  [...new Set(inlogemCatalog.map((item) => item.brand))].toSorted((a, b) => a.localeCompare(b, 'es')),
);
