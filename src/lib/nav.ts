/**
 * Navegación de las páginas comerciales (landing, estilos, arquitectura,
 * dossier, confirmación).
 *
 * Vive en un módulo y no en cada página porque antes eran cuatro listas
 * distintas: `/estilos` no enlazaba al dossier, la landing no enlazaba al panel
 * y los anclas iban a veces a `#precios` y a veces a `/#precios` (roto desde
 * cualquier página que no fuera la portada). Una sola lista = un solo menú.
 *
 * Rutas ABSOLUTAS siempre: el mismo menú se pinta desde `/` y desde
 * `/arquitectura`, así que `#precios` a secas no vale.
 */
export const landingNav = [
  { href: '/arquitectura', label: 'Cómo funciona' },
  { href: '/estilos', label: 'Estilos' },
  { href: '/demo/admin', label: 'Panel demo' },
  { href: '/#precios', label: 'Precios' },
  { href: '/dossier', label: 'Dossier' },
] as const;

/** La demo transaccional completa: catálogo, carrito, pago y panel. */
export const MAIN_DEMO_HREF = '/demo/tienda';
