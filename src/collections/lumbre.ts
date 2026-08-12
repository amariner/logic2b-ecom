/** Colección LUMBRE — iluminación escultórica de cerámica y piedra. */
import type { CollectionConfig } from './types';

export const lumbreCollection: CollectionConfig = {
  id: 'lumbre',
  themeId: 'lumbre',

  name: 'LUMBRE',
  tagline: 'Luz hecha materia.',
  description: 'Lámparas escultóricas de cerámica, piedra y metal, producidas en series cortas para espacios serenos.',

  categories: [
    { id: 'lum-sobremesa', label: 'Sobremesa' },
    { id: 'lum-ambiente', label: 'Ambiente' },
  ],
};
