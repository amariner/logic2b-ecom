/** Colección `bruma` — café de especialidad con dirección editorial serena. */
import type { CollectionConfig } from './types';

export const brumaCollection: CollectionConfig = {
  id: 'bruma',
  themeId: 'bruma',
  name: 'BRUMA',
  tagline: 'Café claro, días lentos.',
  description: 'Café de especialidad tostado en pequeños lotes, con orígenes transparentes y una tienda editorial de ritmo sereno.',
  categories: [
    { id: 'bru-origen', label: 'Origen único' },
    { id: 'bru-temporada', label: 'Temporada' },
    { id: 'bru-descafeinado', label: 'Descafeinado' },
    { id: 'bru-packs', label: 'Packs' },
  ],
};
