# R6.8b — Entrada CSV de una lista de ejemplo

Una función pura recibe texto y metadatos explícitos de una lista. Lee el perfil
cerrado `sku,quantity_units`, conserva el orden y solo construye la lista
estructurada cuando todas las filas son válidas. No consulta catálogo: que el
texto sea válido no implica que un SKU exista o identifique una sola variante.

Los errores de formato o límites descartan el resultado completo del escáner.
Cuando el texto se puede leer entero, los errores de cabecera, columnas o campos
conservan los registros decodificados para su corrección, con `list: null`.
Nunca se devuelve una lista parcial ni se omiten filas vacías o duplicadas.

La cabecera y las cantidades son exactas, sin recortar espacios o convertir
formatos alternativos. Se admiten comas y comillas literales mediante quoting,
LF/CRLF y un BOM inicial. Los rangos se refieren al texto original en unidades
UTF-16; incluyen comillas y escapes. El campo `""` tiene valor vacío y un rango
de dos unidades, mientras que un campo vacío sin comillas tiene rango vacío.

Los límites son 65.536 unidades UTF-16, 65.536 bytes UTF-8, cien filas de datos y
32 campos por registro como límite técnico. La regla semántica exige dos campos.
Una cantidad cero o el máximo entero seguro se conserva sin sumar o redondear.
SKU con ceros iniciales, espacios significativos o apariencia de fórmula siguen
siendo texto literal. No se evalúan ni se exportan.

Los metadatos y la lista final pasan por el normalizador real del contrato de
lista. El predicado privado de SKU se comparte sin alterar su gramática. Los
errores del envoltorio son redactados; los tokens decodificados se exponen
deliberadamente para corrección, sin logs ni telemetría.

No hay archivo, carga, formulario, envío, almacenamiento, pedido o base de datos.
`companies` 1.12.0 conserva B2B-008 parcial e instalada/inactiva, dependiente de
B2B-002, sin superficies operativas. La demostración visual queda pendiente.

Verificación de fuentes del 2026-10-04:

- Check global correcto: 1.010 archivos sin diagnósticos, 270 suites y 4.099
  pruebas; build con 44 HTML, 44 formularios locales y cero crons.
- 66 pruebas CSV, 63 de regresión de listas, seis de arquitectura y 122 de
  registro/manifiesto/acceso, todas correctas.
- Revisión independiente sin P1/P2: 35.917 aserciones sobre 976 entradas CSV y
  76 entradas hostiles; 1.997 comprobaciones de delegación al normalizador real.
  La regresión independiente del contrato anterior suma 55.894 aserciones.
  Son cuentas separadas, sin sumar las pruebas del autor ni las 269 aserciones
  y cuatro sondeos de la revisión paralela del escáner.
- Cero efectos, getters ejecutados o reloj implícito en las sondas. Las fechas
  de metadatos proceden de entradas explícitas.
- Bundle público diagnóstico de ocho exports: 13.408 B / 4.269 gzip, sin
  imports externos ni runtime operativo; contiene 1.184 B de constantes
  históricas. Esta medida no corresponde a un cliente emitido por Astro.
- Ocho grafos completos de navegador, 361 fuentes seleccionadas, 19 CSS y
  los 62 JS públicos idénticos a R6.8a. El Worker aumenta 65 B por la versión
  del módulo y el enlace ADR-0064; la metadata del manifest cambia aparte.
  No se afirma equivalencia completa del SSR.

La comparación final de assets se registra en el [informe agregado](verification-report.json).
Este corte no añade interfaz ni ejecuta Worker, HTTP, navegador o base de datos.
La interacción se hereda expresamente de [R6.7c / PR #44](../r6-7c/README.md):
5.076 comprobaciones, 108 visitas, ocho superficies a11y sin hallazgos, ocho
capturas revisadas y E2E 200/200. Su hash intacto de 143 tablas/353 filas
pertenece a esa ejecución anterior y no es una nueva prueba de R6.8b.

Sin despliegue, migración, proveedor, cron, pedido o mutación operativa.

Consejo: arquitectura ✓ · backend ✓ · fullstack ✓ · producto ✓.
