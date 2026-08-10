/** Colección `viso` — óptica futurista editorial VISO. */
import type { CollectionConfig } from './types';

export const visoCollection: CollectionConfig = {
  id: 'viso',
  themeId: 'viso',

  name: 'VISO',
  tagline: 'Otra forma de ver el presente.',
  description: 'VISO diseña gafas ligeras y precisas entre la óptica cotidiana y el objeto técnico.',
  categories: [
    { id: 'vis-shield', label: 'Pantalla' },
    { id: 'vis-optical', label: 'Óptica' },
    { id: 'vis-sport', label: 'Rendimiento' },
  ],
};
