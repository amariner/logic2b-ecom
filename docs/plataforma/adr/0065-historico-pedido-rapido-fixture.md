# ADR-0065 — Intención histórica de pedido rápido con fixtures

- Estado: accepted; R6.8c implementado y verificado localmente, integrado en PR #47 (`372dd221`), sin despliegue; demo R6.8d verificada localmente e integrada en PR #48 (`d0816ad2`), despliegue bloqueado por autenticación.
- Fecha: 2026-10-04.
- Dominio: `src/modules/companies/domain/company-quick-order-history.ts`.
- API pública: `src/modules/companies/index.ts`.
- Módulo: `companies` 1.13.0, dependencia `platform-configuration`.
- Capacidad: B2B-008 parcial, instalada/inactiva avanzado/demo, ausente mínimo/estándar; dependencia B2B-002 y superficies operativas vacías.
- Perfil: `company-quick-order-history-v1`.
- Continuidad: R6.8b integrado en PR #46 (`09161255`), sin despliegue.

## Contexto y decisión

El [ADR-0063](0063-lista-identidad-sku-fixture.md) resuelve SKU literales en un
snapshot declarado y el [ADR-0064](0064-entrada-csv-pedido-rapido-fixture.md)
transforma texto fixture íntegro en una lista. Ninguno acredita qué variante
perteneció a una compra anterior. Un SKU puede cambiar, repetirse o aparecer en
otra identidad; tampoco un nombre o precio permite recuperar esa identidad.

R6.8c define una intención histórica declarada con catálogo completo de origen
y compara cada fila con otro catálogo completo. Mantiene separadas la pareja
`productId/variantId` aportada y la búsqueda del SKU histórico. No sustituye la
identidad de la fila por una coincidencia textual, ni genera una lista dirigida
al catálogo comparado. «Histórico» no prueba compra, fecha comercial o autenticidad.

No consulta ni modifica `OrderReader`, que carece de identidad de variante en
sus líneas resumidas. No hay pedido real, CSV, precio, stock, visibilidad,
cantidad satisfecha, cajas, permiso, carrito, DDL, persistencia o UI. El dominio
importa solo el contrato hermano de a; no composición, readers o runtime.

## APIs y artefactos completos

| API | Entrada | Resultado |
|---|---|---|
| `defineCompanyQuickOrderHistory` | Histórico completo | Copia canónica del origen, metadata y filas |
| `previewCompanyQuickOrderHistory` | `{history,comparedCatalog,identityRelation}` | Ambos cortes y comparaciones independientes por fila |

El histórico contiene `schemaVersion:1`, `source:'fixture'`, perfil histórico,
`id`, `version`, `originCatalogRef:{ref,capturedAt}`, `originCatalog` completo y
`lines:[{id,sku,quantityUnits,identity}]`. La identidad es exactamente
`{productId,variantId}` o `null`; no se acepta una pareja parcial. Cada fila tiene
ID propio único, pero SKU, pareja y cantidad pueden repetirse sin agregación.

El origen y el catálogo comparado son `CompanyQuickOrderCatalog` reales de a,
normalizados mediante su API pública, con todos los productos, variantes y SKU.
Se conserva el orden de filas y se canonicaliza el orden interno de los catálogos.
El preview entrega `source`, perfil histórico, `identityRelation`, histórico
íntegro, catálogo comparado íntegro y `lines`; no incorpora `schemaVersion` raíz.
Cada resultado de fila lleva posición original más uno, fila completa,
`identityComparison` y `skuComparison`.

## Relación declarada entre espacios de identidad

`identityRelation:'same_declared_space'` es obligatorio en el wrapper del preview.
El llamador declara que, para ese par de snapshots completos, los números de
producto y variante se interpretan en un mismo espacio de IDs. La función los
compara bajo ese supuesto; no certifica continuidad de una entidad externa,
identidad autenticada, tenant, cuenta o compra real.

La relación acompaña al contenido íntegro de ambos cortes y se conserva en la
salida. No se deduce de refs, capturas o SKU coincidentes; no añade namespace,
hash, PKI o lookup de procedencia. Sin el literal exacto se rechaza el wrapper.
Es posible definir un histórico sin ejecutar el preview, pero este perfil no
añade un modo de comparación sin relación declarada.

La referencia de origen debe coincidir exactamente con su snapshot. El comparado
puede tener ref y captura distintos o una fecha anterior: son metadatos, no un
reloj de vigencia. Referencias iguales con contenidos diferentes no permiten
colapsar los cortes ni acreditar autenticidad. Se denomina catálogo comparado,
no «catálogo vigente» o prueba de cambios externos.

## Validación del origen y de las filas

Se normaliza todo el catálogo de origen antes de resolver relaciones, incluidos
productos no usados o SKU ambiguos. Se capturan todas las filas mediante records
exactos. Sus campos base y metadatos pasan por `defineCompanyQuickOrderList`
real, con una proyección interna destinada exclusivamente a validación. Esa
lista interna no se devuelve, no se dirige al comparado y no resuelve identidad.
No se modifica el contrato SKU-only de a para admitir nuevas propiedades.

Cada identidad no nula se copia y valida. Producto y variante deben existir en
origen; si existen pero la variante pertenece a otro producto, es error de
propiedad. El SKU de la variante de origen debe ser exactamente el de la fila.
Una identidad explícita permite distinguir una variante aunque su SKU colisione
con otro en origen; la colisión no invalida esa pareja aportada.

`identity:null` no provoca lookup para completarse. Tampoco exige que ese SKU
figure en origen. Aunque haya una única coincidencia textual en ambos cortes,
la identidad histórica sigue no aportada. No se atribuye pertenencia a una compra
ni consistencia de identidad a un texto sin pareja declarada.

Después de validar el histórico entero se normaliza todo el catálogo comparado,
incluso con cero filas o todas las identidades nulas. Datos corruptos en una
variante no solicitada no se ocultan como resultado «no encontrado».

## Dos comparaciones por fila

La comparación de identidad exige coincidencia simultánea de producto y variante:

| Identidad aportada y presencia | Resultado | SKU comparado |
|---|---|---|
| `null` | `not_provided` | `null`, relación SKU nula |
| Pareja exacta presente | `found` | Literal encontrado, `skuRelation:same|different` |
| Pareja exacta ausente | `not_found` | `null`, relación SKU nula |

Un `variantId` bajo otro propietario no es la misma pareja. `not_found` solo
significa que esa identidad declarada no figura en ese snapshot bajo el supuesto
compartido; no demuestra retirada, archivado, falta de stock o inexistencia real.

La comparación de SKU busca el texto histórico literal en **todas** las variantes
del comparado: cero coincidencias produce `sku_not_found`; una produce identidad
única; dos o más producen `sku_ambiguous`, número de coincidencias e identidad
nula. No se favorece una candidata porque coincida con la pareja histórica.

Solo en la coincidencia textual única se entrega
`relationToHistoricalIdentity:same|different|not_provided`, según las parejas
numéricas o ausencia declarada. Si el lookup es ambiguo o no encontrado, esa
relación es `null`. La identidad encontrada por SKU jamás reemplaza `line.identity`.

Por ello una pareja puede estar encontrada con nuevo SKU mientras el texto
anterior resuelve otra identidad; o estar encontrada aunque su SKU sea ambiguo.
También puede faltar la pareja y el SKU aparecer bajo otro producto. Se conservan
ambas dimensiones, sin estado agregado de recuperado, disponible o comprable.

Las cantidades de cero a `MAX_SAFE_INTEGER` permanecen literales en todos los
resultados. Una identidad ausente no se convierte en cantidad cero, ni las filas
repetidas se suman, ajustan o reinterpretan como número de cajas.

## Límites, copias y errores

Se reutilizan las fronteras reales de a: cada catálogo admite 0–1.000 productos,
1–100 variantes por producto y hasta 10.000 variantes globales. Ambos cortes
pueden sumar 20.000 variantes declaradas; no se repiten arrays de candidatos por
cada fila. El histórico admite 0–100 filas y versión positiva segura.

Producto: entero 1–2.147.483.647; variante: entero positivo seguro. No `-0`,
fracciones, strings o coerción. IDs, versión, referencia, SKU literal de hasta
100 unidades UTF-16 y cantidades heredan la validación de a. La versión es
metadata, sin commands, CAS, replay, incremento o historia durable.

Records exactos de propiedades propias de datos y arrays densos, sin accesores,
extras, símbolos o instancias. Copia profunda antes de derivar y congelación de
todos los DTO. Tras normalizar cada snapshot no se releen originales: una trampa
de introspección del comparado no puede cambiar retrospectivamente el histórico.
Sin reloj implícito, IDs nuevos, aleatoriedad, I/O, red o DB; Date explícito solo
dentro de la validación de `capturedAt` de a, que admite año 0000.

`CompanyQuickOrderHistoryContractError` expone código
`company_quick_order_history_contract_invalid` y razones `invalid_data`,
`duplicate_line_id`, `origin_reference_mismatch`, `unknown_origin_identity`,
`cross_product_reference` y `origin_sku_mismatch`. Constructor reason-only y
mensajes fijos, sin payload, causa o mensajes ajenos. Errores del normalizador a
se traducen a `invalid_data`, salvo duplicación de ID de fila reconocida mediante
su clase pública y descriptor seguro. No se ejecutan getters del propio error.

Precedencia: wrapper y literales; origen íntegro; forma/rangos y campos de todas
las filas; referencia de origen; todas las parejas y SKU de origen; catálogo
comparado íntegro; solo entonces diagnósticos. Ref o captura comparadas distintas,
pareja ausente, SKU ambiguo o coincidente con otra identidad son resultados
normales; corrupción interna es error previo.

## Ejemplo y validación del contrato

El fixture de diseño contiene doce filas: siete parejas encontradas, tres no
encontradas y dos no aportadas. El SKU da siete coincidencias únicas, dos
ambiguas y tres no encontradas. Entre las siete únicas, tres corresponden a la
pareja histórica, tres a otra y una conserva identidad histórica no aportada.
Incluye cero/MAX_SAFE, repetidas, SKU renombrado/reutilizado, variante bajo otro
propietario y colisión de origen resuelta solo por pareja explícita. Son
expectativas de diseño, no métricas de QA ejecutada.

**Verificado localmente e integrado en PR #47 (`372dd221`), sin despliegue.**
Registro/manifiesto/acceso 122/122 verde (19/73/30).
35 focales históricas y seis de arquitectura verdes;
TypeScript focal en dos archivos sin diagnósticos. Revisión independiente:
176.040 aserciones sobre 312 casos/914 filas/71 rechazos, 2.202 de delegación y
966 de frontera sobre 115 casos, contadas por separado. Sin P1/P2, efectos,
getters o reloj implícito. Bundle diagnóstico de cuatro exports: 11.093 B/3.306
gzip, con 1.184 B de constantes históricas puras; sin CSV ni runtime operativo,
distinto de un asset emitido. La inicialización de límites se encapsuló en una
IIFE anotada pura para evitar retención innecesaria, sin cambiar API o valores.
El diagnóstico de los cuatro exports conserva exactamente bytes y SHA anteriores;
se revalidó importación/llamada dirigida, sin atribuir otra ejecución del oráculo.
Check global final posterior a la corrección verde: 1.012 archivos sin diagnósticos,
271 suites/4.134 pruebas; build del 2026-10-04 a las 06:09:55 UTC,
44 HTML/44 formularios locales/cero cron. Comparación final frente al PR #46
original: ocho grafos completos, 361 fuentes seleccionadas, 19 CSS y 62 JS
públicos idénticos en nombres, imports, SHA, bytes y gzip (432.002 B/138.864 gzip).
Retención de cliente resuelta, delta público cero. Worker de 282 archivos:
+63 B/−281 gzip; 280 iguales tras mapear 24 nombres. Solo companies 1.13.0 y
ADR0065 en runtime-platform, más metadata generada de manifest separada;
sin equivalencia SSR completa ni nueva QA runtime.
**Verificado localmente e integrado en PR #47 (`372dd221`), sin despliegue.**
[Informe final R6.8c](../../audits/r6-8c/verification-report.json). No se atribuye nueva UI,
HTTP, navegador o DB a c. [R6.8b](../../audits/r6-8b/verification-report.json),
integrado en PR #46, aporta el corte estático anterior. La interacción sigue
heredada de R6.7c/PR #44: navegador 5.076/108 visitas, ocho a11y/PNG, E2E 200 y
hash QA intacto de 143 tablas/353 filas; no son nuevas ejecuciones históricas.

## Extensión R6.8d — Demo «Listas y repetición»

**Implementada, verificada localmente e integrada en PR #48 (`d0816ad2`).** Rama
`codex/company-quick-order-demo`; ruta `/demo/admin/listas-sku`, título
«Listas y repetición», subtítulo «SKU, CSV e intención histórica», grupo Clientes.
La demo usa exclusivamente fixtures en memoria y exige simultáneamente el
manifiesto demo y `DEMO_MODE='true'`. No activa B2B-008 ni sus superficies operativas.

Un selector «Ejemplo» recorre diez casos cerrados y un botón «Restablecer ejemplo»
restaura el estado inicial, igual que recargar. No hay editor, archivo, formulario,
selector de fila o fecha. Las dos zonas muestran entrada y lectura por fila;
como máximo tres filas por ejemplo permiten conservar duplicados sin ocultarlos.
Los casos cubren SKU identificado/no encontrado/ambiguo, lista repetida con cero,
CSV válido/cantidad inválida/comilla sin cerrar e históricos con SKU conservado,
renombrado, reutilizado, ambiguo o identidad de origen ausente.

La composición `company-quick-order-demo` define `createCompanyQuickOrderDemo`,
`configureCompanyQuickOrderDemo`, `getCompanyQuickOrderDemoView` y
`canShowCompanyQuickOrderDemo`. Estado y vista son copias congeladas; selección
y feedback se validan completos. Un cambio real de ejemplo modifica el feedback;
un patch vacío o repetido lo conserva. Los resultados se obtienen de las APIs
públicas reales, no de tablas de respuestas precalculadas:

- SKU y lista delegan en `previewCompanyQuickOrderList`.
- CSV llama a `parseCompanyQuickOrderCsv`; solo `parsed` permite identificar la
  lista íntegra devuelta. `invalid` conserva los diagnósticos/filas decodificadas
  realmente retenidos, con lista nula y sin lookup parcial.
- Histórico llama a `previewCompanyQuickOrderHistory` con la relación declarada;
  distingue variante de origen y coincidencia del SKU, sin crear otra lista.

La vista conserva SKU literal, espacios, cantidad cero y ordinales. Los nombres
se unen por pareja explícita; nunca se deducen de una coincidencia ambigua. Omite
IDs privados, referencias, perfiles y snapshots completos. CSV/SKU se representan
como texto, sin enlaces ni ejecución. Campos ausentes permanecen nulos y eliminan
valores de la vista anterior; una cantidad escrita inválida no se presenta como
unidades. `headerPresent` solo informa si el parser retuvo la cabecera, sin
inferir que el texto original carecía de ella. No se suman cantidades ni se
comprueban precio, stock, visibilidad, cajas o condiciones de compra.

Validación local final del 2026-10-04: `pnpm check` verde, 1.016 archivos sin
diagnósticos, 272 suites/4.159 pruebas; build de las 06:52:48 UTC, 44 HTML y
44 formularios locales, sin envíos/beacon/cron. Focales: 25 de modelo, seis de
arquitectura y ocho de acceso guiado. Revisión independiente: 18.665 aserciones,
97 de delegación y tres de gate contadas por separado, sin P1/P2. Cliente real:
un archivo de 39.594 B/10.636 gzip, sin imports externos ni efectos de arranque
sin raíz; esa sonda se distingue de la interacción del navegador.

Navegador nuevo: 1.994 comprobaciones/20 visitas; veinte superficies a11y sin
hallazgos y ocho PNG aprobadas por frontend, cuatro contrastadas por raíz.
E2E nuevo 204/204. Worker y Chrome detenidos. Hash fresco antes de las 06:52:47
y después de las 06:55:54 UTC idéntico: 143 tablas/353 filas,
`9cbfc811cfc4296515a403d395875a43bfa26aff0c9c9b08be0804b15bbf6eca`.
Sin escrituras operativas ni preparación nueva de DB atribuida a la demo.

Siete grafos de negocio anteriores permanecen idénticos a PR #47 y los seis
archivos de contratos a+b+c, helper, barrel y registro conservan sus fuentes. Guía separada: 15.230 B/6.333 gzip,
único cambio de allowlist `|listas-sku` (+11 B/+8 gzip). Dieciocho CSS emitidos
siguen iguales; el global añade ocho utilidades (+430 B) conservando las reglas
anteriores. Nuevo modelo/página y navegación explican el delta del Worker;
no se afirma igualdad SSR completa o equivalencia visual de todas las páginas.
[Informe final R6.8d](../../audits/r6-8d/verification-report.json).

Las ocho capturas representan lista repetida, CSV con cantidad inválida, SKU
histórico reutilizado y ambigüedad/identidad ausente, a 1440/375. La etiqueta
larga del selector nativo a 375 px conserva una limitación visual P3 aceptada;
la descripción íntegra del ejemplo permanece visible. No fue un bloqueo y no
se alteró el control nativo. Esta QA es nueva de d; las métricas de c y PR #44
anteriores conservan su atribución histórica.

## Continuidad sin operación

La demo verificada está integrada en PR #48 (`d0816ad2`). La prioridad es habilitar
la credencial segura de Cloudflare y entregar el despliegue expresamente autorizado.
El intento del 2026-10-04 a las 06:59 UTC terminó con código 1 por falta de
`CLOUDFLARE_API_TOKEN`, circunstancia comunicada al usuario. Producción todavía no
está actualizada; no se necesita DDL nueva. R6.9 queda pospuesto: su propuesta de
consolidación fixture sobre dos empresas, permisos/dinero y wiki se conserva
para después y no bloquea esta entrega. A+b+c bastan para esta demostración de las cuatro entradas; no
requiere antes una composición de elegibilidad comercial. Si se propusiera esa
ampliación, tendría que resolver duplicados, múltiples variantes y conversión de
unidades sobre una fuente completa común, sin decisiones silenciosas de compra.

B2B-008 conserva instalación inactiva y dependencia B2B-002. R6.8 sigue parcial:
los snapshots y su demostración no recuperan pedidos reales ni autorizan
repetición, precios, stock o cobro. No hay persistencia, DB operativa, cron,
servicios, publicación remota o despliegue atribuido a este corte.
