# Tema EJE — ficha de entrega

> Estudio de mobiliario colaborativo: hero partido, producto aislado sobre
> gris-lila y tipografía sans monumental para ordenar espacios compartidos.

- **Referencia:** `public/images/referencias/31-eje.webp`.
- **Colección:** `src/collections/eje.ts` — EJE.
- **Catálogo:** 3 piezas; slugs `eje-*`.
- **Imaginería:** hero y tres WebP propios optimizados en
  `public/images/collections/eje/`.

## Coste del tema

- Ficheros propios: `src/components/themes/eje/`, colección, seed, referencia,
  cuatro imágenes y ficha.
- ¿Hizo falta rozar el motor?: **No**. Catálogo, ficha, cesta y checkout usan
  el recorrido compartido; el tema solo cambia presentación y fixtures.
- Dependencias, servicios o coste recurrente nuevos: **ninguno**.
- Generación: herramienta integrada `imagegen` de OpenAI, cuatro llamadas
  individuales con inspección y pausas de al menos ocho segundos. Higgsfield no
  se invocó y no se consumieron créditos de proveedores externos.

## Decisiones visuales

- La referencia se traduce a una composición propia: reunión cenital a la
  izquierda y statement desenfocado a la derecha, sin copiar marca, producto o
  texto del original.
- Las tres piezas comparten luz, fondo gris-lila y materiales sobrios. Cada
  producto conserva construcción plausible y una silueta claramente distinta.
- El bloque inferior es código nativo: diagrama orbital, palabras verticales y
  copy de gran escala, sin añadir otra imagen ni peso de red.
- En móvil el hero se apila y la selección se convierte en rail horizontal. El
  movimiento se limita al zoom de tarjeta y se anula con
  `prefers-reduced-motion`.

## Verificación

- `pnpm check`: 708 archivos sin diagnósticos, 163 suites/751 tests y build
  verdes; sitemap mantiene 6 URLs indexables.
- E2E completo de aislamiento de demos y panel verde.
- Auditoría EJE: 8 superficies a 1440/375/reduced-motion, 0 errores y 0 avisos.
- Capturas finales: catálogo 73 KB, móvil 35 KB y ficha 29 KB; variantes de
  galería 560/900 generadas y dentro del presupuesto.
- Revisión visual de catálogo, móvil y ficha completada; precios, nombres,
  categorías, imágenes y especificaciones proceden del seed compartido.
