/** Colección `litica` — cuidado mineral y objetos de ritual LÍTICA. */
import type { CollectionConfig } from './types';

export const liticaCollection: CollectionConfig = {
  id: 'litica',
  themeId: 'litica',

  name: 'LÍTICA',
  tagline: 'Materia esencial para la piel.',
  description:
    'LÍTICA reúne fórmulas de rostro, cuidado corporal y objetos de piedra en una colección mineral, honesta y sin ornamento.',
  categories: [
    { id: 'lit-face', label: 'Rostro' },
    { id: 'lit-body', label: 'Cuerpo' },
    { id: 'lit-objects', label: 'Objetos' },
  ],
};
