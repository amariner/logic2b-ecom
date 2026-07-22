/**
 * Colección `guide` — Cafetal (café de especialidad y equipo de cafetería).
 *
 * Tienda del tema 04 · Guide (ref. Pour over): 8 objetos simples de café de
 * filtro, ilustración de línea. PRESENTACIÓN, no motor.
 */
import type { CollectionConfig } from './types';

export const guideCollection: CollectionConfig = {
  id: 'guide',
  themeId: 'guide',

  name: 'Cafetal',
  tagline: 'Café de filtro, sin prisa',
  description:
    'Café de especialidad y el equipo básico para prepararlo en casa: dripper, molinillo, báscula y hervidor.',

  categories: [
    { id: 'cof-cafe', label: 'Café' },
    { id: 'cof-preparacion', label: 'Preparación' },
    { id: 'cof-servicio', label: 'Servicio' },
  ],
};
