/**
 * Colección `specs` — KALIBRE (componentes de relojería y micromecánica, B2B).
 *
 * Tienda del tema 05 · Specs (ref. ACF-01): la página entera es una HOJA DE
 * ESPECIFICACIONES. Es el único tema del escaparate donde el DATO manda sobre
 * la foto, y el vertical se eligió por eso: un recambio de calibre se compra por
 * peso, material y acabado, no por una imagen bonita. Las tres filas de spec de
 * la referencia son datos reales de D1 (`specs_json`), no adorno.
 *
 * PRESENTACIÓN, no motor: identidad, copy y categorías del escaparate. Nada de
 * aquí influye en lo que se cobra, se envía o dice un email.
 */
import type { CollectionConfig } from './types';

export const specsCollection: CollectionConfig = {
  id: 'specs',
  themeId: 'specs',

  name: 'Kalibre',
  tagline: 'Componentes de relojería mecánica y micromecánica de precisión',
  description:
    'Recambios sueltos para calibre manual y automático: platinas, puentes, órgano regulador, cajas y esferas. Cada pieza con su peso, material y acabado declarados.',

  categories: [
    { id: 'spe-platina', label: 'Platinas y puentes' },
    { id: 'spe-escape', label: 'Escape y rodaje' },
    { id: 'spe-caja', label: 'Caja y bisel' },
    { id: 'spe-esfera', label: 'Esfera y agujas' },
  ],
};
