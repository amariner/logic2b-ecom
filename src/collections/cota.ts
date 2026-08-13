/** Colección COTA — residencias contemporáneas de edición limitada. */
import type { CollectionConfig } from './types';

export const cotaCollection: CollectionConfig = {
  id: 'cota',
  themeId: 'cota',

  name: 'COTA',
  tagline: 'Arquitectura donde empieza el paisaje.',
  description: 'Residencias contemporáneas de edición limitada entre agua, tierra y ciudad.',

  categories: [
    { id: 'cot-agua', label: 'Agua' },
    { id: 'cot-tierra', label: 'Tierra' },
    { id: 'cot-ciudad', label: 'Ciudad' },
  ],
};
