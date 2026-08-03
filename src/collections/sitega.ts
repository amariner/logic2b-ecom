/** Colección visual de Sitēga, sanitarios y grifería contemporánea. */
import type { CollectionConfig } from './types';

export const sitegaCollection: CollectionConfig = {
  id: 'sitega',
  themeId: 'sitega',

  name: 'Sitēga',
  tagline: 'Soluciones contemporáneas para el baño',
  description: 'Sanitarios y grifería contemporánea: formas serenas, materiales honestos y atención precisa a los detalles.',

  categories: [
    { id: 'sit-umyvalniki', label: 'Lavabos' },
    { id: 'sit-smesiteli', label: 'Grifería' },
    { id: 'sit-kollekcii', label: 'Colecciones' },
  ],
};
