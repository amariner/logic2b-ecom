# Línea base automática de los 33 temas

> Generado por `node scripts/theme-baseline.mjs --write`. No editar las tablas a mano.

## Alcance y método

El informe cubre **33 escaparates** (Base y la colección transaccional `demo` quedan fuera). El análisis es estático y reproducible: compara registros versionados, rutas, fichas, capturas y assets sin arrancar Astro ni consultar D1.

- Assets: Suma de archivos bajo public/images/collections/<id>; techo de inventario, no transferencia de red.
- JavaScript: Contenido fuente de bloques <script> en componentes y rutas propias; no bundle ni gzip.
- Metadatos: se comprueba `noindex`, descripción, canonical y Product + Offer por composición de ruta.

## Resumen

- Registros canónicos: themes 33/33 · collections 33/33 · seeds 33/33 · catalogViews 33/33 · a11y 33/33 · captureCatalog 33/33 · captureProduct 33/33 · homeGallery 33/33 · docs 33/33 · components 33/33
- Contrato compartido completo: **33/33** · recorrido/storage privado: **0**.
- Evidencia completa (catálogo, móvil, ficha, 560 y 900): **33/33**.
- Inventario de assets: **33.62 MB** · JS propio crudo: **21.5 KB**.
- Hallazgos: **P0 0 · P1 0 · P2 2 · P3 1**.

## Hallazgos P0–P3

### P0

- Sin hallazgos.

### P1

- Sin hallazgos.

### P2

- **TH0.2-P2-02 · Directorio de assets por encima de 2,5 MB.** Temas: argent, forma, noddo, sitega. noddo: 2.61 MB · sitega: 3.84 MB · forma: 4.58 MB · argent: 3.75 MB Destino: TH0.3 · medir payload servido y priorizar optimización.

- **TH0.2-P2-03 · Assets raster/vídeo fuera del formato base.** Temas: forma, iris, noddo, sitega, stretch. iris: jpg×1, mp4×1, webp×6 · noddo: jpg×16, webp×12 · sitega: jpg×9 · forma: jpg×14 · stretch: jpg×5 Destino: TH0.3 · validar necesidad, compresión y carga real por viewport.

### P3

- **TH0.2-P3-01 · Muestra estática de fallback ausente.** Temas: alva, arce, argent, arista, brio, bruma, dintel, eje, ensamble, forma, iris, litica, lumbre, mixta, monte, nera, noddo, orbe, sarga, sillage, sitega, stretch, summit, traza, viso. La tarjeta de /temas funciona por captura viva, pero el fallback sample declarado no existe. Destino: TH5.2 · productización de /temas.

## Inventario por tema

| Tema | Registros | Ruta/contrato | SEO | Capturas | Productos | Assets | Fuente / JS |
|---|---:|---|---|---|---:|---:|---:|
| editorial | 10/10 | dynamic / común | N✓ C✓ J✓ | ✓✓✓✓✓ | 10 | 209.1 KB · webp×10 | 17.3 KB / 341 B |
| industrial | 10/10 | dynamic / común | N✓ C✓ J✓ | ✓✓✓✓✓ | 10 | 123.8 KB · webp×10 | 30.2 KB / 533 B |
| natural | 10/10 | dynamic / común | N✓ C✓ J✓ | ✓✓✓✓✓ | 12 | 122.3 KB · webp×13 | 35.2 KB / 524 B |
| guide | 10/10 | dynamic / común | N✓ C✓ J✓ | ✓✓✓✓✓ | 8 | 110.9 KB · webp×8 | 17.6 KB / 379 B |
| specs | 10/10 | dynamic / común | N✓ C✓ J✓ | ✓✓✓✓✓ | 9 | 147.6 KB · webp×9 | 32.0 KB / 518 B |
| minimal | 10/10 | dynamic / común | N✓ C✓ J✓ | ✓✓✓✓✓ | 8 | 113.4 KB · webp×8 | 15.9 KB / 0 B |
| arce | 10/10 | dynamic / común | N✓ C✓ J✓ | ✓✓✓✓✓ | 8 | 1017.2 KB · webp×9 | 21.4 KB / 759 B |
| launch | 10/10 | dynamic / común | N✓ C✓ J✓ | ✓✓✓✓✓ | 5 | 55.0 KB · webp×5 | 25.1 KB / 372 B |
| street | 10/10 | dynamic / común | N✓ C✓ J✓ | ✓✓✓✓✓ | 12 | 392.8 KB · webp×16 | 49.8 KB / 381 B |
| iris | 10/10 | dynamic / común | N✓ C✓ J✓ | ✓✓✓✓✓ | 6 | 1.79 MB · jpg×1 mp4×1 webp×6 | 26.4 KB / 5.1 KB |
| noddo | 10/10 | dynamic / común | N✓ C✓ J✓ | ✓✓✓✓✓ | 12 | 2.61 MB · jpg×16 webp×12 | 27.0 KB / 3.2 KB |
| sitega | 10/10 | dynamic / común | N✓ C✓ J✓ | ✓✓✓✓✓ | 8 | 3.84 MB · jpg×9 | 17.2 KB / 242 B |
| forma | 10/10 | custom / común | N✓ C✓ J✓ | ✓✓✓✓✓ | 6 | 4.58 MB · jpg×14 | 25.2 KB / 0 B |
| stretch | 10/10 | dynamic / común | N✓ C✓ J✓ | ✓✓✓✓✓ | 7 | 757.9 KB · jpg×5 | 22.6 KB / 3.4 KB |
| argent | 10/10 | dynamic / común | N✓ C✓ J✓ | ✓✓✓✓✓ | 5 | 3.75 MB · webp×8 | 20.2 KB / 390 B |
| sillage | 10/10 | dynamic / común | N✓ C✓ J✓ | ✓✓✓✓✓ | 8 | 495.5 KB · webp×14 | 20.5 KB / 393 B |
| summit | 10/10 | dynamic / común | N✓ C✓ J✓ | ✓✓✓✓✓ | 7 | 555.9 KB · webp×9 | 21.3 KB / 391 B |
| litica | 10/10 | dynamic / común | N✓ C✓ J✓ | ✓✓✓✓✓ | 6 | 525.6 KB · webp×10 | 24.0 KB / 391 B |
| nera | 10/10 | dynamic / común | N✓ C✓ J✓ | ✓✓✓✓✓ | 8 | 1.47 MB · webp×11 | 20.5 KB / 386 B |
| viso | 10/10 | dynamic / común | N✓ C✓ J✓ | ✓✓✓✓✓ | 6 | 1.19 MB · webp×9 | 16.0 KB / 365 B |
| orbe | 10/10 | dynamic / común | N✓ C✓ J✓ | ✓✓✓✓✓ | 6 | 1.22 MB · webp×9 | 18.7 KB / 391 B |
| alva | 10/10 | dynamic / común | N✓ C✓ J✓ | ✓✓✓✓✓ | 8 | 1002.6 KB · webp×12 | 20.1 KB / 391 B |
| brio | 10/10 | dynamic / común | N✓ C✓ J✓ | ✓✓✓✓✓ | 6 | 769.5 KB · webp×8 | 19.8 KB / 386 B |
| bruma | 10/10 | dynamic / común | N✓ C✓ J✓ | ✓✓✓✓✓ | 8 | 543.3 KB · webp×8 | 13.2 KB / 397 B |
| traza | 10/10 | dynamic / común | N✓ C✓ J✓ | ✓✓✓✓✓ | 8 | 2.00 MB · webp×8 | 13.4 KB / 397 B |
| dintel | 10/10 | dynamic / común | N✓ C✓ J✓ | ✓✓✓✓✓ | 8 | 416.6 KB · webp×8 | 17.8 KB / 399 B |
| lumbre | 10/10 | dynamic / común | N✓ C✓ J✓ | ✓✓✓✓✓ | 6 | 698.7 KB · webp×10 | 18.4 KB / 399 B |
| mixta | 10/10 | dynamic / común | N✓ C✓ J✓ | ✓✓✓✓✓ | 6 | 456.6 KB · webp×9 | 18.7 KB / 397 B |
| monte | 10/10 | dynamic / común | N✓ C✓ J✓ | ✓✓✓✓✓ | 3 | 618.6 KB · webp×3 | 14.1 KB / 0 B |
| sarga | 10/10 | dynamic / común | N✓ C✓ J✓ | ✓✓✓✓✓ | 4 | 1.32 MB · webp×8 | 19.9 KB / 388 B |
| ensamble | 10/10 | dynamic / común | N✓ C✓ J✓ | ✓✓✓✓✓ | 3 | 392.2 KB · webp×3 | 15.2 KB / 0 B |
| eje | 10/10 | dynamic / común | N✓ C✓ J✓ | ✓✓✓✓✓ | 3 | 304.8 KB · webp×4 | 15.7 KB / 0 B |
| arista | 10/10 | dynamic / común | N✓ C✓ J✓ | ✓✓✓✓✓ | 4 | 269.1 KB · webp×4 | 13.9 KB / 0 B |

Leyenda de SEO: N `noindex`, C canonical, J Product + Offer. Capturas: catálogo, móvil, ficha, tarjeta 560 y tarjeta 900, en ese orden.

## Divergencias entre registros

| Registro | Presentes | Faltan | Sobran |
|---|---:|---|---|
| themes | 33 | — | — |
| collections | 33 | — | — |
| seeds | 33 | — | — |
| catalogViews | 33 | — | — |
| a11y | 33 | — | — |
| captureCatalog | 33 | — | — |
| captureProduct | 33 | — | — |
| homeGallery | 33 | — | — |
| docs | 33 | — | — |
| components | 33 | — | — |

El detalle máquina-legible vive en `docs/audits/theme-baseline.json`.
