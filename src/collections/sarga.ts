/** Colección `sarga` — sastrería contemporánea femenina SARGA. */
import type { CollectionConfig } from './types';

export const sargaCollection: CollectionConfig = {
  id: 'sarga',
  themeId: 'sarga',

  name: 'SARGA',
  tagline: 'Sastrería que cambia la proporción.',
  description:
    'SARGA reúne blazers, pantalones y chalecos de líneas amplias en una colección de sastrería contemporánea construida para combinarse.',
  categories: [
    { id: 'sar-chaquetas', label: 'Chaquetas' },
    { id: 'sar-pantalones', label: 'Pantalones' },
    { id: 'sar-chalecos', label: 'Chalecos' },
  ],
};
