# Tema Arce — ficha de entrega

- **Dirección visual:** mobiliario cálido con portada editorial, hero dividido, catálogo por colecciones y ritmo de revista.
- **Referencia interna:** `public/images/referencias/14-arce.webp`, procedente del briefing aportado. Se ha trasladado su sistema visual, no su identidad, textos ni marca.
- **Colección:** `src/collections/arce.ts`.
- **Catálogo:** 8 productos en `seed/collections/arce.ts`; precios, stock, carrito y checkout usan el motor común.
- **Componentes:** `src/components/themes/arce/Catalog.astro` y `ProductDetail.astro`.
- **Imaginería:** nueve escenas y bodegones originales generados para el tema con GPT Image 2 en calidad 2K, bajo una dirección de arte cálida y minimalista inspirada en la referencia.
- **Motor:** no modificado.

## Profesionalización

- Bloque: TH1.1 + TH1.2 · 2026-09-26 (encargo: temas destacados de la home)
- Audiencia / tarea principal: hogar y estudios de interiorismo que buscan piezas de madera duraderas; recorrer la colección y decidir una pieza con información suficiente.
- Problemas iniciales: P1 filtrar dejaba una tarjeta y dos columnas vacías, sin estado de cero resultados · P1 envío gratis «desde 120 €» contradecía `shop.config` (50 €) y «Montaje incluido» / «Garantía de oficio» no estaban respaldados · P1 ficha genérica (redondeada, píldora azul) · P2 «Buscar», contador «01 / 04», journal y newsletter sin función; sin navegación bajo 1024 px · P2 «Añadir +» de ~15 px y destacados sin estado agotado · P3 recorte del hero en móvil.
- Nota inicial: Producto 3/4 · UX 2/4 · UI 3/4 · Marketing 2/4 · Frontend 2/4 · SEO 3/4 · Rendimiento/a11y 2/4 · total 60/100
- Cambios realizados: ficha propia `ProductDetail.astro` registrada en la ruta común (imagen fija, Fraunces, filetes, CTA cuadrado, «Completa el espacio» con otras familias) · modo filtrado/búsqueda con recuento y estado vacío, anclas `#productos` · copy de envío desde `shopConfig` y franja de confianza con hechos (materiales de las fichas, 24/48 h, 14 días, stock visible) · buscador visible, menú `<details>` móvil, journal enlazado a piezas reales, newsletter con confirmación local sin enviar datos · objetivos de 44 px · subrayados que crecen, transición de imagen catálogo → ficha (`view-transition-name`), deriva del hero y asentamiento de fotos ligados al scroll, carrusel de estudio con pausa.
- Contrato compartido tocado: sí, solo el registro `productPresentations` de `[collection]/[slug].astro` (patrón existente); ningún cambio en `ProductPage` ni en compra.
- Nota final: Producto 4/4 · UX 3/4 · UI 4/4 · Marketing 3/4 · Frontend 4/4 · SEO 3/4 · Rendimiento/a11y 4/4 · total 90/100
- Evidencia: `astro check` sin errores propios · Vitest 1260/1261 (el fallo es `architecture.test.ts` por borradores no versionados de `src/lib/tour`, ajenos) · build · E2E de aislamiento en verde · a11y 0 errores/0 avisos en 9 superficies · capturas regeneradas dentro de presupuesto · `audit:themes` regenerado y estable
- Deuda aceptada: la imagen de sala se repite en journal/estudio (P3, TH5.1 · imaginería nueva requiere encargo).
