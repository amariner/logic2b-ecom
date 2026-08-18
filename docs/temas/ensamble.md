# Tema ENSAMBLE — ficha de entrega

> Archivo editorial de mobiliario: fotografía analógica, grandes vacíos,
> microcopy técnico y una retícula asimétrica que trata cada objeto como ficha.

- **Referencia:** `public/images/referencias/30-ensamble.webp`.
- **Colección:** `src/collections/ensamble.ts` — ENSAMBLE.
- **Catálogo:** 3 piezas de madera y metal; slugs `ens-*`.
- **Imaginería:** tres WebP propios optimizados en
  `public/images/collections/ensamble/`.

## Coste del tema

- Ficheros propios: `src/components/themes/ensamble/`, colección, seed,
  referencia y ficha.
- ¿Hizo falta rozar el motor?: **No**. Catálogo, ficha, cesta y checkout usan
  el recorrido compartido; el tema solo cambia presentación y fixtures.
- Dependencias o coste recurrente nuevos: **ninguno**.
- Generación: herramienta integrada `imagegen` de OpenAI, tres llamadas
  individuales con inspección y pausas de al menos ocho segundos. Higgsfield no
  se invocó y no se consumieron créditos de proveedores externos.

## Decisiones visuales

- Georgia sustituye la serif propietaria; mono de sistema conserva el registro
  de archivo sin añadir fuentes ni dependencias.
- La ficha principal ocupa una retícula de doce columnas y las dos piezas
  siguientes se cruzan con vacíos, índices, dimensiones y precio.
- Blanco/tinta se resuelven con tokens semánticos para conservar oscuro; solo
  las cajas de fotografía usan el tono papel del tema.
- El movimiento se limita al zoom y cambio de saturación de las imágenes, con
  anulación completa en `prefers-reduced-motion`.

## Verificación

- `pnpm check`: 703 archivos sin diagnósticos, 163 suites/751 tests y build
  verdes; sitemap mantiene 6 URLs indexables.
- E2E completo verde; la demo conserva escaparates locales y panel de fixtures
  sin escrituras.
- Auditoría ENSAMBLE: 8 superficies a 1440/375/reduced-motion, 0 errores y 0
  avisos.
- Capturas finales: catálogo 77 KB, móvil 29 KB y ficha 35 KB; variantes de
  galería 560/900 generadas y dentro del presupuesto.
- Revisión visual de catálogo y ficha completada; índices, dimensiones y precios
  corresponden al producto aunque cambie el orden destacado.
