/**
 * Colección `iris` — Iris (eyewear premium de rendimiento).
 *
 * Tema importado del proyecto logic2b-norte (spec propio «Orven», rebrandeado):
 * tienda cinematográfica con vídeo escrutado por scroll. PRESENTACIÓN, no motor.
 */
import type { CollectionConfig } from './types';

export const irisCollection: CollectionConfig = {
  id: 'iris',
  themeId: 'iris',

  name: 'Iris',
  tagline: 'Óptica de alto rendimiento',
  description:
    'Gafas técnicas de precisión: lentes polarizadas, monturas de titanio y fibra de carbono. Probadas para durar.',

  categories: [
    { id: 'iri-sol', label: 'Sol' },
    { id: 'iri-deporte', label: 'Deporte' },
  ],
};
