# ADR-0062 — Evidencia documental comercial con adaptador fixture

- Estado: accepted; R6.7b implementado y verificado localmente; integrado en PR #43 (`feff0a27`), sin despliegue.
- Fecha: 2026-10-04.
- Dominio: `src/modules/companies/domain/company-document-evidence.ts`.
- Puerto: `src/modules/companies/application/company-document-adapter.ts`.
- Adaptador: `src/modules/companies/infrastructure/fixture-company-document-adapter.ts`.
- API pública: `src/modules/companies/index.ts`.
- Módulo: `companies` 1.10.0, dependencia `platform-configuration`.
- Capacidad: B2B-007 parcial, instalada/inactiva avanzado/demo, ausente mínimo/estándar; dependencia B2B-006 y superficies operativas vacías.
- Perfil: `company-commercial-document-evidence-v1`.
- Continuidad: R6.7a integrado en PR #42 (`1b783473`), sin despliegue.

## Contexto y decisión

El [ADR-0061](0061-referencia-po-fixture.md) conserva una referencia PO declarada
y la oferta histórica íntegra. R6.7b añade una consulta completa, un puerto y un
adaptador de casos sintéticos para observar datos de un documento comercial y
compararlos con lo declarado. No consulta proveedores ni emite documentos.

Se separan tres conceptos: la referencia PO aportada, los datos observados del
documento y su comparabilidad. `observed` solo describe un corte con documento;
no hay resultado global conciliado, aprobado o autorizado. La cobertura
`complete` se limita a esa única consulta/documento, no acredita libro contable,
autenticidad, ausencia de movimientos posteriores o saldo actual.

`document.companyId` es la empresa **compradora** a la que el documento declara
estar asociado. Se compara con la empresa de la solicitud ligada; nunca designa
al emisor o proveedor fiscal de una factura. No verifica emisor legal, VAT,
identidad, pertenencia ni permisos.

El [ADR-0027](0027-documentos-operativos-no-fiscales.md) conserva el tratamiento
fiscal externo. No se invoca ORD-012, se fabrica un pedido pagado o se convierte
un presupuesto. B2B-010, ORD-008 y ORD-012 no se instalan ni activan por este
contrato; tampoco se añade factura, cobro, crédito o stock como autoridad.

## Propiedad y APIs

El dominio reutiliza el contrato hermano `company-purchase-order`. Puerto y
factory pertenecen al mismo módulo, sin importar composición, `orders`,
`taxes`, `currencies`, ledger, readers o runtime. `read` consulta los casos
inyectados en memoria; no significa una lectura de red, DB o proveedor.

| API | Entrada | Resultado |
|---|---|---|
| `defineCompanyDocumentRequest` | Consulta completa | Copia normalizada de cabecera y declaración PO |
| `defineCompanyDocumentResponse` | Respuesta completa | Envolvente y evidencia/ausencia validadas |
| `evaluateCompanyDocumentEvidence` | `{request, expectedAdapterId, evaluatedAt, response}` | Observación y comparaciones, o desconocido explícito |
| `createFixtureCompanyDocumentAdapter` | `{adapterId, cases}` | Puerto fixture síncrono congelado con `read(request)` |

Las entradas son `unknown`. El puerto expone `source:'fixture'`, `adapterId` y
`read(request:unknown):CompanyDocumentResponse`. No tiene credenciales, reloj,
refresh, async, generación de IDs o efectos operativos.

La gramática PO se comparte mediante el helper privado
`company-purchase-order-number.ts`: solo predicado y límite de 120 unidades
UTF-16. El contrato a conserva su wrapper de error, API, DTO y rechazos; el
helper no se exporta por el barrel. Se exige su regresión sin cambiar expectativas.

## Consulta, respuesta y resultado

La consulta contiene `schemaVersion:1`, `source:'fixture'`, perfil, `id` y
`declaration` PO **completa**, incluido el binding histórico íntegro. No acepta
oferta, importe esperado o binding alternativo suministrados aparte. La oferta
esperada se deriva mediante las APIs reales de a sobre copias normalizadas.
`evaluatedAt` no forma parte de la consulta: reevaluarla no crea evidencia nueva.

Toda respuesta contiene `source:'fixture'`, `adapterId` y la consulta completa.
La rama `outcome:'unavailable'` admite `not_configured|unavailable|unsupported`,
sin evidencia, referencia, fecha o documento inventados. La rama `evidence`
contiene `ref`, `observedAt`, `coverage` y `document`:

- `coverage:'incomplete'` exige `document:null`; no se completan importes parciales.
- `coverage:'complete'` admite un documento o `null`; el segundo significa no
  aportado en ese corte, no inexistencia externa demostrada.

El documento contiene `reference`, `companyId`, `purchaseOrderNumber` y
`commercialAmount`. Los últimos tres admiten `null` explícito. El token
`reference` del documento comercial es distinto del soporte opaco
`declaration.purchaseOrder.documentReference`; no se comparan como iguales.
La ausencia de soporte PO no impide por sí sola comparar un documento.

La evaluación conserva fuente/perfil, adaptador esperado, consulta íntegra,
`evaluatedAt`, datos esperados y `evidenceMetadata` legítimos o `null`.
Con `outcome:'observed'` entrega `observation:{asOf,document}` y comparaciones
independientes de empresa, PO e importe. Con `outcome:'unknown'`, ambas son
`null`; la razón distingue ausencia de respuesta, no configurado, indisponible,
no soportado, observación futura, cobertura incompleta y documento no aportado.
No devuelve la respuesta bruta como vía lateral para exponer datos desconocidos.

Este resultado es un artefacto técnico autocontenido, no un DTO público mínimo:
conserva la consulta completa. La futura UI tendrá una proyección específica.

## Correlación antes de interpretar

La consulta y el adaptador de la envolvente son datos contractuales. Se
normaliza toda la respuesta, incluidos documentos futuros y todas las ramas,
antes de comparar `adapterId` y la consulta canónica completa. Una envolvente
ajena o corrupta es un error; no se oculta como `unknown`.

La igualdad incluye ID, versión, número, soporte y fecha de la declaración,
empresa, selección, contexto y todas las revisiones históricas. No basta con
comparar referencias o totales. Se construye el resultado desde copias capturadas,
sin releer entradas originales tras introspecciones que puedan modificarlas.

En una envolvente correcta, los campos observados sí pueden declarar otra
empresa compradora o PO: son discrepancias descriptivas. Una empresa observada
sintácticamente válida no tiene que pertenecer al directorio. No hay búsqueda
aproximada, reasociación por importe/VAT/roles ni reparación silenciosa.

## Comparación comercial y ausencia

`commercialAmount` es `null` o exactamente
`{basis:'bound_offer_total_as_declared',currency:'EUR',amountCents}`. El literal
expresa que el fixture declara la misma magnitud comercial que el total de la
oferta ligada, incluidas líneas y portes tal como se declararon. Es metadato
sintético; no valida a un proveedor ni representa `invoice.total` fiscal.
Si esa magnitud no está establecida, debe ser `null`: no se reutiliza un total
fiscal, otra moneda, impuestos o descuentos inferidos.

La empresa y el número PO se comparan literalmente con `matches|differs`.
Un valor esperado u observado ausente produce `unknown` con razón explícita;
dos `null` no son una coincidencia. El importe esperado de la oferta se conserva
aunque no se declare PO.

La comparación de importe aplica esta precedencia:

1. Empresa observada no aportada.
2. Empresa observada distinta.
3. PO esperada no aportada.
4. PO observada no aportada.
5. Números PO distintos.
6. Magnitud comercial no aportada.
7. Solo si se superan esos casos, diferencia exacta observado menos declarado.

Los seis primeros casos producen `unknown`, conservando importe esperado y
poniendo observado, `asOf`, delta y posición de **esa comparación** en `null`.
El documento observado puede conservar su cifra propia como dato, pero no se
atribuye a esta compra. La futura vista debe usar `comparisons.amount` para toda
comparación monetaria y no calcularla a partir del documento bruto.

El resultado comparable usa `deltaCents` y
`below_declared|equal_declared|above_declared`, con `asOf` de la observación.
Se calcula mediante BigInt y rango seguro antes de convertir a Number, sin
redondeo, tolerancia o clamp. La oferta aporta 1–1.000.000.000 céntimos;
el observado admite 0–`Number.MAX_SAFE_INTEGER`, rechazando `-0`, fracciones,
negativos o valores inseguros. Un cero observado explícito y comparable es
válido; no acredita pago, devolución, factura gratuita o deuda.

## Tiempo explícito y metadatos legítimos

`observedAt` y `evaluatedAt` son UTC canónicos de 24 caracteres, años 0001–9999,
con fechas reales y milisegundos. Los metadatos heredados de a conservan sus
fronteras. No hay reloj implícito, TTL o caducidad universal.

Una observación futura respecto a la evaluación produce `future_observation`,
antes de valorar cobertura o ausencia documental. En igualdad ya puede ser
observable. Una fecha observada anterior a la propuesta o asociación PO se
permite como corte declarado; no prueba emisión o recepción de documento.
Reevaluar después conserva `asOf`, sin refrescar o rotular saldo actual.

Con evidencia futura, incompleta o sin documento se conservan solo
`ref/observedAt/coverage` como metadatos observados legítimos; observación y
comparaciones siguen en `null`. La respuesta ausente o indisponible no tiene
metadatos de evidencia. Ningún desconocido se sustituye por cero o impago.

## Límites, normalización y errores

`COMPANY_DOCUMENT_EVIDENCE_LIMITS` limita IDs a 100 y el importe observado a
`Number.MAX_SAFE_INTEGER`. `MAX_FIXTURE_COMPANY_DOCUMENT_CASES` vale 100;
cada evidencia declara cero o un documento. Se conservan todos los límites
de a, negociación, directorio y catálogo, sin arrays ilimitados.

Registros exactos ordinarios o de prototipo nulo, solo datos propios enumerables,
sin símbolos, extras o getters; `cases` es un array denso propio sin extras.
Los IDs son tokens canónicos de `companies`; no son URL, ruta o prueba de archivo.
El número PO conserva exactamente la gramática de a, con sus rechazos Unicode,
sin trim, normalización NFC, cambio de mayúsculas o coincidencia aproximada.

La factory normaliza **todos** los casos, exige adaptador común e ID de consulta
único incluso con contenido distinto. `read` compara ID y JSON canónico completos.
Ausencia de caso o mismo ID con contenido diferente devuelve `not_configured`
con la consulta realmente recibida; consulta corrupta es error. El mapa privado
no se expone ni cambia tras la construcción; mutar entradas originales no altera
los casos congelados, y repetir lectura no genera evidencia nueva.

`CompanyDocumentContractError` usa `company_document_contract_invalid` y razones
cerradas `invalid_data`, `purchase_order_invalid`, `adapter_mismatch`,
`request_mismatch` y `duplicate_request`. Mensajes fijos sin payload ni `cause`;
errores propios se recuperan mediante descriptor y los ajenos quedan redactados.

## Validación y continuidad

Fuente congelada: 23 focales de dominio, 26 de regresión de PO y seis de
arquitectura (55/55), factory 34/34 y 121 registro/manifest/acceso verdes.
Revisión independiente final: 28.509 aserciones de dominio, 6.726 de regresión
PO y 14.534 de factory, medidas separadas de los focales; sin P1/P2.
Bundle diagnóstico público con factory: 30.809 B/7.774 gzip; importación sin
efectos, no es un asset emitido por Astro. Check global final: 1.001 archivos
sin diagnósticos, 267 suites/3.898 pruebas, 44 HTML/44 formularios locales y
cero cron; build del 2026-10-04 a las 05:05:56 UTC.

Comparación estática final frente a R6.7a/PR #42: siete grafos completos,
358 fuentes seleccionadas, 19 CSS y 60 JavaScript públicos idénticos; estos
últimos suman 395.809 B/128.833 gzip. Worker +61 B por companies 1.10.0 y enlace
ADR0062; metadata generada separada, sin equivalencia SSR completa. No hubo
nueva ejecución HTTP/navegador/DB.
**Implementado y verificado localmente; integrado en PR #43 (`feff0a27`), sin despliegue.**
[Informe final R6.7b](../../audits/r6-7b/verification-report.json).
El Worker contiene 281 archivos: 279 iguales tras mapear 24 nombres generados;
registro y manifest restantes explicados estáticamente, sin afirmar equivalencia
del grafo transitivo SSR. Las sumas gzip son por archivo, no tráfico HTTP medido.

R6.7a está integrado en PR #42. Su [informe](../../audits/r6-7a/verification-report.json)
cubre contrato y comparación estática; navegador 9.068 comprobaciones,
a11y 8/PNG 8, E2E 196 y hash de 143 tablas/353 filas siguen siendo evidencia histórica
de PR #41, sin nuevas ejecuciones runtime en b.

R6.7c está implementada y verificada localmente: `/demo/admin/documentos-empresa`,
18 casos y tres evaluaciones explícitas, dos selectores y reset, ocho capturas
revisadas. Integrado en PR #44 (`6aade364`), sin despliegue. No se recibe PO real, PII, archivo
o formulario con envío. Pedido operativo por PO, facturación externa registrada,
ERP, fiscalidad certificada y conciliación/cobro reales siguen fuera de este
corte. B2B-007/R6.7 permanecen parciales; B2B-010 no se declara resuelto.

## R6.7c — Demo verificada localmente

**R6.7c — Demo «Referencias y documentos» está implementada y verificada localmente**, rama
`codex/company-document-demo`, según el [ADR-0062](0062-evidencia-documental-fixture.md).
Ruta `/demo/admin/documentos-empresa`, Clientes después de Ofertas y presupuesto.
Dieciocho ejemplos cerrados y tres evaluaciones UTC explícitas; dos selectores
independientes y reset, sin inputs libres, formularios o archivos. Cambiar
momento conserva la misma evidencia; recarga restaura el ejemplo inicial.

La referencia aportada y el documento observado se comparan por campo, sin
éxito global. Empresa observada significa compradora; soporte PO y referencia
documental son distintos. Importe observado, diferencia y fecha monetaria solo
se proyectan cuando el contrato los considera comparables; cifras ajenas no
llegan a View/DOM. Metadatos futuros/incompletos no son documento utilizable;
cero explícito se distingue de desconocido. Sin factura, pago o autoridad.

R6.7b está integrado en PR #43 (`feff0a27`), sin despliegue. B2B-007 sigue parcial
instalada/inactiva. Check global final del 2026-10-04 verde: 1.005 archivos sin
diagnósticos, 268 suites/3.969 pruebas; build a las 05:21:46 UTC con 44 HTML,
44 formularios locales y cero cron. Modelo: 71 focales, seis de arquitectura y
ocho de autenticación; los dos archivos del autor sin diagnósticos TypeScript.
Revisión independiente: 7.132 aserciones del oráculo y 589 de delegación,
contadas por separado, sin P1/P2, efectos, getters o reloj implícito. Bundle
diagnóstico del modelo: 49.778 B/11.697 gzip; no es el cliente emitido.
Cliente real: cuatro archivos, 60.721 B/17.405 gzip, entrada 36.029 B/8.813 gzip;
sin imports externos. Sonda sin raíz: una consulta DOM, 2.098 fechas explícitas
y cero efectos, separada de la interacción real. Guía aparte: 15.219 B/6.325 gzip,
único incremento +19 B/+4 gzip por allowlist de la ruta.
Navegador: 5.076 comprobaciones y 108 visitas (54 a 1440 y 54 a 375), cero
efectos del módulo, errores, overflow o fallos de hit-test; guía contabilizada
aparte. Ocho superficies a11y sin errores/avisos y ocho capturas definitivas
revisadas por frontend, cuatro contrastadas por raíz, sin hallazgos.
E2E nuevo 200/200, Worker y Chrome cerrados. Base QA sin cambios: 143 tablas,
353 filas y SHA-256 `9cbfc811cfc4296515a403d395875a43bfa26aff0c9c9b08be0804b15bbf6eca`
idéntico en las capturas frescas de 05:13:54 y 05:24:45 UTC; sin nueva preparación,
siembra o migración. **Verificada localmente, disponible en repo e integrada
en PR #44 (`6aade364`), sin despliegue.** [Informe final R6.7c](../../audits/r6-7c/verification-report.json). Tras c,
el siguiente bloque canónico es R6.8, pedido rápido/repetición por SKU, CSV,
listas y pedido anterior. R6.8a tiene contrato exacto aceptado y está en
implementación: lista/identidad sin dinero sobre un único snapshot completo con
SKUs. La validación nueva sigue pendiente; las etapas posteriores se delimitarán
antes de implementarlas.

La vista conserva la referencia de compra aportada, su soporte declarado o
no aportado y la oferta histórica de 77,00 EUR. En otra zona muestra la fecha de
evaluación, los metadatos legítimos del corte y, cuando es observable, el documento
del ejemplo y las comparaciones de empresa compradora, número PO e importe.
Los encabezados de campos son «Referencia aportada» y «Documento del ejemplo»;
los de dinero distinguen total comercial de oferta e importe comercial de evidencia.

Casos cerrados: coincidencia, importe menor/mayor/cero, PO ausente, soporte PO
ausente, empresa compradora ausente/distinta, PO observada ausente/distinta,
importe comercial ausente, respuesta ausente, caso no configurado, indisponible,
no soportado, futuro, incompleto y documento no aportado. Son 18 ejemplos de
consulta/evidencia sintéticas, no estados de un pedido o factura.

Las evaluaciones son el 3 de octubre de 2026 a las 14:00, 14:15 y 14:30 UTC.
El corte normal es de las 14:00 y el futuro de las 14:15: este último es desconocido
antes de su fecha y observable en igualdad o después, sin cambiar su `asOf`.
Todas las opciones de momento están habilitadas; no hay cronología de acciones.

El modelo usa la factory y el evaluador reales de b; no copia sus comparaciones
en una tabla de presentación. Mantiene solo selección cerrada y feedback, sin
respuesta, importe o diagnóstico externo arbitrario. Los cinco documentos con
importe privado 8.888 céntimos y atribución bloqueada sirven para verificar que
esa cifra nunca pasa al DTO/DOM. El esperado de oferta permanece conocido; cero
observado comparable se representa como cero real, no ausencia.

La proyección omite consulta, declaración, binding, adaptador, tokens, IDs de
empresa/contacto/documento, hashes y JSON técnico. Documento observado muestra
solo etiqueta humana y fecha, nunca cifra monetaria bruta. `unknown` global
vacía documento/comparaciones; importe desconocido vacía cifra observada, delta
y fecha monetaria. El corte puede conservar fecha/cobertura como metadatos sin
presentarse como documento utilizable. No se confunde ocultar una cifra del DTO
con una promesa de secreto sobre los fixtures sintéticos del bundle.

Dos selects nativos persistentes y reset, SSR inicial legible con controles
deshabilitados sin JavaScript, gate AND de manifest demo y DEMO_MODE=true,
noindex/private. La recarga restaura selección inicial; no storage, red, timers,
beacons o formularios. Los casos y la evaluación se conservan mutuamente al
cambiar un selector; no hay creación o actualización de evidencia.

La QA de navegador ejecutó 54 combinaciones por tamaño (108 visitas a 1440/375),
además de recorridos de limpieza, frontera temporal, teclado/reset/sin JS.
Las 5.076 comprobaciones no detectaron efectos del módulo, errores, overflow o
fallos de hit-test; la guía se contó por separado. Las ocho capturas definitivas
y superficies a11y cubren coincidencia, importe menor, empresa compradora ajena
y corte futuro a ambos tamaños. Frontend revisó las ocho imágenes y raíz cuatro;
sin hallazgos visuales ni errores/avisos a11y. E2E nuevo 200/200 y hash final
de 143 tablas/353 filas idéntico al corte previo de esta ejecución; Worker y
Chrome cerrados, sin preparación, siembra o migración adicional.

El cliente real de la demo ocupa cuatro archivos/60.721 B/17.405 gzip. La sonda
sin raíz observa una consulta DOM y 2.098 construcciones Date explícitas sin
efectos ni imports externos; no sustituye la interacción de navegador. La guía
se mide aparte (15.219 B/6.325 gzip), con delta +19 B/+4 gzip explicado únicamente
por la allowlist de ruta. El cliente previo de Ofertas y presupuesto extrae un
chunk compartido: +145 B y comparación estructural validada, sin afirmar que sus
bytes sean idénticos. El cierre estático confirma cinco grafos de negocio
previos idénticos y 19 CSS emitidos iguales; el nuevo componente añade sus
estilos inline. Los 62 JavaScript públicos suman 432.002 B/138.864 gzip;
58 archivos públicos permanecen idénticos. La comparación de Worker y fuentes
es acotada y no acredita equivalencia SSR transitiva completa. La interacción
de demos previas sigue siendo evidencia heredada; la nueva QA cubre Documentos
de empresa y el E2E general de este corte.

R6.8a está implementado y verificado localmente, con integración pendiente y sin
despliegue, según el [ADR-0063](0063-lista-identidad-sku-fixture.md): lista/identidad
sin dinero sobre un único snapshot completo con SKUs. Check de 4.033 pruebas y
comparación estática cerrados; su QA runtime se hereda de este corte c. Parser
CSV propuesto para b, exacto pendiente; histórico, composición y UI se separarán.
No se convierten observaciones documentales en permiso de compra.
