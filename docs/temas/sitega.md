# Tema Sitēga — ficha de entrega

> Dirección editorial de sanitarios y grifería basada en la referencia Sitēga
> adjunta el 2026-08-03. La referencia guía la composición; las fotografías de
> producto son renders propios generados para esta demo.

- **Referencia:** `public/images/referencias/11-sitega.webp`
- **Colección:** `src/collections/sitega.ts` — Sitēga
- **Catálogo visual:** 8 productos en `src/collections/sitega-products.ts`
- **Imaginería:** 8 renders de producto + hero en `public/images/collections/sitega/`
- **Composición:** hoja blanca sobre gris, wordmark tipográfico, titulares rusos,
  mosaico irregular, bloque de colecciones negro y footer oscuro.
- **Estado:** ready; catálogo, ficha, carrito, checkout y confirmación demo
  funcionan con `sitega-demo-cart` en `localStorage`.
- **Backend:** no crea tablas ni productos visibles en el panel; comparte el
  motor y el banner común `Tema Sitēga` + `Gestor tienda`.

## Verificación

- ✅ `pnpm check`
- ✅ catálogo y miniatura desktop/móvil
- ✅ fichas enlazadas desde cada producto
- ✅ carrito, checkout y confirmación
- ✅ responsive y contraste revisados sobre superficies claras/oscuras
