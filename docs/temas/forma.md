# Tema Forma — ficha de entrega

Forma es un escaparate editorial de gafas: retratos, producto y oficio de taller.

- **Referencia:** `public/images/referencias/12-forma.webp`
- **Colección:** `src/collections/forma.ts`
- **Catálogo:** 6 productos demo derivados del seed y embebidos en la página
- **Imágenes:** renders GPT Image 2 de producto y campaña en `public/images/collections/forma/` (WebP desde 2026-09-26)
- **Flujo:** ficha → carrito local → cálculo local de envío → checkout visual → confirmación efímera
- **Backend:** desconectado; no crea pedidos, no descuenta stock y no envía emails

Los renders de producto, hero y taller se generaron con Higgsfield/GPT Image 2 y se guardaron en el repositorio para que el tema sea reproducible en local. Los componentes de Forma componen la simulación local común mediante slots y hooks `data-commerce-*`; no llaman a APIs de comercio.

## Profesionalización

- Bloque: TH3.3 (adelantado) · 2026-09-26 (encargo: temas destacados de la home)
- Audiencia / tarea principal: ópticas independientes y marcas de gafas; ver cómo queda una montura y elegirla.
- Problemas iniciales: P0 la ficha propia nunca se renderizaba (faltaba `customPresentation`) · P1 ~4,6 MB de JPG sin dimensiones (catálogo en blanco a 3,5 s) · P1 sin filtro, búsqueda ni cero resultados; solares duplicadas para rellenar · P1 colores fijos y TODO de tokens en el registro · P2 textos de 8–9 px y sin menú móvil · P2 «Clear 01» bajo un retrato con otra montura · P2 afirmaciones sin respaldo («ajuste incluido», «Desde 2018», «Hechas a mano»).
- Nota inicial: Producto 2/4 · UX 1/4 · UI 3/4 · Marketing 2/4 · Frontend 1/4 · SEO 3/4 · Rendimiento/a11y 1/4 · total 45/100
- Cambios realizados: ficha activada y rehecha (sin cabecera duplicada, tokens, retrato de campaña cuando la montura aparece puesta, columna fija) · 12 WebP con dimensiones (≈ 927 KB en total) y seed actualizado · modo filtrado con familias, búsqueda, orden, recuento y estado vacío · tokens del registro (sin TODO) y acentos propios como variables del tema; `commerce.css` sin hex · menú `<details>` móvil, textos ≥ 0,72 rem, objetivos de 44 px · pies de foto corregidos y copy sin promesas inventadas · retrato al hover en Black 02 y Clear 01, transición catálogo → ficha, titulares que se asientan, punto y foto de taller ligados al scroll, columnas de titular fijas como en la referencia.
- Contrato compartido tocado: no (ruta propia de Forma; solo se pasa `customPresentation`).
- Nota final: Producto 3/4 · UX 3/4 · UI 4/4 · Marketing 3/4 · Frontend 4/4 · SEO 3/4 · Rendimiento/a11y 4/4 · total 86/100
- Evidencia: `astro check` sin errores propios · Vitest 1260/1261 (el fallo es `architecture.test.ts` por borradores no versionados de `src/lib/tour`, ajenos) · build · E2E de aislamiento en verde · a11y 0/0 en 9 superficies · capturas regeneradas dentro de presupuesto · `audit:themes` regenerado y estable
- Deuda aceptada: `Filters.astro` y `ProductGrid.astro` del scaffold quedan sin uso y documentados como tal (P3, TH5.5).
