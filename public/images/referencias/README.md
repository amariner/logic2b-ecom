# Referencias visuales del catálogo de estilos

Cada fichero de esta carpeta es la **referencia de origen** de un tema de
`src/lib/demo-themes.ts`. El catálogo público (`/estilos`) las muestra junto a
la ficha de cada tema.

## Ficheros esperados

El campo `reference.file` de cada tema apunta aquí. Los nombres son contrato
(hay un test que valida el formato `NN-nombre.webp`):

| Fichero            | Tema         | Referencia de origen |
|--------------------|--------------|----------------------|
| `01-editorial.webp`| Editorial    | Teenage Engineering  |
| `02-industrial.webp`| Industrial  | TAGARNO              |
| `03-natural.webp`  | Natural      | All Natural / AFF    |
| `04-guide.webp`    | Guide        | Pour over            |
| `05-specs.webp`    | Specs        | ACF-01               |
| `06-minimal.webp`  | Minimal      | propro               |
| `07-launch.webp`   | Launch       | P1                   |

## ⚠️ Pendiente de subir

Las capturas se aportaron por chat y **no están en el repo todavía**. Hay que
guardarlas aquí con esos nombres exactos, en WebP y ~1200px de ancho:

```sh
cwebp -q 82 -resize 1200 0 captura.png -o public/images/referencias/01-editorial.webp
```

Hasta que existan, `/estilos` pinta un marcador de hueco en lugar de la imagen —
la página no se rompe, pero la ficha queda coja.

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

Por eso estas capturas **no se publican en la landing indexable como galería**:
viven en el catálogo interno de estilos como apoyo a la conversación comercial.
