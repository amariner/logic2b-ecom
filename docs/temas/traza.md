# Tema TRAZA — ficha de entrega

- **Cola:** `nuevos-temas/445a62400246953e06387477674110e4.jpg`
  (posición 11).
- **Referencia interna:** `public/images/referencias/24-traza.webp`.
- **Colección:** `src/collections/traza.ts` — identidad adoptada: **TRAZA**.
- **Catálogo:** 8 productos · slugs `tra-*` · luz, asiento, superficie y
  objeto.
- **Ruta:** `/demo/tiendas/traza`.
- **Estado:** listo; ocho assets propios, capturas y QA local cerrados.

## Lectura de la referencia

La captura original es un portfolio de arquitectura, no un ecommerce: cabecera
microscópica, título de proyecto a gran escala, hero panorámico y una retícula
de doce columnas que alterna imágenes, metadatos y grandes vacíos. TRAZA
traslada esa gramática a una tienda de objetos domésticos escultóricos sin
copiar estudio, proyectos, textos ni fotografías.

La mesa y el banco abren dos planos panorámicos; el resto alterna columnas a
izquierda y derecha. Categoría y orden se presentan como metadatos. En móvil,
la retícula se vuelve una secuencia vertical y conserva el aire, las etiquetas
y los controles táctiles. Ficha, carrito, checkout y confirmación siguen usando
el recorrido local compartido.

## Imaginería y proveedor efectivo

La prueba con `imagegen` integrado falló antes de generar por error de red. Se
aplicó el fallback Higgsfield autorizado para este carril. Los ocho assets se
generaron con **Product Photoshoot / GPT Image 2**, en llamadas individuales e
inspeccionadas antes de continuar. Consumo observado: **70,60 créditos**; saldo
388,32 → 317,72.

Sistema de prompt común: fotografía de producto cuadrada y fotorrealista,
interior mediterráneo silencioso, revoco mineral y piedra, luz difusa desde la
izquierda, sombra larga, paleta arena/taupe/carbón, materia táctil y abundante
espacio negativo; sin personas, props, texto, logos, UI ni marcas ajenas.
Variación específica y job final:

- `tra-lampara-arco.webp` — travertino, bronce y lino;
  `e4571ff8-ac24-427a-a8b8-053d32c594df`.
- `tra-sillon-cota.webp` — piel tabaco y roble;
  `8ab29c80-3594-4efb-b170-9255f6e2a8b9`.
- `tra-mesa-rasante.webp` — caliza apomazada;
  `1bd3673c-ff20-45d5-ba1a-4aa45a2301b0`.
- `tra-espejo-bisel.webp` — vidrio ahumado, acero y nogal;
  `14ca4da0-2414-484d-b23e-e4f2568d7530`.
- `tra-bandeja-veta.webp` — mármol marrón tallado;
  `c7d74bf4-d5e4-4c3f-9192-2d5697c02291`.
- `tra-jarron-caliza.webp` — gres arena estriado;
  `92650a0e-2201-4263-a6b1-7c6ed903f0c9`.
- `tra-cuenco-sombra.webp` — cerámica negra bruñida;
  `65de7f57-cfec-4638-89ce-b8c379d6325f`.
- `tra-banco-plinto.webp` — roble oscuro y lana taupe;
  `cbffd8e9-465c-4d3b-9370-431d24aff504`.

Los PNG 2048×2048 se revisaron por silueta, material, geometría y marcas, y
se optimizaron a WebP 1600×1600. El proyecto no depende del proveedor en
runtime.

## Coste del tema

- **Kit:** colección, seed, `Catalog`, `ProductGrid`, `Filters`, tokens,
  referencia, ficha y ocho assets.
- **Registros previstos:** colección, seed, vista, catálogo comercial,
  auditoría, capturas y rail de portada.
- **¿Hizo falta rozar el motor de comercio?: NO.**
- **Dependencias, migraciones o servicios nuevos en runtime:** NO.
- **Proveedor de imagen:** OpenAI integrado falló por red; fallback Higgsfield
  autorizado, 70,60 créditos.

## Verificación

- ✅ `pnpm check`: 58 suites, 372 tests, tipos y build.
- ✅ Catálogo y ficha revisados a 1440 y 375 px; responsive y
  reduced-motion.
- ✅ Filtros, búsqueda vacía y ocho productos con imágenes válidas.
- ✅ A11y: 0 errores / 0 avisos en 8 superficies.
- ✅ E2E global: aislamiento de demos, admin, backup y pagos en verde.
- ✅ Capturas: catálogo 129 KB, móvil 27 KB, ficha 23 KB y miniaturas
  26/99 KB.
- ✅ Producción: Worker `524724c0-ba13-4666-9eec-c77f44f126d7`; smoke 200
  en tienda, asset principal, portada y `/temas`.
- ✅ Lighthouse remoto (mediana de 3): portada y `/temas`, móvil y
  escritorio, **100/100/100/100**; LCP máximo 1,5 s, CLS 0 y TBT 0 ms.
