/**
 * Colección `demo` — La Botiga del Maestrat.
 *
 * Es la tienda GENÉRICA: la que está cableada al recorrido transaccional
 * completo (carrito → checkout → panel → emails) y la que se enseña en una
 * llamada de venta para demostrar el motor. Va con el tema Base a propósito:
 * aquí el argumento es la funcionalidad, no el estilo. El escaparate de estilos
 * son las otras colecciones.
 */
import type { CollectionConfig } from './types';

export const demoCollection: CollectionConfig = {
  id: 'demo',
  themeId: 'base',

  name: 'La Botiga del Maestrat',
  tagline: 'Productos de la tierra',
  description: 'Aceites, embutidos, mieles, vinos, conservas y quesos del Maestrat.',

  categories: [
    { id: 'aceites', label: 'Aceites de oliva' },
    { id: 'embutidos', label: 'Embutidos' },
    { id: 'mieles', label: 'Mieles' },
    { id: 'vinos', label: 'Vinos' },
    { id: 'conservas', label: 'Conservas' },
    { id: 'quesos', label: 'Quesos' },
  ],
};
