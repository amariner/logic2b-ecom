# Tema MONTE — ficha de entrega

> Marroquinería editorial basada en una ficha de producto vertical: nombre y
> número sobredimensionados, descripción técnica, dimensiones y materiales.

- **Referencia:** `public/images/referencias/29-monte.webp`.
- **Colección:** `src/collections/monte.ts` — MONTE.
- **Catálogo:** 3 acabados de la silueta Boston; slugs `mon-*`.
- **Imaginería:** 3 WebP propios optimizados en
  `public/images/collections/monte/`.

## Coste del tema

- Ficheros propios: `src/components/themes/monte/`, colección, seed, referencia
  y ficha.
- ¿Hizo falta rozar el motor?: **No**. Catálogo, ficha, cesta y checkout usan
  el recorrido compartido; el tema solo cambia presentación y fixtures.
- Dependencias, servicios o coste recurrente nuevos: **ninguno**.

## Decisiones visuales

- Fondo marfil, tinta casi negra, filetes finos y sans de sistema para preservar
  el ritmo de la referencia sin incorporar una fuente propietaria.
- Catálogo numerado con tres columnas en escritorio y una en móvil.
- Las dimensiones y el material reaparecen como bloque editorial; la ficha
  compartida conserva el detalle comercial, JSON-LD y controles accesibles.
- Movimiento limitado al zoom de imagen y anulado con `prefers-reduced-motion`.

## Verificación

- `pnpm check`: pendiente de gate conjunto de integración.
- Auditoría MONTE a 1440/375, claro/oscuro/reduced-motion: pendiente del servidor
  local conjunto.
- Referencia, imágenes y rutas revisadas; ningún copy se superpone a fotografía.
