# ADR-0065 — Intención histórica de pedido rápido con fixtures

- Estado: accepted; R6.8c implementado y verificado localmente, integración pendiente y sin despliegue.
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

## Ejemplo y validación pendiente

El fixture de diseño contiene doce filas: siete parejas encontradas, tres no
encontradas y dos no aportadas. El SKU da siete coincidencias únicas, dos
ambiguas y tres no encontradas. Entre las siete únicas, tres corresponden a la
pareja histórica, tres a otra y una conserva identidad histórica no aportada.
Incluye cero/MAX_SAFE, repetidas, SKU renombrado/reutilizado, variante bajo otro
propietario y colisión de origen resuelta solo por pareja explícita. Son
expectativas de diseño, no métricas de QA ejecutada.

**Verificado localmente, integración pendiente y sin despliegue.**
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
**Verificado localmente, integración pendiente y sin despliegue.**
[Informe final R6.8c](../../audits/r6-8c/verification-report.json). No se atribuye nueva UI,
HTTP, navegador o DB a c. [R6.8b](../../audits/r6-8b/verification-report.json),
integrado en PR #46, aporta el corte estático anterior. La interacción sigue
heredada de R6.7c/PR #44: navegador 5.076/108 visitas, ocho a11y/PNG, E2E 200 y
hash QA intacto de 143 tablas/353 filas; no son nuevas ejecuciones históricas.

## Continuidad sin operación

Una futura composición debe decidir cómo tratar duplicados, varias variantes
de producto, SKU cambiado y cantidades, sobre una fuente completa común. No se
devuelve aquí una lista sugerida ni se acepta una decisión de compra implícita.
R6.8d tiene diseño exacto aceptado: /demo/admin/listas-sku, «Listas y repetición»,
diez escenarios de las cuatro entradas, un selector y reset sobre a+b+c. Sus
fuentes y QA esperan integración de c y baseline. No necesita composición
comercial previa ni acredita elegibilidad; la demo conserva cada diagnóstico.
No se atribuye aquí implementación o evidencia visual de d.

B2B-008 conserva instalación inactiva y dependencia B2B-002; la importación de
normalizadores puros no activa operaciones. R6.8 sigue parcial: estos snapshots
no recuperan un pedido real ni autorizan repetición, precio, stock o cobro.
