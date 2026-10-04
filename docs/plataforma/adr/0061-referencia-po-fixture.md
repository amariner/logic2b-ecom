# ADR-0061 — Referencia PO declarada vinculada a una oferta histórica

- Estado: accepted; R6.7a implementado y verificado localmente; integrado en PR #42 (`1b783473`), sin despliegue.
- Fecha: 2026-10-04.
- Dominio: `src/modules/companies/domain/company-purchase-order.ts`.
- API pública: `src/modules/companies/index.ts`.
- Módulo: `companies` 1.9.0, dependencia `platform-configuration`.
- Capacidad: B2B-007 parcial, instalada/inactiva en avanzado/demo, ausente mínimo/estándar; dependencia única B2B-006 y superficies operativas vacías.
- Perfil: `company-po-reference-v1`.
- Continuidad: demo R6.6c integrada en PR #41 (`424123fe`), sin despliegue.

## Contexto y decisión

El [ADR-0059](0059-solicitudes-ofertas-fixture.md) conserva una negociación
completa y sus ofertas históricas. R6.7a asocia a una oferta explícita una
referencia de orden de compra (PO) declarada, o su ausencia explícita. Reutiliza
el contrato hermano de negociación, sin importar composición desde dominio.

La declaración no requiere un presupuesto del
[ADR-0060](0060-artefacto-preliminar-fixture.md): una referencia puede asociarse
a una propuesta sin simular aceptación, emisión de pedido o pago. No se añade
otro ciclo comercial, aritmética ni estado de factura. El
[ADR-0027](0027-documentos-operativos-no-fiscales.md) conserva la emisión fiscal
externa; no se invoca ORD-012 ni se fabrica un pedido pagado para habilitarlo.

El número PO no concede identidad, representación, crédito, stock, precio
autorizado, aceptación legal o permiso de compra. B2B-006/007 siguen parciales
e inactivas; importar APIs puras no activa ORD-008, ORD-012 o B2B-010.

## APIs y datos

Todas las entradas son `unknown`, con registros de forma exacta y copias
canónicas profundamente congeladas.

| API | Entrada | Resultado |
|---|---|---|
| `defineCompanyPurchaseOrderBinding` | `{negotiation, revisionId}` | Negociación completa y selección histórica validadas |
| `defineCompanyPurchaseOrderDeclaration` | Declaración completa | Metadatos, vínculo, referencia y cronología validados |
| `previewCompanyPurchaseOrderDeclaration` | `{declaration, binding}` | Declaración normalizada, oferta derivada y presencia declarada |

`CompanyPurchaseOrderBinding` contiene el `CompanyNegotiation` completo y el
`revisionId` elegido. Se normaliza con `defineCompanyNegotiation` y se resuelve
mediante `previewCompanyOfferRevision` sobre su contexto ya normalizado. No se
acepta una referencia ID/versión como sustituto del contenido íntegro.

La declaración contiene `schemaVersion:1`, `source:'fixture'`, perfil, `id`,
`version`, `recordedAt`, `binding` y `purchaseOrder`. Este último campo es
obligatorio y admite `null` o `{issuerCompanyId, number, documentReference}`;
`documentReference` también es obligatorio y admite token opaco o `null`.

El snapshot devuelve `source`, `profile`, la declaración completa, `offer`
como `CompanyOfferSnapshot` real y dos estados independientes:
`purchaseOrderStatus` y `documentReferenceStatus`, ambos
`declared|not_provided`. No admite un importe o snapshot monetario externo.

| Datos aportados | PO | Referencia documental |
|---|---|---|
| `purchaseOrder:null` | `not_provided` | `not_provided` |
| PO con `documentReference:null` | `declared` | `not_provided` |
| PO con token documental | `declared` | `declared` |

`not_provided` describe lo aportado a este artefacto; no demuestra que una PO o
un documento externos no existan. Una cadena vacía, un campo ausente o
`undefined` son inválidos y nunca se convierten silenciosamente en ausencia.

## Vínculo histórico y correlación completa

El preview normaliza primero toda la declaración y después el binding externo.
Compara sus copias canónicas completas antes de derivar presencia o ausencia,
incluso con `purchaseOrder:null`. Un cambio válido del directorio, catálogo,
solicitud, cualquier revisión histórica o selección produce `binding_mismatch`.
La corrupción de esos contratos se rechaza antes de la comparación.

Se validan todas las variantes, precios, referencias y propietarios, incluidos
los no seleccionados. La inactividad o caducidad no ocultan corrupción ni
convierten el resultado en un permiso comercial. El emisor debe coincidir
exactamente con `binding.negotiation.context.request.companyId`; VAT, email o
identidades externas compartidas no reasocian una PO entre empresas.

Añadir ofertas a una copia posterior de la negociación no cambia el artefacto
histórico. Su preview sigue usando el binding original; aportar la copia
ampliada como vínculo externo es una discrepancia, aunque la oferta seleccionada
no haya cambiado. No hay `latest`, retarget ni lectura de versión viva.

El resultado se construye desde las copias capturadas, sin releer las entradas
originales después de normalizar el binding externo. La correlación acredita
consistencia declarada, no autenticidad del snapshot ni origen de los datos.

## Número legible, token y límites

`COMPANY_PURCHASE_ORDER_LIMITS` publica límites congelados. Cada llamada trata
una declaración y un binding; no hay arrays de PO, índices o almacenamiento.

| Campo | Límite y significado |
|---|---|
| ID interno, selección y emisor | 1–100 unidades UTF-16; gramática canónica de IDs de `companies` |
| Número PO | 1–120 unidades UTF-16, texto legible conservado exactamente |
| Referencia documental | Token opaco de 1–100 unidades UTF-16 o `null` |
| Versión declarada | Entero seguro positivo hasta `Number.MAX_SAFE_INTEGER`; sin `-0` |
| Negociación y contexto | Límites existentes íntegros, incluidas veinte revisiones y cien líneas |

La gramática de ID/token es `^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$`. El número
PO es distinto: empieza por letra o número Unicode; después admite letras,
marcas combinantes, números, espacio ASCII y `._/#-`. No admite espacio final.
Se rechazan expresamente `Default_Ignorable_Code_Point` y U+20E3, además de los
caracteres fuera de esa gramática. Esto excluye controles, bidi, invisibles y
secuencias keycap; no promete una clasificación universal de emoji.

No se aplica trim, cambio de mayúsculas, colapso de espacios, eliminación de
puntuación o normalización Unicode. Ceros iniciales, espacios interiores
repetidos y formas NFC/NFD se conservan exactamente; un acento combinante
ordinario como U+0301 es válido. El número nunca se convierte a valor numérico
ni se deriva de un ID interno. No se valida un esquema real de proveedor o país.

El token documental no es una URL, una ruta, un archivo recibido o un hash
verificado. Puede repetirse como metadato. No se resuelve, descarga, sube,
procesa mediante OCR ni produce un enlace accionable.

## Temporalidad y versión declaradas

`recordedAt` es UTC canónico de 24 caracteres con milisegundos y `Z`, fecha real
de los años 0001–9999. Registra la asociación declarada al corte incluido, no la
emisión, recepción o aceptación de la PO. Es igual o posterior a la fecha de la
última revisión incluida, aunque se seleccione una oferta anterior.

No se compara con `capturedAt`: directorio/catálogo conservan su frontera
histórica, incluido el año 0000 donde su contrato lo permite. No hay reloj
implícito, `evaluationAt`, TTL o estado temporal nuevo. Registrar o inspeccionar
una declaración después de `offer.expiresAt` es válido; no rehabilita la oferta.

La versión la declara el llamador. No hay mutador, incremento automático,
predecesor, historial, CAS, replay durable o unicidad global. Cambiar número,
documento o binding requiere otra declaración completa explícita; este contrato
no demuestra que su versión aumentó ni detecta una reescritura coherente entre
llamadas. El mismo número en dos declaraciones no acredita la misma identidad.

## Frontera y errores

Solo registros ordinarios o de prototipo nulo, propiedades de datos propias
enumerables, sin símbolos, campos extra, getters o propiedades ocultas. Se
validan límites y contexto completos antes de derivar el snapshot; los errores
ajenos de Proxy o contratos hermanos quedan redactados, sin datos ni `cause`.

`CompanyPurchaseOrderContractError` acepta únicamente una razón cerrada y usa
el código `company_purchase_order_contract_invalid`:

- `invalid_data`: forma o datos propios inválidos.
- `offer_invalid`: negociación o selección inválidas en el contrato hermano.
- `issuer_mismatch`: emisor distinto de la empresa declarada en la solicitud.
- `binding_mismatch`: discrepancia entre vínculos completos válidos.
- `invalid_chronology`: asociación anterior a las revisiones incluidas.

No importa `orders`, crédito, fiscalidad, pagos, D1 o infraestructura. Los valores
EUR/total que exponga `offer` proceden del contrato existente y son comerciales
declarados; no son factura emitida, pago observado, saldo o conciliación.

## Validación y continuidad

Fuente congelada y focales verdes: 26 de contrato, seis de arquitectura y
121 de registro/manifest/acceso (19/72/30). Revisión independiente: 6.726
aserciones, 72 escenarios, 96 números, 15 tokens, 14 versiones, 28 cambios de
binding en tres presencias (84 casos) y siete corrupciones; cero P1/P2,
efectos, getters o reloj implícito. Son mediciones separadas de los focales.

Bundle público de diagnóstico: 21.746 B/5.869 gzip, sin imports externos o
runtime operativo; retiene 281 B de constantes históricas de cobro/crédito.
No es un cliente Astro emitido. Check global final verde: 995 archivos sin
diagnósticos, 265 suites/3.841 pruebas, 44 HTML/44 formularios locales y cero cron;
build del 2026-10-04 a las 04:48:50 UTC.

Comparación estática final frente a PR #41: siete grafos, 358 fuentes
seleccionadas, 19 CSS y los 60 JavaScript públicos idénticos; estos últimos
suman 395.809 B/128.833 gzip. Worker +296 B explicados por registro B2B-007,
dependencia/instalación y descriptor companies 1.9.0/ADR0061. No se acredita
equivalencia SSR completa ni nueva ejecución HTTP/navegador/DB.
**Implementado y verificado localmente; integrado en PR #42 (`1b783473`), sin despliegue.**
[Informe final R6.7a](../../audits/r6-7a/verification-report.json).
El Worker contiene 281 archivos; 279 coinciden tras sustituir nombres generados.
El registro y manifest generado restantes explican los cambios medidos, sin
pretender demostrar todo el grafo transitivo SSR. No hay nueva UI ni ejecución
HTTP, navegador o base de datos en este corte.

La evidencia de interacción es histórica de PR #41: navegador 9.068
comprobaciones (72 visitas iniciales y 24 creaciones, más recorridos), ocho
superficies a11y sin hallazgos/ocho PNG, E2E 196 y hash antes/después intacto de
143 tablas/353 filas. [Informe R6.6c](../../audits/r6-6c/verification-report.json).
Estos datos no representan nuevas ejecuciones de R6.7a; la comparación estática
tras su build se detalla arriba y no sustituye esas interacciones históricas.

R6.7b está implementado y verificado localmente, pendiente de integración, según el [ADR-0062](0062-evidencia-documental-fixture.md):
puerto fixture y evidencia documental correlacionada, ausencia explícita y
comparabilidad comercial sin inferir factura o cobro. Check final 1.001 archivos/267 suites/3.898 pruebas y comparación estática verdes;
sin QA runtime nueva. [Informe final R6.7b](../../audits/r6-7b/verification-report.json). R6.7c será
una demo inerte posterior con plan exacto aceptado; implementación y QA pendientes
tras integrar b. Ninguno de
estos subcortes elige proveedor, emite factura fiscal, crea pedido real o cierra
ERP/conciliación operativos. R6.7 y B2B-007 siguen parciales; B2B-010 pendiente.
