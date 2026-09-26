/**
 * NERA · segunda imagen REAL de una prenda, cuando existe en la campaña.
 *
 * Solo prendas que aparecen de verdad en una foto editorial propia; el resto
 * conserva una sola imagen. `position` encuadra la prenda dentro de la foto.
 */
export type NeraAlternate = { src: string; width: number; height: number; position: string };

export const neraAlternates: Readonly<Record<string, NeraAlternate>> = {
  'ner-blazer-negra': { src: '/images/collections/nera/hero-campaign.webp', width: 2048, height: 1152, position: '0% 40%' },
  'ner-blazer-azul': { src: '/images/collections/nera/hero-campaign.webp', width: 2048, height: 1152, position: '100% 40%' },
  'ner-chaleco-estructura': { src: '/images/collections/nera/editorial-tailoring.webp', width: 1536, height: 2048, position: 'center 22%' },
  'ner-jersey-gris': { src: '/images/collections/nera/editorial-knit.webp', width: 1536, height: 2048, position: 'center 30%' },
};
