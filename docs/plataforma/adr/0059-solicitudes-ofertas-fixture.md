# ADR-0059 — Solicitudes B2B y revisiones completas de oferta con fixtures

- Estado: accepted; R6.6a implementado y verificado localmente. Integración pendiente, sin activación ni despliegue.
- Fecha: 2026-10-04.
- Módulo: `companies` 1.7.0; dependencia de módulo `platform-configuration`.
- Capacidad: B2B-006 parcial, instalada/inactiva en avanzado/demo, ausente en mínimo/estándar; dependencia única B2B-002 y superficies operativas vacías.
- Perfil: `company-offer-eur-cents-v1`.
- Continuidad: R6.5c integrada en PR #38 (`5cdb5bb`); composición ORD-008 y demo posteriores.

## Contexto y decisión

El [ADR-0038](0038-presupuestos-depositos-transiciones-explicitas.md) ya asigna a
ORD-008 el presupuesto preliminar, sus estados comerciales, pagos por etapas
y conversión explícita. R6.6a cubre otro dato: la solicitud B2B y las revisiones
completas de una oferta antes de ejecutar ese ciclo. No duplica estados
`issued`, `approved`, `paid` o `converted`, ni convierte la revisión declarada
de crédito de R6.5 en aceptación de una oferta.

El artefacto puro vincula directorio, catálogo y solicitud completos, conserva
cada oferta inmutable y permite seleccionar y comparar revisiones explícitas.
La solicitud no contiene dinero. Los importes de la oferta son declarados en
EUR y no se derivan del catálogo o listas de precios, aunque estos se validen
íntegramente. No acreditan precio autorizado, deuda, stock, impuestos o cobro.

`companies` posee la solicitud y negociación fixture; `orders` conserva el
ciclo del presupuesto y `checkout` los enlaces de pago. No se importa ni se
ejecuta la composición D1 existente. La integración futura debe preservar esa
separación: el runtime actual crea presupuestos leyendo precios del catálogo
y no acepta automáticamente precios negociados.

## API pública y artefactos

Dominio implementado: `companies/domain/company-negotiation.ts`, con imports de
los archivos hermanos de directorio y catálogo, exportado por `companies`.

| API | Entrada exacta relevante | Resultado |
|---|---|---|
| `defineCompanyNegotiationRequest` | Solicitud `unknown` | Copia canónica de la solicitud |
| `defineCompanyNegotiation` | Negociación `unknown` | Contexto e historial completos validados |
| `createCompanyNegotiation` | `{id, createdAt, context}` | Versión 1 e historial vacío |
| `appendCompanyOfferRevision` | `{negotiation, context, command}` | `appended`, `replayed` o `conflict` |
| `previewCompanyOfferRevision` | `{negotiation, context, revisionId}` | Snapshot de la revisión seleccionada |
| `compareCompanyOfferRevisions` | `{negotiation, context, beforeRevisionId, afterRevisionId}` | Cambios estructurales y diferencias monetarias |

Se exportan también `COMPANY_NEGOTIATION_LIMITS`,
`CompanyNegotiationContractError` y los DTO del contrato. Todas las APIs
aceptan fronteras `unknown`; no se confía en un objeto por su tipo TypeScript.

La solicitud contiene `schemaVersion:1`, `source:'fixture'`, perfil, `id`,
`version`, `directoryRef:{id,version,capturedAt}`,
`catalogRef:{ref,capturedAt}`, `companyId`, `buyerContactId`, `requestedAt`,
`currency:'EUR'` y `lines:[{productId,variantId,quantityUnits}]`.

El contexto contiene directorio, catálogo empresarial y solicitud completos.
Una oferta contiene `id`, ordinal `revision`, `previousRevisionId`,
`proposedBy:'buyer'|'seller'`, `createdAt`, `expiresAt`, líneas completas con
`unitPriceCents` y `shippingCents`. `proposedBy` es el lado declarado, no una
persona, rol o contacto autenticado; no implica que el comprador realizó una
acción real.

La negociación contiene esquema/fuente/perfil, `id`, `version`, `createdAt`,
contexto e historial `revisions`. El comando de append contiene
`negotiationId`, `expectedVersion` y la revisión completa. No hay estado
comercial, depósito, puerta de conversión, importe pagado o ID de pedido.

## Referencias y alcance de líneas

Se valida todo el directorio y catálogo, incluidos registros, relaciones y
precios no seleccionados. Las referencias de solicitud deben coincidir en
todos sus campos con los artefactos suministrados. Empresa y contacto deben
existir y el contacto pertenecer exactamente a esa empresa. La moneda del
catálogo y solicitud es EUR.

Cada solicitud u oferta admite **una variante explícita por producto**. Producto
y variante existen y la variante es suya; repetir producto es error incluso
con otra variante. No se agrupan duplicados ni se elige una variante por defecto.

La oferta solo puede incluir productos de la solicitud. Puede omitirlos,
reintroducirlos en una revisión posterior, cambiar su cantidad/precio o elegir
otra variante existente del mismo producto. Cada revisión conserva al menos
una línea. Las líneas se ordenan canónicamente por producto.

Empresa/contacto inactivos, producto inactivo o variantes draft/archived siguen
siendo datos descriptivos válidos del contexto. No bloquean conservar una
propuesta sintética, pero tampoco devuelven visibilidad, elegibilidad o permiso
de compra. No se usan políticas de publicación, cantidades, precio o crédito
para conceder una excepción comercial.

Append, preview y comparación exigen igualdad de **todo** el contexto externo
normalizado con el ligado a la negociación. Cambios válidos en la solicitud,
las versiones del directorio o la solicitud, metadatos, contactos o precios
ajenos a las líneas producen
`context_mismatch` antes de replay o comparación de versión. Otro contexto
exige otra negociación con historial vacío; no migra ofertas, aceptaciones,
pagos o decisiones de crédito.

Las referencias y la igualdad íntegra son correlación de datos declarados,
no autenticación, firma o historia durable. No se detecta la reescritura
coherente del artefacto entero por el llamador ni se acredita unicidad global.

## Importes y límites explícitos

| Dato | Perfil técnico |
|---|---|
| Solicitudes por contexto | Una |
| Líneas de solicitud y de cada oferta | 1–100 |
| Revisiones conservadas | 0–20 |
| Versión de negociación | 1–21, exactamente `1 + revisions.length` |
| Cantidad por línea | Unidades enteras 1–10.000 |
| Precio unitario ofertado | 0–1.000.000.000 céntimos |
| Portes declarados | 0–1.000.000.000 céntimos |
| Total de oferta | 1–1.000.000.000 céntimos |
| Producto/variante | IDs positivos; producto hasta 2.147.483.647, variante hasta entero seguro |
| IDs opacos y versiones | Gramática `companies`, 1–100 caracteres; versiones seguras positivas |

El precio **ofertado** no hereda el máximo del precio de catálogo; ese snapshot
conserva su contrato intacto. El límite total admite una unidad cara válida y
rechaza cualquier suma superior. Cantidad cero no se acepta: retirar una línea
se expresa omitiéndola en la siguiente oferta. Precio unitario cero y portes
cero son explícitos y válidos; una oferta con total cero queda fuera del perfil.

```text
lineTotalCents = unitPriceCents × quantityUnits
subtotalCents = suma de lineTotalCents
totalCents = subtotalCents + shippingCents
```

Multiplicación, suma y diferencias usan `BigInt`; se comprueba el rango antes
de convertir a `Number`. No hay redondeo, clamp, descuentos implícitos o
coerciones. Se validan todas las revisiones y la candidata antes de devolver
un conflicto; una suma corrupta no se oculta tras una versión desactualizada.

Subtotal y total son sumas declaradas, no neto/bruto fiscal o base imponible.
Unidades canónicas no son cajas ni acreditan reglas R6.3, stock o comprabilidad.
Este perfil no cambia checkout/quote 1–99 ni agrupa cantidades como el runtime
preliminar. Total positivo hasta 1.000.000.000 solo evita una incompatibilidad
numérica conocida con ORD-008, sin demostrar convertibilidad.

## Tiempo e historial

`requestedAt`, creación de negociación y fechas de oferta son UTC canónico de
24 caracteres, años 0001–9999 y fechas reales. `createdAt` de negociación no
precede a `requestedAt`; cada oferta no precede a la negociación ni a la oferta
anterior. Igualdad de instantes permitida; el ordinal determina el orden.
`expiresAt` es estrictamente posterior a la creación de esa oferta.

La caducidad corresponde a **esa revisión**, no al vencimiento de pago de R6.4.
R6.6a no consulta reloj ni evalúa vigencia o estado expired. Una nueva propuesta
puede ser posterior a la caducidad de la anterior, sin reabrir un presupuesto
ni heredar aceptación. `capturedAt` conserva las fronteras existentes,
incluido año cero, y no se interpreta como vigencia.

Historia completa de 0–20 revisiones, IDs únicos dentro del artefacto y ordinal
exactamente `índice + 1`. La primera tiene predecesor `null`; las demás nombran
el ID de la inmediatamente anterior. Se valida todo el historial, incluso
revisiones no seleccionadas. No se reordena por fecha ni se acepta una versión
calculada diferente de `1+n`.

## Append, replay y conflictos

La precedencia es explícita:

1. Normalizar negociación/historia y contexto completos; validar referencias e igualdad íntegra.
2. Normalizar el comando y candidata: forma, existencia/propiedad, alcance de solicitud, importes y caducidad propia; comprobar `negotiationId`.
3. Si el ID de revisión existe, comparar el comando completo reconstruido: igualdad devuelve `replayed` con el artefacto **actual**; variación válida devuelve `conflict/revision_id_reused`.
4. Con ID nuevo, expectativa distinta devuelve `conflict/version_mismatch`.
5. Con versión actual, comprobar máximo de veinte y ordinal/predecesor/cronología respecto a la cabeza; aplicar una única revisión completa e incrementar versión.

El comando histórico de una revisión se reconstruye como ID de negociación,
`expectedVersion` igual al ordinal de esa revisión y su contenido completo.
No hace falta un segundo commandId. Replay histórico conserva todas las
revisiones posteriores; no vuelve al estado anterior.

Solo revisiones aplicadas consumen ID en el historial. Conflictos no mutan,
registran intentos ni activan reintentos. Expectativa de versión es una
comparación pura, no CAS, bloqueo o idempotencia durable de servidor.

## Preview y comparación

La selección exige un ID existente; no usa última revisión por defecto. El
snapshot conserva contexto completo, referencia de la negociación con su
versión actual y oferta completa con totales de línea, subtotal y total.

Se pueden comparar revisiones no adyacentes, la misma consigo misma o en orden
inverso. La clave de línea es producto: `added`, `removed` o `changed`. Cambiar
variante dentro del producto es un cambio, incluso si el importe no varía.
Para cambios se listan campos en orden `variantId`, `quantityUnits`,
`unitPriceCents`; altas/bajas conservan una contraparte `null` y lista vacía.

Los campos de oferta comparados son `proposedBy`, `createdAt`, `expiresAt` y
`shippingCents`. IDs/ordinal/predecesor siguen visibles en snapshots pero no
se etiquetan como cambio comercial. Deltas de subtotal, portes y total son
`after - before`, firmados exactos; comparar el mismo ID da cambios vacíos y
ceros. Un diff no es descuento, aceptación, envío o explicación comercial.

## Fronteras y errores

Objetos exactos de datos propios enumerables, arrays densos y límites completos;
sin getters, símbolos, propiedades ocultas, prototipos ajenos o extras
`undefined`. Copias canónicas profundamente congeladas, sin releer originales;
solo se serializan datos ya normalizados para correlación.

`CompanyNegotiationContractError` usa código `company_negotiation_contract_invalid`
y motivo cerrado: `invalid_data`, `context_invalid`, `duplicate_line`,
`unknown_reference`, `cross_company_reference`, `cross_product_reference`,
`reference_mismatch`, `context_mismatch`, `unexpected_offer_product`,
`invalid_history`, `invalid_chronology`, `amount_out_of_range`, `history_limit`
o `unknown_revision`. Constructor por motivo; mensajes fijos sin IDs, importes,
datos de contacto, causas o errores ajenos. Dependencias y Proxy se redactan.

El contexto completo puede contener datos de directorio. No se añaden logs,
endpoints o persistencia; una futura demo deberá proyectar etiquetas sintéticas
y retirar referencias privadas. La consistencia de una oferta no prueba
identidad, autoría o autorización comercial.

## Registro, validación y continuidad

B2B-006 queda parcial e instalada/inactiva en avanzado/demo, con única
dependencia B2B-002, que ya depende de B2B-001. `companies` 1.7.0 mantiene
`platform-configuration`; no depende de ejecutar ORD-008, pricing, cantidades,
crédito, pagos o permisos. No hay UI, rutas, DDL, jobs, reloj implícito,
proveedores, reservas o cambios de checkout/ledger.

**Implementado y verificado localmente el 2026-10-04; integración pendiente y sin despliegue.**
[Informe final R6.6a](../../audits/r6-6a/verification-report.json). `pnpm check`: 987 archivos
sin diagnósticos, 262 suites/3.745 pruebas. Cincuenta pruebas de dominio,
seis de arquitectura y 120 de registro/manifest/acceso; build con 44 HTML,
44 formularios locales y cero cron.

Revisión independiente: 10.245 comprobaciones, con 940 casos monetarios
(266 válidos/674 rechazados), 21 historiales, 496 transiciones, 400 comparaciones,
210 replays, 630 conflictos de ID, 76 cambios de contexto y 88 fronteras
adicionales. Cero P1/P2, efectos, getters o reloj implícito. Bundle público de
diagnóstico: 20.138 B/5.659 gzip; conserva constantes históricas de collection
(113 B) y credit (168 B), sin su lógica ni imports operativos. Es una sonda
pública, no una medición de assets emitidos por Astro.

La última demo verificada es R6.5c/PR #38:
[verificación](../../audits/r6-5c/verification-report.json), check de 985 archivos,
261 suites/3.694 pruebas, navegador 6.368/108 visitas principales, E2E192, ocho
superficies a11y sin hallazgos y ocho capturas. Su base QA tuvo 143 tablas/353
filas y hash antes/después idéntico
`9cbfc811cfc4296515a403d395875a43bfa26aff0c9c9b08be0804b15bbf6eca`.
Es herencia de ese corte; no nueva ejecución de HTTP, navegador o DB en a.
La comparación final mantiene seis grafos JavaScript completos y 355 fuentes
explícitas de UI/rutas/layout/middleware/demo idénticos a PR #38: nombres,
imports, SHA, bytes y gzip iguales. De 19 CSS, 18 siguen iguales; el CSS global
pasa de 97.025 a 97.200 B (17.622 a 17.629 gzip) al añadir solamente la utilidad
`.ordinal` por el escaneo de Tailwind. No tiene consumidor en las 355 fuentes;
al retirar esos 175 B se recupera el SHA anterior exacto. Es un delta estático
verificado, sin nueva ejecución de navegador/HTTP/DB ni prueba del grafo SSR
transitivo completo.

R6.6b compondrá una revisión explícita con APIs públicas de ORD-008. Congelará
oferta y parámetros de presupuesto completos: ID compatible con el patrón
propio de `orders`, depósito, puerta de conversión y fechas explícitos. Cambio
de oferta o parámetros exige otro artefacto y nueva emisión/aceptación; no
hereda pagos o revisión de crédito. La versión del contenedor de negociación
identifica el corte congelado y es distinta de la edición comercial de la
oferta y de la versión del ciclo ORD-008. Añadir otra oferta en una copia
posterior no retargetea ni invalida inspeccionar el artefacto histórico con su
binding original. `expiresAt` procede de esa oferta, sin otro plazo inferido.
Usará create/issue/approve/expire/cancel existentes, sin recrear sus estados o
aritmética; schema/API de b aún son diseño pendiente de implementación. Importar
APIs públicas puras no activa ORD-008 ni sus rutas o consumidores operativos.

R6.6c será la demo posterior. Ningún corte fixture crea enlaces alojados,
confirma pagos ficticios como hechos financieros, fabrica orderId ni ejecuta
conversión/reserva. Autorización, stock actual, precio respetado, fiscalidad,
concurrencia durable y operación real siguen como alcances separados.
