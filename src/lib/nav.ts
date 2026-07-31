/**
 * Navegación de las páginas comerciales (landing, temas, arquitectura,
 * dossier, confirmación).
 *
 * Vive en un módulo y no en cada página porque antes eran cuatro listas
 * distintas: `/temas` no enlazaba al dossier y los anclas iban a veces a
 * `#precios` y a veces a `/#precios` (roto desde cualquier página que no fuera
 * la portada). Una sola lista = un solo menú.
 *
 * Rutas ABSOLUTAS siempre: el mismo menú se pinta desde `/` y desde
 * `/arquitectura`, así que `#precios` a secas no vale.
 *
 * El panel de la demo NO está aquí a propósito: se llega a él desde el flujo
 * del pedido y desde las tarjetas de «Míralo por dentro», que es donde tiene
 * contexto. En el menú competía con las entradas que sí venden.
 */
export const landingNav = [
  { href: '/arquitectura', label: 'Cómo funciona' },
  { href: '/temas', label: 'Temas' },
  { href: '/#precios', label: 'Precios' },
  { href: '/dossier', label: 'Dossier' },
] as const;

/** La demo transaccional completa: catálogo, carrito, pago y panel. */
export const MAIN_DEMO_HREF = '/demo/tienda';

/** El panel del comercio dentro de la demo. */
export const DEMO_ADMIN_HREF = '/demo/admin';
