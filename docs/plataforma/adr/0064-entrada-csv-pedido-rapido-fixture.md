# ADR-0064 — Entrada CSV de pedido rápido mediante texto fixture

- Estado: accepted; R6.8b implementado y verificado localmente, integrado en PR #46 (`09161255`), sin despliegue.
- Fecha: 2026-10-04.
- Aplicación: `src/modules/companies/application/company-quick-order-csv.ts`.
- Helper privado: `src/modules/companies/domain/company-quick-order-sku.ts`.
- API pública: `src/modules/companies/index.ts`.
- Módulo: `companies` 1.12.0, dependencia `platform-configuration`.
- Capacidad: B2B-008 parcial, instalada/inactiva avanzado/demo, ausente mínimo/estándar; dependencia B2B-002 y superficies operativas vacías.
- Perfil de entrada: `company-quick-order-csv-v1`.
- Continuidad: R6.8a integrado en PR #45 (`4cfef237`), sin despliegue.

## Contexto y decisión

El [ADR-0063](0063-lista-identidad-sku-fixture.md) define una lista íntegra de
intención y la resolución literal de sus SKU. R6.8b añade una sola entrada de
texto CSV fixture hacia esa lista. No recibe un catálogo ni resuelve identidad,
stock, visibilidad, precio o posibilidad de compra. `parsed` significa texto
válido para este perfil y una intención completa, no un pedido importado.

La API es pura y síncrona. No acepta `File`, `Blob`, ruta o URL; no descarga,
abre archivos, importa documentos operativos o escribe listas. No hay upload,
formulario, almacenamiento, exportación, reloj o UI. Histórico, composición y
demo se mantienen en subcortes posteriores; B2B-008/R6.8 siguen parciales.

## API y reutilización del dominio

`parseCompanyQuickOrderCsv(input:unknown):CompanyQuickOrderCsvResult` recibe
exactamente `schemaVersion:1`, `source:'fixture'`, perfil CSV, `id`, `version`,
`catalogRef:{ref,capturedAt}` y `text` string primitivo. Los metadatos son
explícitos; no se generan IDs, fechas o referencias de catálogo.

Primero valida y captura el wrapper. Normaliza los metadatos mediante
`defineCompanyQuickOrderList` con filas vacías, heredando su gramática de ID,
versión y fecha UTC canónica, incluido año 0000. Solo después analiza el texto.
Cuando todo es válido, vuelve a usar el normalizador real con todas las filas.
La lista resultante conserva el perfil `company-quick-order-identity-v1`,
`schemaVersion:1` y `origin:'structured'`; no amplía el contrato de a.

El predicado literal de SKU se extrae sin cambio semántico a un helper privado.
Su constante de 100 unidades UTF-16 alimenta el límite público existente; ni
helper ni constante privada se exportan por el barrel. El dominio a conserva
sus errores y rechazos, con regresión obligatoria. La aplicación importa ese
dominio hermano y helper, sin su propio barrel ni infraestructura.

No reutiliza `csvField`: ese exportador protege fórmulas añadiendo apóstrofo y
cambiaría la identidad literal. Texto como `=A1+1`, `00042` o `__proto__` permanece
como SKU; no se evalúa, transforma en número, neutraliza, exporta o ejecuta.

## Resultado íntegro o ausencia de lista

El resultado contiene `source`, perfil CSV, `metadata`, `textInfo`, `header`,
`rows`, `diagnostics`, `outcome` y `list`. No repite el wrapper ni el texto completo.
`textInfo` conserva longitud UTF-16, número de bytes UTF-8 o `null` cuando aún
no se ha podido computar, y presencia de BOM inicial.

- `parsed`: `list` es la lista completa congelada, cabecera presente y
  diagnósticos vacíos. Cada fila se corresponde una a una con la intención.
- `invalid`: `list:null` ante cualquier diagnóstico. Un fallo fatal de límites o
  sintaxis devuelve `header:null` y `rows:[]`, sin prefijo parcial. Tras un parse
  estructural completo, errores de cabecera, número de columnas o campos
  conservan todos los registros decodificados para corrección, nunca una lista
  formada solo por las filas buenas.

Cada fila de datos recibe ID determinista `csv.row.N` y posición ordinal desde
uno. Los SKU repetidos, filas y cantidades cero se conservan; no hay suma,
deduplicación, omisión, ajuste o corrección. `sku_not_found`/`sku_ambiguous`
pertenecen exclusivamente al preview de a sobre un catálogo, no al parser.

Los tokens decodificados inválidos pueden estar presentes en `fields.value`
como datos para corrección. No son una intención utilizable, no se registran en
telemetría y no conceden permiso para representarlos como HTML o ejecutarlos.
El perfil no afirma privacidad por ocultar el string completo de entrada.

## Dialecto CSV cerrado

La coma ASCII es el único delimitador. La cabecera decodificada debe ser
exactamente `sku,quantity_units`, con ese orden, mayúsculas y espacios; también
admite ambos nombres entrecomillados. Sin alias, comentarios, autodetección de
punto y coma/tabulador o columnas ignoradas. Solo cabecera produce lista vacía.

Una comilla doble solo abre al principio de campo; dos comillas dentro de un
campo quoted decodifican una comilla literal. Después del cierre solo se admite
coma, LF, CRLF o EOF. Espacios después del cierre son error, no se recortan.
Comilla dentro de campo no entrecomillado o EOF antes del cierre son fallos de
sintaxis; no se intenta resincronizar para importar un prefijo.

LF y CRLF pueden mezclarse. CR aislado es error en cualquier estado. Los saltos
dentro de comillas se conservan literalmente en el valor y avanzan la línea
física sin terminar registro; la gramática posterior de SKU/cantidad los rechaza
como campo, no como identidad desconocida.

Solo un BOM U+FEFF en offset cero se consume antes de cabecera. Cuenta en ambos
límites de longitud y en las posiciones originales. Un segundo BOM o uno dentro
de un campo no se elimina; tampoco se adivina texto mojibake equivalente.

No se omiten filas vacías. Un único separador final termina el registro previo
sin inventar otro; dos separadores finales incluyen una fila vacía real. Una
fila vacía contiene un campo vacío y falla por columnas; `,` contiene dos campos
vacíos y falla por SKU y cantidad. Texto vacío o solo BOM produce
`header_missing`; un salto solo contiene cabecera vacía y produce `header_mismatch`.

## Cantidades y límites

La cantidad decodificada debe ser exactamente `0` o un dígito ASCII 1–9 seguido
de dígitos ASCII. Se valida el token completo: no signos, espacios, ceros
iniciales, decimales, exponentes, hexadecimal, separadores o dígitos Unicode.
`"2"` es válido por decodificación de quoting; `-0` y un salto al final no lo son.

Solo después del léxico se compara longitud y orden lexicográfico con
`9007199254740991`; si lo supera, `quantity_out_of_range`. La conversión a Number
ocurre tras garantizar exactitud. No se usa `parseInt` ni coerción permisiva.
Cero y dos filas con `MAX_SAFE_INTEGER` permanecen independientes, sin suma,
redondeo o reinterpretación como cajas. Quote 1–99 permanece intacto.

| Límite técnico | Máximo |
|---|---|
| Texto original UTF-16 | 65.536 unidades |
| Texto original UTF-8 | 65.536 bytes |
| Registros, incluida cabecera | 101 |
| Filas de datos | 100 |
| Campos por registro | 32 |
| Longitud técnica de campo | 65.536 unidades UTF-16 |
| Diagnósticos | 200 |

El techo de 32 columnas limita expansión del scanner, mientras el contrato
semántico exige exactamente dos. Un campo no puede superar su texto de origen;
el SKU válido sigue limitado a 100 unidades por el predicado de a. No se trunca
texto, columna, registro o diagnóstico para convertirlo en un resultado válido.

Primero se limita longitud UTF-16; después se rechazan surrogates aislados antes
de computar UTF-8, sin sustitución silenciosa por U+FFFD. Se cuenta UTF-8 exacto
sobre texto bien formado, luego se aplica su límite. Los límites globales no
inventan posición de un token que no se ha analizado.

## Posiciones, rangos y diagnósticos

`offset` cuenta unidades UTF-16 desde cero; `line` y `column` empiezan en uno.
Se refieren al texto original, no a grafemas, bytes o posición visual de editor.
Un astral cuenta dos columnas, un BOM inicial una; la cabecera después del BOM
empieza en offset 1, línea 1, columna 2. CRLF avanza dos offsets y una línea.

Los rangos son inicio inclusivo y fin exclusivo. El de un campo incluye
comillas delimitadoras y escapes, excluyendo coma/separador. Un campo vacío no
entrecomillado tiene rango vacío; `""` conserva el rango de las dos comillas,
aunque su valor sea vacío. El rango del registro incluye comas y quoting, pero
excluye separador final. `recordNumber` incluye cabecera; la posición de intención
no, y no se deriva de la línea física de un campo multilínea.

La precedencia es wrapper/metadatos, límite UTF-16, primer surrogate inválido,
límite UTF-8, primer fallo fatal del scanner, cabecera y finalmente todas las
filas/campos en orden. Un fallo fatal emite un único diagnóstico. Cabecera ajena
emite solo `header_mismatch`, sin asignar significado a columnas de datos.
Con cabecera correcta, cada fila emite `column_count` si no tiene dos campos;
si los tiene, SKU antes de cantidad. `invalid_quantity` y
`quantity_out_of_range` son excluyentes para el mismo campo.

| Categoría | Códigos |
|---|---|
| `limit` | `text_utf16_limit`, `text_utf8_limit`, `record_limit`, `column_limit` |
| `syntax` | `invalid_utf16`, `bare_cr`, `unexpected_quote`, `unexpected_after_quote`, `unclosed_quote` |
| `header` | `header_missing`, `header_mismatch` |
| `row` | `column_count` |
| `field` | `invalid_sku`, `invalid_quantity`, `quantity_out_of_range` |

Un diagnóstico conserva posición, número de registro y campo cuando se conocen.
Los límites globales tienen posición nula; un surrogate inválido tiene posición
exacta, pero registro/campo nulos porque precede al scanner. Errores de campo
señalan el inicio de su rango, cabecera/columnas el inicio de registro y cabecera
ausente el EOF, después del BOM si existe.

## Frontera pura y errores

Wrapper exacto `unknown`, prototipo permitido y propiedades propias de datos,
sin accesores, símbolos, instancias o extras. Se captura una vez, normaliza
metadata y no vuelve a leer referencias externas; strings son inmutables.
Todo DTO, rango, campo, fila, diagnóstico, metadata y lista se copia/congela.
No reloj implícito, aleatoriedad, red, DB, timers o storage; Date explícito solo
en la normalización de metadata reutilizada de a.

`CompanyQuickOrderCsvContractError` expone código
`company_quick_order_csv_contract_invalid` y razones `invalid_data` o
`normalization_failure`. Wrapper/metadatos/trampas ajenas producen error propio
redactado. Una excepción del normalizador final después de validar el texto es
`normalization_failure`, nunca un falso error de campo o resultado parcial.
No conserva payload, causas, texto o mensajes ajenos. Los fallos esperables de
contenido son diagnósticos `invalid/list:null`, no excepciones contractuales.

## Validación y siguientes cortes

**Implementado y verificado localmente; integrado en PR #46 (`09161255`), sin despliegue.** 66 focales CSV,
63 de regresión de a y seis de arquitectura verdes; TypeScript focal en cuatro
archivos sin diagnósticos. Registro/manifiesto/acceso 122/122 verde (19/73/30).
Check global final: 1.010 archivos sin diagnósticos, 270 suites/4.099 pruebas;
build del 2026-10-04 a las 05:51:48 UTC, 44 HTML/44 formularios locales/cero cron.
Revisión independiente: 35.917 aserciones sobre 976 CSV y 76 casos hostiles;
1.997 aserciones de delegación y 55.894 de regresión de a, por separado. Scanner
auxiliar: 269 aserciones y cuatro sondas, sin sumarlas a las otras categorías.
Sin P1/P2, getters, efectos o reloj implícito. Bundle diagnóstico de ocho exports:
13.408 B/4.269 gzip, incluidas 1.184 B de constantes históricas puras, sin
operativo; no es un asset emitido. Comparación final frente a PR #45: ocho grafos completos, 361 fuentes
seleccionadas, 19 CSS y 62 JavaScript públicos idénticos en nombres, imports,
SHA, bytes y gzip; los JS suman 432.002 B/138.864 gzip. Worker de 282 archivos:
+65 B/+280 gzip, 280 idénticos tras mapear 24 nombres. El cambio exacto de
companies 1.12.0 y ADR0064 explica runtime-platform; metadata generada del
manifest aparte, sin equivalencia SSR completa. No hubo nueva QA runtime.
**Verificado localmente e integrado en PR #46 (`09161255`), sin despliegue.**
[Informe final R6.8b](../../audits/r6-8b/verification-report.json). No se atribuye nueva UI,
HTTP, navegador o DB a este corte. La evidencia de interacción heredada procede
de R6.7c/PR #44: 5.076 comprobaciones/108 visitas, ocho a11y/PNG, E2E 200 y hash
intacto de 143 tablas/353 filas. El [informe R6.8a](../../audits/r6-8a/verification-report.json),
integrado en PR #45, documenta la comparación estática anterior; b ha completado
la suya sin repetir interacción HTTP/navegador/DB ni afirmar equivalencia SSR global.

R6.8c está implementado y verificado localmente, con integración pendiente y sin
despliegue, según el [ADR-0065](0065-historico-pedido-rapido-fixture.md): identidad
explícita y snapshot íntegro de origen, check de 4.134 pruebas y estática final
cerrados; QA runtime heredada de PR44. No se reconstruye una compra anterior
resolviendo un SKU reutilizado ni usando el `OrderReader` sin variante. Tampoco
se incorpora esa API por adelantado en este ADR. La siguiente demo propuesta cubre SKU, CSV, listas e intención histórica, con
diseño exacto pendiente. No necesita composición comercial previa de visibilidad
o cantidades; esa ampliación solo se estudiaría para elegibilidad adicional.

No hay importación operativa, lista persistida, pedido, precio, stock, permiso,
pago, DDL o cron. La capacidad permanece parcial e inactiva aunque el texto
pueda convertirse en una intención fixture estructuralmente válida.
