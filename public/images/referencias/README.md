# Referencias visuales del catálogo de estilos

Cada fichero es la **referencia de origen** de un tema de
[`src/lib/demo-themes.ts`](../../../src/lib/demo-themes.ts). La lectura detallada
de cada una está en [`docs/TEMAS.md`](../../../docs/TEMAS.md) § 5.

## Ficheros

Los nombres son contrato (hay un test que valida el formato `NN-nombre.webp`):

| Fichero | Tema | Referencia | Original aportado |
|---|---|---|---|
| `01-editorial.webp` | Editorial | Teenage Engineering | `tienda de musica.jpg` |
| `02-industrial.webp` | Industrial | TAGARNO | `tienda de electronica.jpg` |
| `03-natural.webp` | Natural | All Natural / AFF | `tienda de cremas.jpg` |
| `04-guide.webp` | Guide | Pour over | `tienda cafe.jpg` |
| `05-specs.webp` | Specs | ACF-01 | `tienda de piezas.jpg` |
| `06-minimal.webp` | Minimal | propro | `tienda de muebles.jpg` |
| `07-launch.webp` | Launch | P1 | `tienda de motos.jpg` |
| `08-street.webp` | Street | Up There Athletics | `tienda ropa.jpg` |

Los `.jpg` originales se conservan junto a los `.webp` por si hace falta volver a
la fuente. Conversión usada:

```sh
cwebp -q 82 -resize 1200 0 "tienda de musica.jpg" -o 01-editorial.webp
```

## No confundir con `public/images/temas/`

Son dos cosas distintas y viven separadas a propósito:

| Carpeta | Qué es | Origen | ¿Se publica? |
|---|---|---|---|
| `referencias/` | Captura del **layout** de una tienda ajena | Aportada por Andreu | ❌ Interno |
| `temas/` | **Imaginería de producto propia** en la estética del tema | Generada con Higgsfield | ✅ Sí, en `/estilos` |

El catálogo público enseña `temas/`. Las referencias documentan de dónde sale
cada dirección, pero no se republican.

## Uso legítimo

Son **referencias de dirección visual**, no material a copiar. Lo que se toma es
el *sistema* (densidad, rejilla, ritmo tipográfico, tratamiento de tarjeta), no
los activos, la marca ni los textos de esas tiendas. Cada tema se implementa
sobre la base Logic2B UI y con catálogo e imaginería propios.

Por eso estas capturas **no se publican en la landing indexable**: viven en el
repo como apoyo de trabajo y de conversación comercial.
