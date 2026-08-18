# Tema STRETCH — ficha de entrega

- **Dirección visual:** skincare contemporáneo de fondo crema, hero dividido a pantalla completa, vídeo y tipografía editorial de gran escala.
- **Referencia interna:** `public/images/referencias/13-stretch.webp`, derivada del briefing visual entregado.
- **Colección:** `src/collections/stretch.ts`.
- **Productos:** 7 entradas del seed compartido; el recorrido público sigue
  siendo independiente de D1 y del panel.
- **Catálogo:** portada y ficha propias; carrito, checkout y confirmación usan
  las rutas dinámicas comunes.
- **Imaginería:** 5 imágenes locales optimizadas a JPEG y 6 vídeos servidos desde los recursos originales del briefing.

## Componentes propios

- `src/components/themes/stretch/Catalog.astro`: hero audiovisual, navegación responsive, slider, pestañas y carrusel horizontal.
- `src/components/themes/stretch/ProductDetail.astro`: ficha visual de producto.
- `src/pages/demo/tiendas/[collection]/`: recorrido común, parametrizado por
  STRETCH sin un fork de rutas.

## Verificación

- `pnpm check`.
- Capturas desktop, móvil y ficha mediante `scripts/capture-screens.mjs --only=stretch`.
- Productos enlazados y carrito local bajo la clave `ecom-cart:stretch`.

## Profesionalización

- Bloque: TH0.5 · 2026-08-18
- Problema inicial: productos, cinco rutas, storage y schema privados.
- Cambios: seed y recorrido comercial comunes, slugs namespaceados y ficha
  STRETCH preservada mediante la presentación compartida de producto.
- Evidencia: a11y 9/9 sin errores ni avisos; flujo producto → cesta → envío →
  checkout → gracias verificado en browser; cinco capturas regeneradas.
- Rendimiento de evidencia: captura móvil 52 KB y escritorio 117 KB; el motor
  de captura acota la espera de fuentes e imágenes para no quedar bloqueado.
- Deuda aceptada: contrato transversal en TH0.6; pulido individual y formatos
  heredados en TH3.4.
