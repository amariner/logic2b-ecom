# Tema STRETCH — ficha de entrega

- **Dirección visual:** skincare contemporáneo de fondo crema, hero dividido a pantalla completa, vídeo y tipografía editorial de gran escala.
- **Referencia interna:** `public/images/referencias/13-stretch.webp`, derivada del briefing visual entregado.
- **Colección:** `src/collections/stretch.ts`.
- **Demo estática:** `src/collections/stretch-products.ts`, independiente de D1 y del panel.
- **Catálogo:** 7 productos; portada, fichas, carrito, checkout y confirmación navegables.
- **Imaginería:** 5 imágenes locales optimizadas a JPEG y 6 vídeos servidos desde los recursos originales del briefing.

## Componentes propios

- `src/components/themes/stretch/Catalog.astro`: hero audiovisual, navegación responsive, slider, pestañas y carrusel horizontal.
- `src/components/themes/stretch/ProductDetail.astro`: ficha visual de producto.
- `src/pages/demo/tiendas/stretch/`: recorrido visual completo, solo local.

## Verificación

- `pnpm check`.
- Capturas desktop, móvil y ficha mediante `scripts/capture-screens.mjs --only=stretch`.
- Productos enlazados y carrito local bajo la clave `stretch-demo-cart`.
