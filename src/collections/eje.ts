/** Colección EJE — mobiliario para espacios colectivos. */
import type { CollectionConfig } from './types';

export const ejeCollection: CollectionConfig = {
  id: 'eje',
  themeId: 'eje',

  name: 'EJE',
  tagline: 'Estructuras para encontrarse.',
  description: 'Mobiliario contemporáneo para conversar, esperar y trabajar: piezas precisas que ordenan espacios colectivos sin volverlos rígidos.',

  categories: [
    { id: 'eje-asientos', label: 'Asientos' },
    { id: 'eje-mesas', label: 'Mesas' },
  ],
};
