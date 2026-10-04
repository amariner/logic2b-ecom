# ADR-0062 — Evidencia documental comercial con adaptador fixture

- Estado: accepted; R6.7b implementado y verificado localmente; integración pendiente, sin despliegue.
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
**Implementado y verificado localmente; integración pendiente, sin despliegue.**
[Informe final R6.7b](../../audits/r6-7b/verification-report.json).
El Worker contiene 281 archivos: 279 iguales tras mapear 24 nombres generados;
registro y manifest restantes explicados estáticamente, sin afirmar equivalencia
del grafo transitivo SSR. Las sumas gzip son por archivo, no tráfico HTTP medido.

R6.7a está integrado en PR #42. Su [informe](../../audits/r6-7a/verification-report.json)
cubre contrato y comparación estática; navegador 9.068 comprobaciones,
a11y 8/PNG 8, E2E 196 y hash de 143 tablas/353 filas siguen siendo evidencia histórica
de PR #41, sin nuevas ejecuciones runtime en b.

R6.7c tiene plan visual exacto aceptado: `/demo/admin/documentos-empresa`,
18 casos y tres evaluaciones explícitas, dos selectores y reset, ocho capturas
previstas. Implementación y QA pendientes tras integrar b. No se recibe PO real, PII, archivo
o formulario con envío. Pedido operativo por PO, facturación externa registrada,
ERP, fiscalidad certificada y conciliación/cobro reales siguen fuera de este
corte. B2B-007/R6.7 permanecen parciales; B2B-010 no se declara resuelto.
