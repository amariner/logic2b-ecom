# ADR-0060 — Artefacto preliminar fixture ligado a una oferta histórica

- Estado: accepted; R6.6b implementado y verificado localmente. Integrado en PR #40 (`ce295c6`), sin activación ni despliegue.
- Fecha: 2026-10-04.
- Composición: `src/composition/company-preliminary-order.ts`.
- Módulo registrado: `companies` 1.8.0, dependencia `platform-configuration`.
- Capacidad: B2B-006 parcial, instalada/inactiva en avanzado/demo, ausente mínimo/estándar; conserva B2B-002 como única dependencia y superficies operativas vacías.
- Perfil: `company-preliminary-fixture-v1`.
- Continuidad: R6.6a integrada en PR #39 (`108480f8`), sin despliegue; R6.6b integrado en PR #40 (`ce295c6`) y demo R6.6c verificada localmente, integrada en PR #41 (`424123fe`) y sin despliegue.

## Contexto y decisión

El [ADR-0059](0059-solicitudes-ofertas-fixture.md) conserva solicitudes y ofertas
completas, con historia inmutable y comparaciones. El
[ADR-0038](0038-presupuestos-depositos-transiciones-explicitas.md) ya asigna a
`orders` el ciclo del presupuesto preliminar. R6.6b conecta ambos contratos
mediante una composición pura: congela una oferta histórica y parámetros
explícitos, y reconstruye el preliminar usando los reducers públicos ORD-008.

No crea otra máquina de estados ni modifica el runtime de presupuestos.
`approve` declara una transición de simulación; no acredita identidad,
representación, aceptación legal, crédito, permiso de compra o stock. El lado
`proposedBy`, los roles descriptivos y un expediente de crédito `accepted` no
provocan ninguna transición.

`paymentStatus:'unpaid'` y `paidCents:0` proceden del borrador simulado, que no
recibe acciones de pago. No son evidencia financiera, saldo real o prueba de
impago. No hay conversión, reserva, cobro ni ID de pedido inventado.

## Propiedad y dependencias

La composición importa `defineCompanyNegotiation` y
`previewCompanyOfferRevision` por la API pública de `companies`, y
`createPreliminaryOrderDraft`, `issuePreliminaryOrder`,
`approvePreliminaryOrder`, `expirePreliminaryOrder` y
`cancelPreliminaryOrder` por la API pública de `orders`.

Los dominios y barrels existentes conservan sus propietarios. Las nuevas APIs
se exportan desde el archivo de composición; no hay export cruzado desde un
módulo al otro. No se importa `preliminary-order-operations`, D1, readers,
`runtimePlatform`, checkout, enlaces alojados o crédito como autoridad.

La dependencia de código puro no activa ORD-008 ni sus rutas, pagos,
inventario o consumidores. B2B-006 conserva B2B-002 como dependencia del
contrato parcial instalado y `companies` solo depende de configuración de
plataforma. No cambian capacidades, flags, presets o superficies operativas.

## APIs y datos

Todas las entradas son `unknown` y de forma exacta.

| API | Entrada | Resultado |
|---|---|---|
| `defineCompanyPreliminaryBinding` | Binding completo | Copia canónica y términos validados por ORD-008 |
| `defineCompanyPreliminaryArtifact` | Artefacto completo | Copia validada tras reconstruir toda su historia |
| `createCompanyPreliminaryArtifact` | `{id, createdAt, binding}` | Snapshot inicial, borrador con versión 1 |
| `previewCompanyPreliminaryArtifact` | `{artifact}` | Snapshot histórico autocontenido |
| `applyCompanyPreliminaryAction` | `{artifact, binding, command}` | `applied`, `replayed`, `conflict` o `blocked` |

El binding contiene `negotiation` completa, `revisionId` explícito y
`terms:{preliminaryId,depositCents,conversionGate}`. La negociación incluye
directorio, catálogo, solicitud y todas las ofertas de ese corte. No se acepta
un importe aislado o una referencia como sustituto de ese contenido.

El artefacto contiene `schemaVersion:1`, `source:'fixture'`, perfil, `id`,
`createdAt`, binding y `actions`. No admite `order`, estado, versión lifecycle
o aceptación suministrados por el llamador. Cada comando conserva
`id`, `artifactId`, `expectedVersion`, `action` y `occurredAt`.

El snapshot devuelve fuente/perfil, artefacto íntegro, `offer` obtenido por la
API de negociación, `order` reconstruido mediante ORD-008 y `lastOccurredAt`.
Este último es la fecha de la última acción aplicada o `createdAt` si no hay
acciones. El DTO técnico contiene datos completos del directorio; una futura
UI deberá proyectar solo etiquetas y valores sintéticos necesarios, sin
referencias o identidades privadas.

## Corte histórico y tres versiones distintas

La normalización captura una copia completa de la negociación. La selección
usa esa copia y su propio contexto, sin volver a leer los objetos originales.
La versión del contenedor de negociación identifica el corte congelado;
`offer.revision` identifica la edición comercial seleccionada; `order.version`
pertenece al ciclo ORD-008. No son intercambiables.

El artefacto puede seleccionar una oferta anterior a la última del corte.
Añadir ofertas a otra copia posterior no invalida inspeccionar o continuar el
artefacto anterior con su binding histórico. No existe selector `latest`,
consulta de versión viva ni actualización automática de precio o caducidad.

`apply` normaliza y compara **todo** el binding externo antes de replay/CAS.
Un corte ampliado difiere aunque conserve idéntica la oferta seleccionada:
produce `binding_mismatch`. El llamador usa el binding histórico original para
continuar ese artefacto. Otra oferta, contexto, corte o cambio de términos
exige un artefacto nuevo con historial vacío; no se transfieren emisión,
aprobación, fechas o versiones.

La igualdad canónica demuestra consistencia declarada, no firma, autoría,
unicidad global, aceptación real o concurrencia durable. No pretende detectar
que el llamador reescriba coherentemente todo el JSON.

## Parámetros explícitos y límites

`preliminaryId`, `depositCents` y `conversionGate` son explícitos. La composición
deriva EUR, total y `expiresAt` de la oferta normalizada; no admite overrides,
recotización de catálogo o un plazo inventado. El constructor ORD-008 valida
depósito respecto al total y exige importe positivo si el gate es `deposit`.

| Dato | Límite del perfil |
|---|---|
| Artefactos por llamada / acciones por aplicación | Uno / una |
| Acciones aplicadas conservadas | 0–3 |
| IDs de artefacto/comando | 1–100, gramática canónica de `companies` |
| `preliminaryId` | 1–200, gramática propia de ORD-008, sin puntos |
| Depósito | Entero seguro 0–1.000.000.000, sin `-0`; relación con total validada por ORD-008 |
| Total | 1–1.000.000.000 céntimos EUR, obtenido de la oferta |
| `expectedVersion` | Entero seguro 1–1.000.000.000; versión reconstruida 1–4 |
| Corte de negociación | Conserva todos los límites del ADR-0059, incluidas veinte ofertas |

El ID preliminar no se deriva del ID de negociación ni se corrigen sus puntos
automáticamente: sus gramáticas son diferentes. Los gates admitidos son
`approval`, `deposit` y `full_payment`; conservarlos no ejecuta la conversión.

## Tiempo explícito

`createdAt` y `occurredAt` son UTC canónicos de 24 caracteres, con milisegundos
y `Z`, fechas reales de los años 0001–9999. No hay reloj implícito, timers o
fechas generadas. Los metadatos `capturedAt` del contrato a conservan su
semántica, incluido el año 0000; no deciden vigencia.

La creación es igual o posterior a la fecha de la última revisión **incluida
en el corte**, aunque se seleccione una oferta anterior. Cada acción aplicada
es igual o posterior a la creación y a la anterior. La comparación temporal
con la última acción ocurre después de replay/CAS para admitir replays
históricos sin reescribir sus fechas.

Crear o inspeccionar un borrador después de la caducidad es válido y no
concede derecho a emitirlo. ORD-008 exige `issue`/`approve` estrictamente antes
de `expiresAt`; en igualdad ya los rechaza. `expire` exige borrador o emitido
y fecha igual o posterior a la caducidad. Un aprobado no pasa a expirado por
inspeccionarlo o por el transcurso del tiempo.

`cancelPreliminaryOrder` no recibe fecha. El wrapper conserva `occurredAt`
para la secuencia y delega la decisión al reducer: puede cancelar un borrador,
emitido o aprobado sin pagos, también después de caducar, sin autoexpirarlo.
La caducidad de oferta no es el vencimiento de pago R6.4.

## Historia reconstruida y resultados

El constructor público crea el borrador; después se recorren las acciones
completas en orden. Cada ID es único dentro del artefacto, `artifactId` coincide,
`expectedVersion` corresponde al estado previo y la fecha no retrocede. Se
invoca el reducer público de cada acción; un rechazo dentro de la historia
es un error de historia, no un bloqueo benigno.

Solo acciones aplicadas se guardan. Replay, conflicto o bloqueo no consumen
ID, versión o fecha. La ruta legal más larga de este perfil es
`issue → approve → cancel`, tres acciones. No se conserva una tabla comercial
alternativa. Si una evolución futura del reducer aceptase otra transición,
este perfil no se amplía implícitamente: verifica el límite y falla de forma
cerrada.

Tras crear o aplicar se verifican invariantes: estado de salida
`draft|issued|approved|expired|cancelled`, nunca `converted`; pago
`unpaid`/cero, referencias de pedido nulas, términos y dinero inalterados y
versión incrementada exactamente una vez por acción. Es validación de salida,
no otra autoridad de transiciones. Un resultado incompatible se rechaza, no
se repara ni se convierte en bloqueo.

La precedencia de `apply` es:

1. Reconstruir todo el artefacto, incluidas referencias, dinero e historia.
2. Normalizar el binding externo completo y exigir igualdad.
3. Normalizar comando y referencia al artefacto; no comparar aún su fecha con la última acción.
4. Si su ID existe, payload idéntico devuelve `replayed` con el snapshot actual; diferencia válida devuelve `command_id_reused`.
5. Con ID nuevo y versión distinta, devolver `version_mismatch`.
6. Con versión coincidente, validar cronología e invocar el reducer de la nueva acción.
7. Solo un `RangeError` del reducer de esa acción produce `blocked/transition_not_allowed`. Verificar invariantes fuera de ese catch y conservar la acción si es válida.

No se interpretan mensajes legacy para inventar motivos comerciales. Un fallo
inesperado o de invariantes produce error fijo; no reintento automático.

## Fronteras y errores

La composición acepta solo records simples con campos propios exactos,
enumerables y de datos, arrays densos y números seguros. Rechaza getters,
símbolos, campos ocultos o extra, prototipos ajenos, `-0`, fracciones y valores
no finitos. Copia y congela profundamente antes de entregar DTO tipado a los
reducers. Una mutación tardía del input no altera las copias ya normalizadas.

`CompanyPreliminaryContractError`, código
`company_preliminary_contract_invalid`, usa motivos cerrados:
`invalid_data`, `offer_invalid`, `terms_invalid`, `binding_mismatch`,
`reference_mismatch`, `invalid_history`, `invalid_chronology`,
`history_limit` y `reducer_failure`. Mensajes fijos sin importes, IDs, contacto,
causas o textos ajenos; incluso la introspección de errores hostiles se redacta.

No se llaman `nextPreliminaryOrderPayment`,
`applyConfirmedPreliminaryOrderPayment` o `convertPreliminaryOrder`. No hay IO,
entorno, D1, storage, red, jobs o efectos de importación.

## Validación y continuidad

**Implementado y verificado localmente el 2026-10-04; integrado en PR #40 (`ce295c6`) y sin despliegue.**
[Informe final R6.6b](../../audits/r6-6b/verification-report.json). `pnpm check` final:
989 archivos sin diagnósticos, 263 suites/3.789 pruebas, build con 44 HTML,
44 formularios locales y cero cron. Focales: 44 composición, 50 de regresión
de negociación, seis arquitectura y 120 registro/manifest/acceso.

Revisión independiente: 9.093 comprobaciones (9.031 de protocolo y 62 de
delegación), 36 historiales, 1.696 transiciones, 68 replays, 204 conflictos,
22 cambios de binding, 18 términos y 36 salidas mutadas de reducers. Sin
P1/P2, efectos, getters o reloj implícito. El diagnóstico de composición pública
mide 31.399 B/8.356 gzip; no es un cliente emitido por Astro. Conserva pequeñas
constantes históricas, incluidas tablas/vocabularios de archivos de
infraestructura D1; no conserva funciones de readers, consultas, adaptadores
D1 o factories de contexto de eventos. La presencia de esos datos no acredita
acceso a DB ni implica que todos los archivos de infraestructura desaparezcan.

La importación pública de `orders` requiere dos anotaciones `/* @__PURE__ */`
en la construcción de factories de `composition/event-context.ts`. Esas
factories devuelven closures sin consultar reloj o IDs; las anotaciones
permiten eliminar del bundle el contexto de eventos no utilizado. No cambian
APIs ni ejecutan eventos. La revisión final confirma su eliminación y una
sonda adicional solo de importación da cero efectos/reloj implícito, contabilizada
aparte del oráculo. La comparación de **todos los 58 JavaScript públicos**
emitidos confirma rutas y SHA idénticos a PR #39: 352.473 B y suma de gzip de
116.299 B. También son idénticos los seis grafos completos, 355 fuentes
explícitas de superficie y 19 CSS.

El análisis estático del Worker conserva ambas factories usadas y sus
19 archivos consumidores mediante imports nombrados. La implementación de
factories mantiene su SHA. Tras normalizar hashes de chunks, el incremento
de 92 B se explica por las dos anotaciones PURE (+32) y el registro de
`companies` 1.8.0/enlace ADR0060 (+60). No se afirma equivalencia completa del
grafo SSR ni una nueva ejecución HTTP o de Worker.

La comparación de b usa PR #39 como baseline. El último corte
de código a está en su [informe](../../audits/r6-6a/verification-report.json):
987 archivos sin diagnósticos, 262 suites/3.745 pruebas y revisión 10.245 sin
P1/P2. Conservó seis grafos JS/355 fuentes iguales a PR #38 y documentó la
única utilidad CSS `.ordinal` sin uso (+175 B/+7 gzip); no se debe afirmar que
los 19 CSS de a eran idénticos.

La última interacción real pertenece a
[R6.5c/PR #38](../../audits/r6-5c/verification-report.json): navegador
6.368 comprobaciones/108 visitas principales, E2E192, ocho superficies a11y
sin hallazgos y ocho PNG revisadas. Su base QA tuvo 143 tablas/353 filas con
hash antes/después idéntico
`9cbfc811cfc4296515a403d395875a43bfa26aff0c9c9b08be0804b15bbf6eca`.
Es evidencia heredada, no nuevas ejecuciones de HTTP, navegador o DB en b.

## R6.6c — Demo verificada localmente

**R6.6c — Demo «Ofertas y presupuesto» está implementada y verificada localmente**,
rama `codex/company-negotiation-demo`, con los contratos de este ADR y del ADR-0059.
Ruta `/demo/admin/presupuestos-empresa`, grupo Clientes después de Crédito.
Dos zonas separan comparar revisiones de simular un presupuesto: tres pares
de comparación, tres ofertas y cuatro momentos UTC cerrados. La comparación
no cambia el presupuesto; elegir otra oferta lo elimina y exige crear otro
borrador. Cambiar fecha conserva historia y nunca aplica una transición.

Términos fijos visibles: anticipo ilustrativo de 20,00 € y condición declarada
de conversión por anticipo, sin cobros ni conversión. Crear borrador es explícito;
«Simular emisión/aprobación/caducidad/cancelación» usa las APIs reales de b.
Disponibilidad calculada con probes descartados, sin tabla alternativa de
estados. Sin entradas libres de dinero, cantidades, PII o IDs; proyección
sin artefacto/contexto/refs privados, memoria local y reset/recarga al inicio.

R6.6b está integrado en PR #40 (`ce295c6`), sin despliegue. B2B-006 sigue
parcial instalada/inactiva; operación de pedido, pago y conversión pendientes.
Fuente congelada: 25 pruebas de modelo y seis de arquitectura verdes;
regresión de auth ocho. Revisión independiente final: 105.487 comprobaciones,
1.008 vistas estructurales, 150 historiales, 4.032 acciones, 2.016 cambios de
oferta y 276 retrocesos; cero P1/P2. Bundle de diagnóstico 47.337 B/12.394 gzip,
no cliente emitido. Check global final: 993 archivos sin diagnósticos,
264 suites/3.814 pruebas, 44 HTML/44 formularios locales y cero cron.
QA final nueva: navegador 9.068 comprobaciones, 72 visitas iniciales
(36 por tamaño), 24 creaciones (12 por tamaño) y recorridos adicionales;
ocho superficies a11y sin errores/avisos, ocho PNG revisadas y E2E196/196.
Las 1.008 vistas estructurales de la sonda son una medición separada.
Cliente emitido: cuatro archivos, 57.551 B/17.134 gzip; entrada 43.149 B/11.944 gzip,
sin imports externos. Inicio sin raíz: cero efectos, una consulta DOM y
56 fechas explícitas; no sustituye la interacción de navegador. Guía separada:
15.200 B/6.321 gzip, incremento de 21 B/7 gzip por la ruta en su allowlist.
El módulo no efectúa peticiones, escrituras, timers, beacons ni abre ventanas;
los efectos propios de la guía y el rAF del shell están contabilizados aparte.
Worker/Chrome detenidos; hash nuevo antes/después idéntico de 143 tablas/353 filas:
`9cbfc811cfc4296515a403d395875a43bfa26aff0c9c9b08be0804b15bbf6eca`.
**Disponible y verificada localmente en el repositorio; integrada en PR #41 (`424123fe`),
sin despliegue ni activación operativa.** [Informe final R6.6c](../../audits/r6-6c/verification-report.json).

La oferta elegida conserva su total y caducidad como datos de OFERTA. Antes
de crear, `preliminary:null` implica ausencia de estado/importes/fechas/historia
DEL presupuesto. La etiqueta es «Oferta para el presupuesto» hasta crear;
«Presupuesto basado en…» se reserva para el artefacto existente. Cambiar el
par de comparación conserva exactamente ese presupuesto, incluso si muestra
otras ofertas. Una parte ausente de la comparación se muestra sin importe,
no como cero.

Cuatro momentos visibles cubren el 3 de octubre a las 14:00 UTC, los límites
del 10 y 11 de octubre a las 12:00 UTC y el 12 de octubre a las 12:00 UTC de
2026. No dependen del reloj real. Momentos anteriores a la creación o última
acción quedan deshabilitados; igualdad temporal es válida. La disponibilidad
de acciones se obtiene aplicando comandos deterministas sobre copias mediante
la API b y descartando esos resultados. Solo una acción explícita aplicada
se conserva; probes y bloqueos no generan historial ni cambian fechas.

La proyección entrega etiquetas sintéticas, importes, fechas y claves UI
cerradas. No serializa negociación, contexto, binding, identidades de contacto,
refs, IDs de comando, contador o versión del ciclo. Estado «Aprobación simulada»
no concede aceptación legal, crédito, compra ni conversión. SSR inicial inerte,
controles deshabilitados sin JavaScript y gate estricto manifest demo AND entorno
DEMO_MODE=true; reset y recarga vuelven a selección inicial sin storage.

La validación final recorre 36 combinaciones sin artefacto por viewport y doce
creaciones por viewport, separadas de recorridos legales posteriores. Las ocho
PNG y superficies a11y cubren estado inicial, oferta histórica aprobada consultada
tras la caducidad, borrador nuevo de otra oferta sin acciones transferidas y
caducidad explícita, a 1440/375. Frontend revisó las ocho capturas y raíz cuatro;
no hay hallazgos pendientes. El aviso temporal identifica la opción deshabilitada,
sin confundirla con el instante seleccionado. Las vistas y acciones de la sonda
independiente no se atribuyen a visitas o clics de Chrome.

Los grafos de Catálogo y Cantidades cambian por extracción de código compartido;
la revisión estructural conserva declaraciones y referencias, sin afirmar igualdad
binaria ni equivalencia SSR completa. La QA interactiva y E2E de este corte son
nuevas y se distinguen de los análisis de assets y del histórico de a/b.

R6.7a está implementado, verificado localmente e integrado en PR #42 (`1b78347`), según el
[ADR-0061](0061-referencia-po-fixture.md): referencia PO declarada, vinculada al
corte completo de negociación y oferta histórica, sin preliminar o lifecycle
comercial nuevo. Número legible, emisor correlacionado y token documental
opcional; `declared`/`not_provided` describe lo aportado y no acredita existencia
de documento. `recordedAt` fecha la asociación declarada, no emisión o recepción.
La versión es declarada por el llamador, sin prometer historia durable. No hay
importe propio, factura fiscal, proveedor elegido o saldo real. PO documental,
factura y conciliación operativas siguen como alcances separados. El runtime de presupuestos actual recotiza catálogo; estas demos
no prueban conversión de precios negociados ni resuelven autorización, stock,
fiscalidad, concurrencia durable, pago o pedido operativo. R6.6/B2B-006 siguen
parciales.
