# Tema LUMBRE — ficha de entrega

- **Cola:** `nuevos-temas/5675ae523a7da5dc339cbf50c05e49f1.jpg` (posición 13).
- **Referencia interna:** `public/images/referencias/26-lumbre.webp`.
- **Colección:** `src/collections/lumbre.ts` — identidad adoptada: **LUMBRE**.
- **Catálogo:** 6 luminarias · slugs `lum-*` · sobremesa y ambiente.
- **Ruta:** `/demo/tiendas/lumbre`.

## Lectura de la referencia

La referencia combina una cabecera mínima, fotografía cálida a gran escala,
tipografía serif y filetes finos para presentar iluminación cerámica como una
revista de interiores. LUMBRE conserva ese ritmo mediante un hero mineral, dos
escenas domésticas, un bloque editorial de tacto y una rejilla comercial de
cuatro columnas, sin reutilizar la marca, los textos ni las fotografías de
origen.

## Imaginería y proveedor efectivo

`imagegen` integrado se intentó primero con la referencia adjunta, pero falló
por red sin producir un resultado. Se aplicó el fallback previsto por
`docs/NUEVOS_TEMAS.md`: **Higgsfield Product Photoshoot**, una generación por
llamada, inspección visual individual y optimización final a WebP.

- `hero-lumbre.webp` — lámpara mineral de gran escala y luz rasante.
- `editorial-mesa.webp` — Soma Terracota en una mesa de madera.
- `editorial-salon.webp` — escena de lectura con dos butacas.
- `editorial-tacto.webp` — detalle de mano regulando la luminaria.
- `lum-soma-terracota.webp` — cúpula rojiza y columna torneada.
- `lum-arco-caliza.webp` — silueta continua de piedra clara.
- `lum-estria-negra.webp` — base acanalada y cúpula negra.
- `lum-caliz-arena.webp` — cerámica arenada de pantalla abierta.
- `lum-alba-cruda.webp` — volumen blanco roto de unión continua.
- `lum-brasa-cobre.webp` — metal patinado y cerámica rojiza.

Los diez resultados son piezas ficticias, sin marcas, texto ni personas
identificables. La mano del bloque editorial se revisó expresamente antes de
aceptarla.

## Coste del tema

- **Kit:** colección, seed, `Catalog`, `ProductGrid`, `Filters`, tokens,
  referencia, ficha, registros, tres escenas y seis imágenes de producto.
- **¿Hizo falta rozar el motor de comercio?: NO.**
- **Dependencias, migraciones o servicios nuevos en runtime:** NO.
- **Proveedor efectivo:** Higgsfield Product Photoshoot.
- **Créditos consumidos:** 70,00 (244,72 → 174,72).

## Verificación

- ✅ Navegador real a 1440, 900, 560 y 375 px; catálogo, ficha, carrito y
  checkout con el tema activo.
- ✅ Contraste, jerarquía, foco, teclado y `prefers-reduced-motion` revisados.
  No se declara variante oscura: el contrato global retiró esas superficies.
- ✅ Auditoría a11y: 8 superficies, 0 errores y 0 avisos.
- ✅ Cinco salidas visuales verificadas; catálogo 132 KB, móvil 33 KB y ficha
  28 KB. La consolidación del 2026-08-18 recomprimió el WebP de catálogo sin
  regenerar la imagen ni perder sus gradientes y textura cerámica; ya queda por
  debajo del objetivo de 150 KB.
- ✅ `pnpm check`: 445 archivos sin diagnósticos, 65 suites/414 tests y build.
- ✅ E2E global: aislamiento de escaparates y panel read-only verificado.
- ✅ Lighthouse local rápido: a11y/SEO 100 en portada y `/temas`; rendimiento
  98–100, best practices 96 común a ambas páginas. No sustituye la mediana
  remota canónica.
