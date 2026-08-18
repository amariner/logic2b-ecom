/** Colección ENSAMBLE — mobiliario de autor entre madera y metal. */
import type { CollectionConfig } from './types';

export const ensambleCollection: CollectionConfig = {
  id: 'ensamble',
  themeId: 'ensamble',

  name: 'ENSAMBLE',
  tagline: 'Materia, proporción y silencio.',
  description: 'Mobiliario de autor en series cortas: madera maciza, metal plegado y uniones honestas para interiores serenos.',

  categories: [
    { id: 'ens-mesas', label: 'Mesas' },
    { id: 'ens-asientos', label: 'Asientos' },
  ],
};
