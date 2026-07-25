/**
 * Colección `industrial` — METRIA (instrumentación de inspección y medida).
 *
 * Tienda del tema 02 · Industrial (ref. TAGARNO): catálogo técnico B2B, rejilla
 * de tabla y azul eléctrico. PRESENTACIÓN, no motor: identidad, copy y
 * categorías del escaparate. Nada de aquí influye en lo que se cobra, se envía
 * o dice un email.
 */
import type { CollectionConfig } from './types';

export const industrialCollection: CollectionConfig = {
  id: 'industrial',
  themeId: 'industrial',

  name: 'METRIA',
  tagline: 'Instrumentación de inspección para taller y laboratorio',
  description:
    'Microscopios digitales, soportes, iluminación y ópticas para control de calidad. Cada referencia con su especificación, stock a la vista y envío desde almacén propio.',

  categories: [
    { id: 'ind-vision', label: 'Visión e inspección' },
    { id: 'ind-soportes', label: 'Soportes y mesas' },
    { id: 'ind-iluminacion', label: 'Iluminación' },
    { id: 'ind-accesorios', label: 'Ópticas y accesorios' },
  ],
};
