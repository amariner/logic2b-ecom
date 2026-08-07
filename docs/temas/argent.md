# Tema ARGENT. — ficha de entrega

- **Cola:** `nuevos-temas/04c4f5bf206ddf57efa95df81abcc674.jpg` (posición 1)
- **Referencia interna:** `public/images/referencias/14-argent.webp`
- **Colección:** `src/collections/argent.ts`
- **Catálogo:** 5 productos · slugs `arg-*`
- **Ruta:** `/demo/tiendas/argent`
- **Estado:** ✅ listo

## Lectura de la referencia

La imagen es un único screen de home (no un mockup de dispositivo):

1. hero fotográfico a sangre con header blanco superpuesto;
2. wordmark condensado centrado, navegación mínima y acciones a la derecha;
3. sección `Más vendidos` con cinco prendas aisladas sobre blanco;
4. badges verde/rojo, control circular en la esquina y copy diminuto centrado;
5. díptico de campañas verticales sin calle entre las imágenes.

La implementación conserva esas proporciones, el ritmo y el comportamiento.
En móvil, el carrusel de producto pasa a scroll-snap horizontal y las campañas
se apilan. `prefers-reduced-motion` retira el zoom de hover.

## Frontera del motor

No se tocó API, D1, precios, portes, checkout ni emails. Catálogo y carrito
siguen siendo la simulación local compartida. La ficha de producto hereda
`ProductPage` y los tokens de ARGENT.; no necesita una ruta paralela.

## Imaginería Higgsfield

El generador integrado de Codex falló dos veces por red. El usuario autorizó
expresamente Higgsfield el 2026-08-07. Se generaron ocho prompts independientes
en cuatro lotes secuenciales de dos, con pausa de ocho segundos entre lotes.

- Hero: Soul Cinematic, 2K, 16:9.
- Dos campañas: Product Photoshoot, `virtual_model_tryout`, 2:3.
- Cinco prendas: Product Photoshoot, `product_shot`, 3:4.
- Todos los finales: WebP de alta calidad dentro de la colección.

Cada zona se recortó de la referencia antes de generar. Esto fue necesario
porque el primer intento con la captura completa produjo una web dentro de la
imagen; ese resultado se descartó. Los productos finales están aislados sobre
blanco y las campañas usan personas ficticias, sin logos ni marcas de agua.

## Coste y verificación

- Ficheros de tema: `Catalog.astro`, `ProductGrid.astro`, `Filters.astro`
- Motor rozado: solo el registro compartido de vistas de catálogo
- `ProductDetail.astro`: eliminado; hereda la ficha común
- `pnpm check`: ✅ 307 Astro files, 276 tests y build en verde (2026-08-07)
- 1440 px y 375 px: assets y composición verificados
- Estado público: `ready`
