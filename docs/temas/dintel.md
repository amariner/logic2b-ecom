# Tema DINTEL — ficha de entrega

- **Cola:** `nuevos-temas/4b7efb74f44f8df500b21c605b7ceff9.jpg` (posición 12).
- **Referencia interna:** `public/images/referencias/25-dintel.webp`.
- **Colección:** `src/collections/dintel.ts` — identidad adoptada: **DINTEL**.
- **Catálogo:** 8 objetos · slugs `din-*` · asientos, mesas, luz/objeto y almacenaje.
- **Ruta:** `/demo/tiendas/dintel`.

## Lectura de la referencia

La referencia es un catálogo de mobiliario monolítico: fondo negro, titular de
escala extrema, microtipografía funcional y objetos sobre luz gris cálida. Su
retícula no ordena todas las piezas igual: una silla inaugura el recorrido, una
mesa ocupa dos tercios, el banco y el aparador abren planos anchos, y los
objetos verticales recuperan aire. DINTEL conserva esa relación entre masa y
vacío sin reutilizar la marca, textos ni fotografías de origen.

## Imaginería y proveedor efectivo

Los ocho assets se generaron con **imagegen integrado de OpenAI**, una llamada
por objeto, y se inspeccionaron antes de optimizarlos a WebP. El sistema de
prompt fija fotografía editorial de estudio sobre gris cálido, luz de galería
difusa y sombra de contacto; evita personas, marcas, texto, UI y objetos
adicionales.

- `din-silla-arco.webp` — silla de roble ahumado con apoyos arqueados.
- `din-mesa-traves.webp` — mesa de travertino de dos apoyos desplazados.
- `din-banco-basalto.webp` — banco bajo de piedra volcánica.
- `din-sillon-plinto.webp` — sillón de nogal y lana umber.
- `din-lampara-brasa.webp` — lámpara de lino, bronce y travertino.
- `din-mesa-lateral-canto.webp` — mesa auxiliar de mármol verde oscuro.
- `din-espejo-umbral.webp` — espejo bronce con marco de nogal.
- `din-aparador-linde.webp` — aparador de fresno y bronce.

## Coste del tema

- **Kit:** colección, seed, `Catalog`, `ProductGrid`, `Filters`, tokens,
  referencia, ficha, registros y ocho assets propios.
- **¿Hizo falta rozar el motor de comercio?: NO.**
- **Dependencias, migraciones o servicios nuevos en runtime:** NO.
- **Proveedor de imagen:** imagegen integrado de OpenAI; assets finales WebP en
  `public/images/collections/dintel/`.

## Verificación

- ✅ `pnpm check`: tipos, tests y build en verde antes de las capturas.
- ⏳ Navegador, auditoría a11y y capturas: en curso en el cierre del tema.
