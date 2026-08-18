# Tema Sitēga — ficha de entrega

> Dirección editorial de sanitarios y grifería basada en la referencia Sitēga
> adjunta el 2026-08-03. La referencia guía la composición; las fotografías de
> producto son renders propios generados para esta demo.

- **Referencia:** `public/images/referencias/11-sitega.webp`
- **Colección:** `src/collections/sitega.ts` — Sitēga
- **Catálogo visual:** 8 productos del seed compartido, presentados por el
  mosaico propio de Sitēga.
- **Imaginería:** 8 renders de producto + hero en `public/images/collections/sitega/`
- **Composición:** hoja blanca sobre gris, wordmark tipográfico, titulares rusos,
  mosaico irregular, bloque de colecciones negro y footer oscuro.
- **Estado:** ready; catálogo y ficha conservan su dirección de arte, mientras
  las rutas dinámicas comunes sirven ficha, carrito, checkout y confirmación.
- **Persistencia:** `ecom-cart:sitega` en `localStorage`.
- **Backend:** el recorrido público no consulta D1 ni crea pedidos; comparte el
  motor y el banner común `Tema Sitēga` + `Gestor tienda`.

## Verificación

- ✅ `pnpm check`
- ✅ catálogo y miniatura desktop/móvil
- ✅ fichas enlazadas desde cada producto
- ✅ carrito, checkout y confirmación
- ✅ responsive y contraste revisados sobre superficies claras/oscuras

## Profesionalización

- Bloque: TH0.5 · 2026-08-18
- Problema inicial: catálogo de productos, cinco rutas, storage y schema
  duplicaban el contrato general.
- Cambios: fuente de producto y recorrido dinámicos comunes, slugs namespaceados
  y `ProductDetail` propio como presentación del `ProductPage` compartido.
- Evidencia: a11y 9/9 sin errores ni avisos; browser sin imágenes rotas ni
  overflow; cinco capturas regeneradas dentro de presupuesto.
- Deuda aceptada: consolidación transversal en TH0.6 y pulido individual en
  TH3.2, incluida la optimización de JPG heredados.
