/**
 * Colección `natural` — ROMER (cosmética natural, DTC).
 *
 * Tienda del tema 03 · Natural (ref. All Natural / AFF): el DTC clásico bien
 * hecho — hero partido, filtros laterales y precios de oferta. PRESENTACIÓN, no
 * motor: identidad, copy y categorías del escaparate. Nada de aquí influye en
 * lo que se cobra, se envía o dice un email.
 */
import type { CollectionConfig } from './types';

export const naturalCollection: CollectionConfig = {
  id: 'natural',
  themeId: 'natural',

  name: 'Romer',
  tagline: 'Cosmética natural formulada en el Mediterráneo',
  description:
    'Rutinas cortas de rostro, cuerpo y cabello con fórmulas breves y trazables. Envases de 50 a 250 ml, sin perfume añadido y con envío desde nuestro obrador.',

  categories: [
    { id: 'nat-rostro', label: 'Rostro' },
    { id: 'nat-cuerpo', label: 'Cuerpo' },
    { id: 'nat-cabello', label: 'Cabello' },
    { id: 'nat-kits', label: 'Kits' },
  ],
};
