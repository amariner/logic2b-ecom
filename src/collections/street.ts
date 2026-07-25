/**
 * Colección `street` — ASFALTO (running y streetwear urbano).
 *
 * Tienda del tema 08 · Street (ref. Up There Athletics): revista de moda con
 * ticker, hero a sangre y rejilla densa. PRESENTACIÓN, no motor: identidad,
 * copy y categorías del escaparate. Nada de aquí influye en lo que se cobra,
 * se envía o dice un email.
 */
import type { CollectionConfig } from './types';

export const streetCollection: CollectionConfig = {
  id: 'street',
  themeId: 'street',

  name: 'ASFALTO',
  tagline: 'Ropa para correr la ciudad',
  description:
    'Calzado, prendas técnicas y complementos para correr en ciudad. Series cortas, materiales reciclados y envío en 48 horas.',

  categories: [
    { id: 'str-calzado', label: 'Calzado' },
    { id: 'str-prendas', label: 'Prendas' },
    { id: 'str-mallas', label: 'Mallas y shorts' },
    { id: 'str-complementos', label: 'Complementos' },
  ],
};
