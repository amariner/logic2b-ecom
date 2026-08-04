/** Colección visual Arce — mobiliario contemporáneo de madera y materia. */
import type { CollectionConfig } from './types';

export const arceCollection: CollectionConfig = {
  id: 'arce',
  themeId: 'arce',
  name: 'ARCE',
  tagline: 'Muebles para habitar despacio',
  description: 'Mobiliario contemporáneo en madera, tejido y metal: piezas serenas para una casa que se vive.',
  categories: [
    { id: 'arc-sillas', label: 'Sillas' },
    { id: 'arc-mesas', label: 'Mesas' },
    { id: 'arc-iluminacion', label: 'Iluminación' },
    { id: 'arc-accesorios', label: 'Accesorios' },
  ],
};
