# R6.8a — Lista de intención e identidad por SKU

Contrato puro para resolver cada fila de una lista estructurada contra un
snapshot completo de identidades de catálogo. La comparación del SKU es literal:
conserva mayúsculas, espacios extremos, ceros iniciales y composición Unicode.
No escoge la primera variante cuando hay varias coincidencias.

Cada fila conserva ID, posición, SKU y unidades. Dos filas de `KIT-A` con dos y
tres unidades siguen siendo dos filas. Los diagnósticos señalan SKU repetidos y
variantes distintas del mismo producto sin sumar, eliminar o corregir datos.
Una cantidad cero también se conserva: identificar una variante no acredita
que su cantidad sea comercialmente válida.

La salida distingue identidad resuelta, SKU no encontrado en ese corte y SKU
ambiguo. En el último caso informa cuántas identidades coinciden y no replica
listas de candidatos por cada fila. Catálogo e intención completos se validan
antes de comparar sus referencias y resolver, incluso si la lista está vacía.

El perfil admite hasta mil productos, cien variantes por producto y diez mil
variantes globales, además de cien filas. Cantidades y versiones son enteros
seguros; no hay total ni aritmética de agregado. Los errores estructurales quedan
redactados y separados de los diagnósticos por fila.

No incluye CSV, historial, precios, disponibilidad, reglas comerciales, permisos,
carrito o pedidos. Las referencias y versiones son metadatos declarados, sin
prueba de autenticidad ni persistencia. `companies` 1.11.0 registra B2B-008 como
parcial e instalada/inactiva, dependiente de B2B-002, sin superficies operativas.
La demostración visual de esta capacidad queda pendiente.

Verificación de fuentes del 2026-10-04:

- Check global correcto: 1.007 archivos sin diagnósticos, 269 suites y 4.033
  pruebas; build con 44 HTML, 44 formularios locales y cero crons.
- 63 pruebas del contrato, seis de arquitectura y 122 de registro/manifiesto/
  acceso, todas correctas.
- Revisión independiente sin P1/P2: 55.894 aserciones, 123 escenarios y 1.131
  filas, 194 casos de SKU y 60 entradas hostiles, además de límites máximos.
  Cero efectos, getters ejecutados o reloj implícito; las fechas usan entradas
  explícitas. No se suman estas métricas a las pruebas anteriores.
- Bundle público diagnóstico: 7.049 B / 2.566 gzip, sin imports externos ni
  runtime operativo. Incluye 1.183 B de constantes históricas; no es una medida
  del cliente Astro.
- Ocho grafos de navegador, 361 fuentes seleccionadas, 19 CSS y los 62 JS
  públicos idénticos a R6.7c. El Worker aumenta 294 B por los cambios exactos
  del registro; el manifest generado cambia aparte. No se afirma equivalencia
  completa del SSR.

Este corte no añade interfaz ni ejecuta Worker, HTTP, navegador o base de datos.
La interacción se hereda explícitamente de [R6.7c / PR #44](../r6-7c/README.md):
5.076 comprobaciones, 108 visitas, ocho superficies a11y sin hallazgos, ocho
capturas revisadas y E2E 200/200. Su hash fresco intacto de 143 tablas/353 filas
pertenece a esa ejecución anterior, no a una nueva prueba de R6.8a.

La comparación final de assets se registra en el [informe agregado](verification-report.json).
Sin despliegue, migración, proveedor, cron, pedido o mutación operativa.

Consejo: arquitectura ✓ · backend ✓ · fullstack ✓ · producto ✓ · frontend ✓ ·
UX/UI ✓ · SEO ✓.
