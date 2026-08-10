/** Colección `orbe` — cuidado facial inclusivo de dirección editorial. */
import type { CollectionConfig } from './types';

export const orbeCollection: CollectionConfig = {
  id: 'orbe',
  themeId: 'orbe',

  name: 'ORBE',
  tagline: 'Cuidado formulado para cada piel.',
  description: 'Tratamientos faciales de textura precisa, activos esenciales y fórmulas pensadas para convivir con cada tono y cada ritmo de piel.',
  categories: [
    { id: 'orb-serums', label: 'Sérums' },
    { id: 'orb-oils', label: 'Aceites' },
    { id: 'orb-care', label: 'Cuidado diario' },
  ],
};
