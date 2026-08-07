# Tema ARGENT. — ficha de entrega

- **Cola:** `nuevos-temas/04c4f5bf206ddf57efa95df81abcc674.jpg` (posición 1)
- **Referencia interna:** `public/images/referencias/14-argent.webp`
- **Colección:** `src/collections/argent.ts`
- **Catálogo:** 5 productos · slugs `arg-*`
- **Ruta:** `/demo/tiendas/argent`
- **Estado:** presentación implementada; assets OpenAI bloqueados por error de red

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

## Imaginería OpenAI/Codex

Modo requerido: herramienta integrada `imagegen`, con la captura como referencia
de composición. Ocho prompts independientes, ejecutados por parejas según
`docs/NUEVOS_TEMAS.md`. Invariantes comunes: fotografía o producto originales,
sin UI, logos ajenos, texto no solicitado, watermark ni fondos sucios.

El 2026-08-07 el endpoint integrado falló dos veces con `network error` antes de
producir el hero. La skill impide cambiar silenciosamente al CLI/API; por eso el
tema sigue `planned` y no se han creado sustitutos de menor fidelidad.

## Coste y verificación

- Ficheros de tema: `Catalog.astro`, `ProductGrid.astro`, `Filters.astro`
- Motor rozado: solo el registro compartido de vistas de catálogo
- `ProductDetail.astro`: eliminado; hereda la ficha común
- `pnpm check`: ✅ 307 Astro files, 276 tests y build en verde (2026-08-07)
- 1440 px, 375 px y modo oscuro: pendientes tras disponer de assets
- Estado público: `planned` hasta que existan y se revisen los ocho WebP
