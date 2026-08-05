/**
 * Navegación de las páginas comerciales (landing, temas, arquitectura,
 * dossier, confirmación).
 *
 * Vive en un módulo y no en cada página porque antes eran cuatro listas
 * distintas: `/temas` no enlazaba al dossier y los anclas iban a veces a
 * `#precios` y a veces a `/#precios` (roto desde cualquier página que no fuera
 * la portada). Los precios viven ahora en una página propia para no interrumpir
 * la landing con tablas y condiciones. Una sola lista = un solo menú.
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
  { href: '/precios', label: 'Precios' },
  { href: '/dossier', label: 'Dossier' },
] as const;

/** Escaparate principal de la demo comercial. */
export const MAIN_DEMO_HREF = '/demo/tiendas/arce';
export const MAIN_DEMO_NAME = 'ARCE';

/** El panel del comercio dentro de la demo. */
export const DEMO_ADMIN_HREF = '/demo/admin';

/**
 * Menú del pie, compartido por TODAS las páginas comerciales (SiteFooter).
 * Antes había cinco pies distintos con etiquetas dispares («Temas», «Estilos»,
 * «Otros temas»…) y listas diferentes según la página. Una sola lista = un
 * solo pie. Aquí sí entran la demo y el panel: el pie es el mapa del sitio,
 * no compite con las entradas que venden.
 */
export const footerNav = [
  { href: '/', label: 'Inicio' },
  ...landingNav,
  { href: MAIN_DEMO_HREF, label: 'Demo de tienda' },
  { href: DEMO_ADMIN_HREF, label: 'Panel demo' },
] as const;
