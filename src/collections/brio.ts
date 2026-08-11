/** Colección `brio` — parches botánicos de bienestar urbano. */
import type { CollectionConfig } from './types';

export const brioCollection: CollectionConfig = {
  id: 'brio',
  themeId: 'brio',
  name: 'BRÍO',
  tagline: 'Botánica urbana, alivio en movimiento.',
  description: 'Parches botánicos de bienestar para acompañar descanso, movimiento y días intensos con una actitud clara y contemporánea.',
  categories: [
    { id: 'bri-movimiento', label: 'Movimiento' },
    { id: 'bri-descanso', label: 'Descanso' },
    { id: 'bri-dia-a-dia', label: 'Día a día' },
  ],
};
