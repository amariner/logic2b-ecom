# Tema SUMMIT — ficha de entrega

- **Cola:** `nuevos-temas/6a1a7f42fded979ce23514a8bb5c3937.jpg` (posición 3)
- **Referencia interna:** `public/images/referencias/16-summit.webp`
- **Colección:** `src/collections/summit.ts` — identidad adoptada: **SUMMIT**
- **Catálogo:** 7 productos · slugs `sum-*` · abrigo, nieve y equipo
- **Ruta:** `/demo/tiendas/summit`
- **Estado:** listo; nueve assets finales únicos y tema incorporado al catálogo

## Lectura de la referencia

Tienda de lujo alpino con una campaña a sangre, navegación mínima sobre la
fotografía y producto aislado sobre blanco. La composición cambia de tres
columnas iguales a un mosaico inferior: cuatro tarjetas compactas ocupan la
mitad izquierda y una campaña vertical ocupa la mitad derecha. SUMMIT conserva
esa secuencia, proporciones, densidad, tipografía editorial y acento cobre sin
reutilizar marca, copy, prendas ni fotografías de la referencia.

En móvil el hero pasa a 82 svh, el header se reduce a wordmark y bolsa, la
campaña mantiene un recorte centrado y el catálogo cae a dos columnas; la pieza
vertical entra a ancho completo después de los cinco primeros productos.

## Imaginería y prompts finales

Los nueve assets se generaron con la herramienta `imagegen` integrada de
OpenAI/Codex, en llamadas individuales y sin usar CLI/API con facturación
separada. Los recortes de la captura se usaron solo como referencia de
composición para las dos campañas. Todos los resultados finales se limpiaron de
texto/marcas, se optimizaron a WebP y se inspeccionaron antes de integrarlos.

- `hero-boundaries.webp` — dos alpinistas ficticios con prendas negras y cinta
  cobre, avanzando junto a una cascada glaciar; fotografía editorial 16:9.
- `campaign-glacier.webp` — retrato vertical posterior de un alpinista con casco
  grafito, punto acanalado y arnés cobre ante un valle glaciar.
- `sum-shell-07.webp` — parka shell negra larga, capucha de tormenta y bolsillos
  angulares; producto aislado sobre blanco cálido.
- `sum-carbon-ski-set.webp` — dos esquís negros de carbono y dos bastones, con
  motivo topográfico cobre sin texto.
- `sum-bib-copper.webp` — pantalón de peto negro con rodillas articuladas y
  tirantes de cinta cobre.
- `sum-orbit-helmet.webp` — casco alpino grafito con ventilación funcional y una
  franja cobre asimétrica.
- `sum-downliner-02.webp` — chaqueta aislante negra de ripstop mate, vista frontal.
- `sum-ridge-halfzip.webp` — capa intermedia acanalada color umber con media
  cremallera y detalles negros.
- `sum-flask-750.webp` — botella de aluminio anodizado negro, banda cobre y
  tapón de acero cepillado.

## Coste del tema

- **Kit:** colección, seed, `Catalog`, `ProductGrid`, `Filters`, tokens, referencia,
  ficha y nueve assets finales.
- **Registros previstos:** colección, seed, vista de catálogo, filtros del
  catálogo comercial, auditoría, capturas y rail de la landing.
- **¿Hizo falta rozar el motor de comercio?: NO.**
- **Dependencias, migraciones o servicios nuevos:** NO.

## Verificación

- ☑ Build de producción en verde
- ☑ Nueve assets WebP únicos, optimizados e inspeccionados
- ☑ Escritorio 1440 px y móvil 390×844 revisados con capturas reales
- ☑ Añadir desde la tarjeta actualiza el badge y la tarjeta abre la ficha correcta
- ☑ Catálogo, ficha, carrito y checkout: 0 errores y 0 avisos en 9 superficies a11y
- ☑ Capturas de catálogo `560/900`, móvil y ficha dentro del objetivo de peso
- ☑ `pnpm check`: 333 archivos Astro, 308 tests y build en verde
