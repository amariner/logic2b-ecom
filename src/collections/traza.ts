/** Colección TRAZA · objetos domésticos de lenguaje arquitectónico. */
import type { CollectionConfig } from './types';

export const trazaCollection: CollectionConfig = {
  id: 'traza',
  themeId: 'traza',

  name: 'TRAZA',
  tagline: 'Objetos que hacen lugar.',
  description: 'Luz, asiento y materia para interiores serenos. Objetos domésticos dibujados desde la arquitectura.',
  categories: [
    { id: 'tra-luz', label: 'Luz' },
    { id: 'tra-asiento', label: 'Asiento' },
    { id: 'tra-superficie', label: 'Superficie' },
    { id: 'tra-objeto', label: 'Objeto' },
  ],
};
