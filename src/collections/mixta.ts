/** Colección MIXTA — cuidado facial y corporal para combinar. */
import type { CollectionConfig } from './types';

export const mixtaCollection: CollectionConfig = {
  id: 'mixta',
  themeId: 'mixta',

  name: 'MIXTA',
  tagline: 'Cuidado que se mezcla contigo.',
  description: 'Fórmulas faciales y corporales para construir un ritual propio, sencillo y agradable cada día.',

  categories: [
    { id: 'mix-rostro', label: 'Rostro' },
    { id: 'mix-cuerpo', label: 'Cuerpo' },
  ],
};
