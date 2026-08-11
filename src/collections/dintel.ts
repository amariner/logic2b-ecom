/** Colección DINTEL — objetos escultóricos de madera y piedra. */
import type { CollectionConfig } from './types';

export const dintelCollection: CollectionConfig = {
  id: 'dintel',
  themeId: 'dintel',

  name: 'DINTEL',
  tagline: 'Objetos que sostienen el espacio.',
  description: 'Mobiliario escultórico de madera, piedra y luz. Colecciones cortas para interiores con presencia material.',

  categories: [
    { id: 'din-asientos', label: 'Asientos' },
    { id: 'din-mesas', label: 'Mesas' },
    { id: 'din-luz-objeto', label: 'Luz y objeto' },
    { id: 'din-almacenaje', label: 'Almacenaje' },
  ],
};
