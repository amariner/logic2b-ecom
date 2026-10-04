# ADR-0063 — Lista estructurada e identidad de SKU con fixtures

- Estado: accepted; R6.8a implementado y verificado localmente, integrado en PR #45 (`4cfef237`), sin despliegue.
- Fecha: 2026-10-04.
- Dominio: `src/modules/companies/domain/company-quick-order.ts`.
- API pública: `src/modules/companies/index.ts`.
- Módulo: `companies` 1.11.0; dependencia `platform-configuration`.
- Capacidad: B2B-008 parcial, instalación inactiva en avanzado/demo, ausente mínimo/estándar; dependencia B2B-002, sin superficies operativas.
- Perfil: `company-quick-order-identity-v1`.
- Continuidad: R6.7c integrado en PR #44 (`6aade364`), sin despliegue.

## Contexto y decisión

R6.8 contempla entrada por SKU, CSV, listas y pedido anterior. Este primer corte
se limita a una lista estructurada de intención y la identidad que cada SKU
resuelve dentro de un único snapshot completo suministrado. No crea carrito,
pedido, presupuesto o selección comercial, ni añade dinero, stock o visibilidad.

El catálogo existente conserva SKU por variante. `createCatalogEntry` compara
`trim` y minúsculas para la unicidad dentro de un producto, mientras la DDL
`0007` declara `UNIQUE(sku)` global sin `COLLATE NOCASE`. Se define un perfil
fixture literal propio, sin cambiar esas fronteras ni afirmar equivalencia
universal con la persistencia. `CompanyCatalogSnapshot` no incorpora SKU y
permanece intacto; tampoco se modifica `QuantityCatalogSnapshot`.

«Completo» significa el snapshot entero declarado por el llamador, incluidas
identidades no solicitadas. No prueba que sea todo un catálogo externo, su
origen, vigencia o exhaustividad. `sku_not_found` significa no encontrado en ese
corte. El dominio es autosuficiente: no importa `catalog`, `orders`, precios,
composición, readers o runtime. B2B-002 encuadra el consumidor empresarial
posterior; su dependencia no aporta pertenencia, visibilidad o permiso.

## APIs y datos

| API | Entrada | Resultado |
|---|---|---|
| `defineCompanyQuickOrderCatalog` | Snapshot completo | Copia canónica de productos, variantes y SKU |
| `defineCompanyQuickOrderList` | Lista completa | Copia de filas y cantidades en el orden aportado |
| `previewCompanyQuickOrderList` | `{catalog, list}` | Snapshot y lista completos, más resolución por fila |

Todas las entradas son `unknown`. El catálogo y la lista incluyen
`schemaVersion:1`, `source:'fixture'` y perfil explícito. El preview recibe solo
`{catalog,list}` y devuelve `source` y `profile`, sin `schemaVersion` raíz.
El catálogo contiene
`ref`, `capturedAt` y `products:[{id,variants:[{id,productId,sku}]}]`. Los productos
y variantes se ordenan por ID; se valida propiedad e identidad de todo el
snapshot antes de resolver una sola fila. SKU iguales entre identidades se
conservan para representar ambigüedad, incluso dentro de un mismo producto;
este perfil no pretende satisfacer las restricciones de `CatalogEntry` o D1.

La lista contiene `id`, `version`, `origin:'structured'`,
`catalogRef:{ref,capturedAt}` y `lines:[{id,sku,quantityUnits}]`. Cada ID de fila es
único dentro de la lista. Se conserva el orden original, el SKU exacto y la
cantidad, sin agrupar, sumar, eliminar o corregir filas. Una lista vacía y un
catálogo vacío son válidos; un producto presente debe declarar alguna variante.

El preview conserva `source`, `profile`, el catálogo completo normalizado, la
lista completa normalizada y `lines`. Cada resultado lleva `position` derivada
(índice original más uno), la fila íntegra y `diagnostics`. Nunca se acepta una
posición externa contradictoria ni un resultado de resolución ya calculado.

## Identidad y diagnósticos independientes

| Coincidencias exactas | Resultado | Identidad |
|---|---|---|
| Ninguna | `unresolved`, `reason:'sku_not_found'`, `matchCount:0` | `null` |
| Una | `resolved`, `reason:null`, `matchCount:1` | `{productId,variantId}` |
| Dos o más | `unresolved`, `reason:'sku_ambiguous'`, número de coincidencias | `null` |

Se cuentan identidades de variante, globalmente únicas por ID. No se selecciona
la primera coincidencia, una variante predeterminada o una candidata por precio,
estado o cantidad. La ambigüedad no repite miles de candidatos por fila: devuelve
su número e identidad nula; el snapshot completo aparece una sola vez.

Los diagnósticos no cambian resultado, identidad, cantidad u orden:

- `repeated_sku`: aparece en todas las filas cuyo SKU literal está repetido,
  incluso si no se encuentra o es ambiguo. `relatedLineIds` incluye las otras
  filas del mismo SKU en orden de la lista.
- `multiple_variants_for_product`: considera solo filas resueltas. Si un producto
  aparece con al menos dos variantes distintas, se emite en todas sus filas
  resueltas; relaciona las demás filas de ese producto, incluidas repeticiones de
  la misma variante. Las filas ambiguas no se atribuyen a un producto.

El orden de códigos es repetición primero y variantes distintas después. Una
fila no se relaciona consigo misma y cada código aparece como máximo una vez.
No existe un estado agregado de conflicto comercial, aprobación o preparación
para checkout. `resolved` significa exclusivamente identidad única en ese corte.

## SKU literal y cantidades conservadas

La igualdad es exacta sobre el string JavaScript, sensible a mayúsculas,
espacios y composición Unicode. No hay `trim`, casefold, NFC/NFKC, aproximación,
prefijos o equivalencias numéricas. La gramática admite letras, marcas, números,
puntuación, símbolos Unicode y espacio ASCII; exige al menos una letra, número,
puntuación o símbolo y rechaza `Default_Ignorable_Code_Point`. No admite solo
espacios/marcas, tabuladores, saltos, NBSP, controles o surrogates aislados.
El límite es de 1–100 unidades UTF-16, no grafemas o bytes.

Los espacios iniciales/finales son significativos. `KIT-A`, `kit-a` y ` KIT-A`
pueden resolver identidades distintas; `Á-1` y `A` con acento combinante tampoco
se equiparan. Este perfil puede rechazar un literal antiguo de más de 100 unidades
aceptado tras recorte por otra frontera; no lo trunca. No certifica SKU
industriales ni clasifica universalmente emoji. Una futura UI deberá hacer
perceptibles estas diferencias sin cambiar el valor.

Texto como `=A1+1`, `__proto__` o `constructor` sigue siendo dato literal en un
índice `Map`. No se ejecuta, evalúa, exporta como fórmula o resuelve como URL.
No hay parser CSV o coerción de cantidades string en este corte.

`quantityUnits` admite enteros seguros de cero a `Number.MAX_SAFE_INTEGER`,
excluyendo `-0`, fracciones, negativos y coerciones. Cero permanece como intención
explícita y puede tener identidad resuelta; no implica cantidad comercial
satisfecha ni eliminación. Dos filas con `MAX_SAFE_INTEGER` se conservan sin
sumarse, por lo que no se fabrica un total inseguro. No se modifican los límites
runtime de quote 1–99 o negociación/preliminar 1–10.000.

## Límites y validación completa

| Campo | Límite |
|---|---|
| Productos | 0–1.000 |
| Variantes por producto | 1–100 |
| Variantes globales | Hasta 10.000 |
| Filas | 0–100 |
| IDs opacos y SKU literal | Hasta 100 unidades de string, con gramáticas distintas |
| ID de producto | Entero 1–2.147.483.647 |
| ID de variante y versión declarada | Entero positivo seguro |
| Cantidad en unidades | Entero seguro 0–9.007.199.254.740.991 |

Los IDs opacos usan la gramática lowercase del módulo. Cada producto y variante
es único globalmente; `productId` coincide con el padre. Precio, estado,
`default`, stock o campos ajenos son extras inválidos, no datos ignorados.

Se validan records exactos de prototipo permitido y propiedades propias de
datos enumerables, sin accesores, símbolos, instancias o extras. Arrays densos,
copias profundas y congelación de todo DTO. Se normaliza el catálogo entero,
después toda la lista, y solo entonces se compara `ref` y `capturedAt` de forma
exacta. La lista vacía o desconocida no oculta corrupción del resto del snapshot.
No se releen originales después de copiarlos ni se hacen joins sobre referencias
mutables. Las trampas o errores ajenos no filtran payloads.

`capturedAt` es UTC canónico de 24 caracteres con fecha real; admite año 0000
como los metadatos del catálogo existente. No hay fecha de evaluación o reloj.
Las referencias coincidentes no prueban identidad entre snapshots externos: se
usa exclusivamente el catálogo completo recibido en esta llamada. `version` es
metadato declarativo, sin append, CAS, replay o incremento implícito; cambiar el
contenido conservando ID/versión no acredita continuidad de una lista durable.

`CompanyQuickOrderContractError` expone código
`company_quick_order_contract_invalid` y razón cerrada:
`invalid_data`, `duplicate_product`, `duplicate_variant`,
`cross_product_reference`, `duplicate_line_id` o `reference_mismatch`.
El constructor recibe solo la razón; mensajes fijos, sin SKU, IDs, cantidades,
referencias, causas o errores ajenos. Se valida estructura y relaciones antes de
emitir diagnósticos por fila; ambigüedad SKU no es un error estructural.

## Ejemplo de diseño

El fixture acordado contiene diez filas: siete identidades resueltas, una no
encontrada y dos ambiguas. Cuatro filas llevan repetición de SKU y seis el
diagnóstico de variantes distintas de un producto. Una fila con cantidad cero
resuelve explícitamente `KIT-B`; otra conserva `MAX_SAFE_INTEGER`. Las dos filas
`DUP` siguen ambiguas ante dos identidades, sin sumarse o desaparecer. Mayúsculas,
espacios y formas Unicode se conservan. El ejemplo ilustra la semántica del
perfil; los recuentos de verificación se atribuyen por separado abajo.

## Validación y continuidad

**Implementado y verificado localmente; integrado en PR #45 (`4cfef237`), sin despliegue.**
63 focales de dominio y seis de arquitectura verdes; TypeScript focal en dos
archivos sin diagnósticos. Registro/manifiesto/acceso: 122 pruebas (19/73/30).
Revisión independiente: 55.894 aserciones, 123 casos, 1.131 filas, 194 SKU y
60 entradas hostiles, además de máximos; sin P1/P2, efectos, getters o reloj
implícito. Bundle diagnóstico público de 7.049 B/2.566 gzip, con 1.183 B de
constantes históricas puras; sin runtime operativo, no es un cliente emitido.
Check global final: 1.007 archivos sin diagnósticos, 269 suites/4.033 pruebas;
build del 2026-10-04 a las 05:36:26 UTC con 44 HTML, 44 formularios locales y
cero cron. Comparación final contra PR #44: ocho grafos completos, 361 fuentes
seleccionadas, 19 CSS y 62 JavaScript públicos idénticos en nombres, imports,
SHA, bytes y gzip. Worker de 282 archivos: +294 B/+164 gzip; 280 archivos iguales
tras mapear 24 nombres. Los cambios se explican por el registro B2B-008,
companies 1.11.0 y ADR0063, además de metadata generada del manifest; no equivalen
a una demostración de igualdad SSR transitiva completa.
[Informe final R6.8a](../../audits/r6-8a/verification-report.json). No existe nueva UI o QA runtime de R6.8a. El [corte anterior R6.7c](../../audits/r6-7c/verification-report.json),
integrado en PR #44 (`6aade364`), aporta como evidencia heredada 5.076
comprobaciones/108 visitas, ocho superficies a11y y ocho PNG revisadas, E2E
200/200 y hash intacto de 143 tablas/353 filas. No son nuevas ejecuciones de a;
la comparación estática final acota esta herencia, sin una nueva ejecución
HTTP, navegador o DB ni una promesa de equivalencia SSR completa.

R6.8b está implementado y verificado localmente como parser CSV puro, según el
[ADR-0064](0064-entrada-csv-pedido-rapido-fixture.md), integrado en PR #46 (`09161255`)
y sin despliegue: check de 4.099 pruebas y comparación estática cerrados, sin QA
runtime nueva. El histórico del [ADR-0065](0065-historico-pedido-rapido-fixture.md)
está integrado en PR #47 (`372dd221`), sin despliegue; su extensión R6.8d está
verificada localmente como demo de las cuatro entradas, pendiente de integración.
El histórico requiere identidad explícita y corte de origen: resolver un SKU reutilizado no restaura la compra anterior, y
`OrderReader` sin identidad de variante no basta para reconstruirla.

Una posible composición comercial posterior deberá derivar SKU e identidad y el catálogo
empresarial de una sola copia normalizada o validar completamente sus
proyecciones; no basta compartir referencia y fecha. Las APIs actuales de una
variante por producto no deben recibir una selección elegida silenciosamente.
Las cantidades canónicas tampoco son número de cajas: convertirlas exige
división exacta por `unitsPerBox` y `policyRef` actual, sin redondear o ajustar.
Esa ampliación no es requisito de la demo de identidad R6.8d; la siguiente
consolidación R6.9 revisará permisos, dinero y wiki sobre fixtures.

No hay dinero, totales, precio histórico reutilizado, permisos, stock, DDL,
persistencia, cron, servicios o operación real. B2B-008 y R6.8 seguirán parciales
mientras los demás subcortes y la operación permanezcan pendientes. No se declara
completo R6 ni se activan capacidades operativas por este contrato fixture.
