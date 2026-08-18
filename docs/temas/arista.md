# Tema ARISTA — ficha de entrega

> Catálogo técnico de iluminación arquitectónica: espacio blanco, escala
> tipográfica extrema y una retícula asimétrica que convierte cada sistema en
> parte de la arquitectura.

- **Referencia:** `public/images/referencias/32-arista.webp`.
- **Colección:** `src/collections/arista.ts` — ARISTA.
- **Catálogo:** 4 sistemas; slugs `ari-*`.
- **Imaginería:** cuatro WebP propios optimizados en
  `public/images/collections/arista/`.

## Coste del tema

- Ficheros propios: `src/components/themes/arista/`, colección, seed,
  referencia, cuatro imágenes, capturas y ficha.
- ¿Hizo falta rozar el motor?: **No**. Catálogo, ficha, cesta y checkout usan
  el recorrido compartido; el tema solo cambia presentación y fixtures.
- D1, API, dependencia, servicio o coste recurrente nuevos: **ninguno**.
- Generación: herramienta integrada `imagegen` de OpenAI, cuatro llamadas
  individuales con inspección y pausas de al menos ocho segundos. Higgsfield no
  se invocó y no se consumieron créditos de proveedores externos.

## Decisiones visuales

- El gran rótulo «Perfiles», los vacíos y la numeración monumental trasladan
  la jerarquía de la referencia sin copiar marca, textos ni producto.
- La cuadrícula de doce columnas alterna formatos verticales, panorámicos y
  cuadrados. Las cuatro luminarias conservan una dirección fotográfica sobria:
  aluminio negro, superficies minerales y luz arquitectónica controlada.
- El filtro GET se pliega como una ficha técnica; categoría, búsqueda y orden
  siguen siendo contratos nativos del escaparate compartido.
- En móvil desaparecen los desplazamientos artificiales y la retícula alterna
  piezas a sangre y medias columnas. El zoom se anula con
  `prefers-reduced-motion`.

## Verificación

- `pnpm check`: 713 archivos sin diagnósticos, 163 suites/751 tests y build
  verdes; sitemap mantiene 6 URLs indexables.
- E2E completo de aislamiento de demos y panel verde.
- Auditoría ARISTA: 8 superficies a 1440/375/reduced-motion, 0 errores y 0
  avisos.
- Capturas finales: catálogo 36 KB, móvil 13 KB y ficha 21 KB; variantes de
  galería 560/900 de 10/25 KB y dentro del presupuesto.
- Revisión visual a 1440 y 375 px sin overflow; cuatro imágenes decodificadas,
  filtro por aplique operativo, ficha con cuatro especificaciones, cesta con
  badge y línea correctos, menú accesible y demo marcada `noindex,follow`.
- Producción: pendiente del deploy de cierre de este bloque.
