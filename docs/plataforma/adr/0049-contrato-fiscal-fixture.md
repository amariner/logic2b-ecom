# ADR-0049 — Contrato fiscal y evidencias con adaptadores fixture

- Estado: accepted; R5.10a integrado en PR #21 (`5f9e3e2`). R5.10b verificada
  localmente y disponible en el repositorio, pendiente de integración.
  Sin activación ni despliegue.
- Fecha: 2026-10-03
- Bloque: R5.10a
- Propietario: `taxes`, separado de `markets`.
- Capacidades: MKT-009 y MKT-010, parciales e instaladas/inactivas en avanzado
  y demo; dependencia de capacidad PLT-004. CHK-006 permanece pendiente.
- Perfil: `eur-line-tax-half-up-v1`.

## Contexto

R5.9b está integrada en PR #20 (`7a0926ec`), sin despliegue. Publicar un
producto en un mercado no determina su jurisdicción, tratamiento fiscal ni
posible exención. El motor necesita un contrato verificable que reciba esas
decisiones explícitas y permita explicar importes y evidencia con fixtures,
antes de elegir proveedor o conectar el checkout.

El total actual de quote y ledgers es subtotal más envío. `base_subtotal`
representa un importe anterior a descuentos, no una base imponible. Este
corte no reinterpreta esos campos ni modifica quote, checkout, pagos,
reembolsos, pedidos o la emisión externa de facturas de
[ADR-0027](0027-documentos-operativos-no-fiscales.md).

## Decisión

### Perfil limitado y cálculo por línea

El módulo `taxes` recibe importes enteros en céntimos de EUR posteriores a
descuentos. Mercancía (`goods`) y envío (`shipping`) se presentan como líneas
separadas, con jurisdicción, tratamiento, tasa y precio incluido/excluido
explícitos. No infiere fiscalidad desde un mercado, país de envío, código
postal, idioma, moneda o identificador VAT.

`eur-line-tax-half-up-v1` identifica un perfil técnico de cálculo: cuota con
aritmética `BigInt` y redondeo half-up por línea. Neto más cuota debe coincidir
con bruto; los totales deben coincidir con la suma de líneas. Importes y
resultados deben caber en enteros seguros; un desbordamiento se rechaza y no
se trunca. No es una política fiscal universal ni prueba que el redondeo sea
aplicable a una jurisdicción real.

El contrato distingue cuatro tratamientos: `taxable`, `zero_rate`, `exempt`
y `unresolved`. La evidencia no es otro tratamiento: `exempt` exige
`exemptionEvidenceRef`. Una tasa cero no equivale a exención, ausencia de
datos o fallo de un proveedor. Ninguna de esas ausencias autoriza a presentar
un total fiscal de cero.

`defineTaxRequest(unknown)` acepta exactamente:

```ts
{
  schemaVersion: 1,
  id: string,
  profile: 'eur-line-tax-half-up-v1',
  at: string,
  currency: 'EUR',
  lines: Array<{
    id: string,
    kind: 'goods' | 'shipping',
    amountCents: number,
    priceBasis: 'included' | 'excluded'
  }>
}
```

Cada importe representa la línea completa tras descuentos, no un precio por
unidad: no se multiplican cantidades ni se reparten descuentos. Se admiten de
una a 100 líneas únicas, importes no negativos seguros y fechas UTC canónicas
de 24 caracteres. IDs y referencias son opacos canónicos en minúsculas, de
hasta 100 caracteres; no acreditan una jurisdicción o norma real.

`taxable` exige `rateBasisPoints` entero de 1 a 10.000, además de
`jurisdictionRef` y `ruleId`; `zero_rate` y `exempt` también exigen esas
referencias. `unresolved` solo admite `reason: 'not_configured' | 'unsupported' |
'missing_evidence'`. No admite referencias o tasas inventadas para completar
una decisión desconocida.

Para importe `A` y tasa `r` en puntos básicos, la cuota es
`halfUp(A × r / 10000)` en precio excluido y
`halfUp(A × r / (10000 + r))` en precio incluido. En el primer caso el neto
es `A` y se suma la cuota; en el segundo el bruto es `A` y se resta la cuota
redondeada. No se redondea primero una base neta independiente ni se vuelve a
redondear la suma global.

### Consulta completa y respuesta correlacionada

`previewTaxCalculation(unknown)` recibe
`{ request, expectedAdapterId, response }`. Revalida la entrada completa y su
correlación. Una forma corrupta, un adaptador ajeno o una respuesta de otra
petición producen `TaxContractError` (`tax_contract_invalid`), no un resultado
fiscal utilizable.

`defineTaxAssessmentResponse(unknown)` valida identidad común
`{ source: 'fixture', adapterId, request }` y una de dos formas:

- `outcome: 'assessed'`, con `assessedAt`, `expiresAt`, política `{ id, version }`
  y exactamente una decisión por cada línea de la petición, sin IDs ajenos ni
  duplicados.
- `outcome: 'unavailable'`, con motivo `not_configured`, `unsupported` o
  `unavailable`; sin política, decisiones o fechas fabricadas.

El puerto y su adaptador fixture permiten inyectar casos sintéticos. Un caso
ausente produce `unavailable` con motivo `not_configured` e identidad de
consulta, sin fabricar referencia de evidencia, política, reloj ni fechas.
`createFixtureTaxAdapter({ adapterId, cases })` admite entre cero y 100 casos
de respuesta y ofrece el puerto síncrono `TaxAdapter.assess(request)`.
Rechaza IDs de petición duplicados y casos de otro adaptador. Busca por la
petición canónica completa: reutilizar solo su ID con otros importes, fechas
o líneas no reutiliza el caso. No hay red, proveedor elegido, credenciales,
caché durable ni persistencia.

Los timestamps son aportados por el llamador. Una evaluación fiscal solo es
vigente en `[assessedAt, expiresAt)`; caduca exactamente en `expiresAt`.

| Respuesta | Resultado permitido |
|---|---|
| Evaluada y vigente, todas las líneas resueltas | Snapshot inmutable, resultado `calculated` y totales. |
| Evaluada y vigente, alguna línea `unresolved` | Snapshot que conserva las líneas calculadas como diagnóstico; importes de la línea sin resolver y `totals` son `null`. |
| No disponible, caducada o futura | Resultado sin resolver y `snapshot: null`; no se inventan importes ni evidencia. |

El resultado conserva `request`, `adapterId` y `response`. `outcome` es
`calculated` o `unresolved`; este último distingue `line_unresolved`,
`assessment_unavailable`, `assessment_future` y `assessment_stale`.
El snapshot incluye perfil, petición, fuente fixture, adaptador, fechas,
política, líneas `{ line, decision, netCents, taxCents, grossCents }` y
`totals`. Los objetos son copias de datos estrictos, ordenadas y congeladas.

La referencia y fechas declaradas identifican la evidencia sintética
presentada. No acreditan consulta de un proveedor real, cumplimiento legal,
captura D1, registro durable ni autenticidad externa.

### Evidencia VAT separada de la decisión fiscal

`defineVatIdQuery(unknown)` valida una consulta exacta
`{ schemaVersion: 1, id, countryCode, identifier }`. El país usa dos letras
mayúsculas y el identificador entre uno y 32 caracteres alfanuméricos en
mayúsculas; no hay normalización automática. Estas reglas validan estructura,
no existencia del país, formato fiscal nacional ni autenticidad del VAT.

`defineVatIdEvidence(unknown)` valida
`{ source: 'fixture', adapterId, query, evidenceRef, checkedAt, expiresAt, outcome }`,
con `outcome` `valid`, `invalid`, `unavailable` o `unsupported`. Fechas UTC
canónicas de 24 caracteres y `checkedAt < expiresAt`.

`evaluateVatIdEvidence({ expectedAdapterId, query, at, response })` exige
coincidencia exacta de adaptador y consulta completa: ID, país e identificador.
La respuesta contiene evidencia completa o ausencia explícita
`{ status: 'unavailable', reason: 'not_configured', adapterId, query, evidence: null }`.
Una correlación ajena produce `TaxContractError`; los errores no incluyen el
identificador VAT en bruto.

Solo `valid` e `invalid` dentro de `[checkedAt, expiresAt)` son evidencia
utilizable. `future`, `expired`, `unavailable`, `unsupported` y
`not_configured` permanecen inutilizables. Un VAT válido no concede exención,
tratamiento B2B ni jurisdicción; esas decisiones deben llegar explícitamente
en la evaluación fiscal. Un dato caducado o indisponible nunca se convierte
en una validación positiva ni en impuesto cero.

`createFixtureVatIdAdapter({ adapterId, cases })` valida sincrónicamente hasta
100 evidencias sintéticas y ofrece el puerto sin I/O. No consulta VIES ni otro
proveedor y no conserva una caché fuera de los casos inyectados.

## Fronteras de implementación

`taxes` conserva contratos, cálculo, evidencia y adaptadores fixture. No
importa reglas fiscales desde `markets` ni reinterpreta un país/locale como
una decisión de impuestos. MKT-009/010 se registran instaladas e inactivas en
avanzado y demo; PLT-004 es su dependencia de capacidad. No se activa CHK-006
ni se modifica una superficie de compra por instalar estos contratos.

El corte no añade DDL, D1, repositorio, endpoints, rutas, jobs, cron,
notificaciones, red ni reloj real. Tampoco cambia precios reales, descuentos,
ledgers o devoluciones. La fiscalidad operativa de cada proyecto exige sus
decisiones reales sobre vendedor, jurisdicciones, categorías, tasas,
exenciones, redondeo, evidencia y proveedor; no se inventa esa política en
fixtures. Esas decisiones no bloquean el contrato puro ni crean un requisito
de migración para probarlo.

## Verificación y alcance

Implementación y QA cerradas. [Informe final](../../audits/r5-10a/verification-report.json):
`pnpm check` termina con 917 archivos sin diagnósticos, 234 suites/2.391
pruebas, build/guardas de 44 HTML, 44 formularios y cero crons. Focales:
82 de dominio fiscal y 14 de su adaptador; 55 de dominio VAT y 15 de su
adaptador; seis de arquitectura y 75 de manifest/registry.

La revisión independiente pasa 5.616 comprobaciones (5.420 fiscales y 196
VAT), sin P1/P2 ni efectos. El bundle público de `taxes` contiene cinco
fuentes puras. Se verifican aritmética, incluidos/excluidos, ceros y
exenciones, overflow, líneas sin resolver, correlación completa, caducidad
en el límite, inmutabilidad y adaptadores fixture. No se activa ninguna
capacidad ni se despliega este corte.

E2E 164/164, navegador 188/188, ocho superficies a11y sin errores/avisos y
la base QA intacta de 143 tablas/353 filas pertenecen a
[R5.9b/PR #20](../../audits/r5-9b/verification-report.json) (`7a0926e`). Su SHA-256
antes/después es
`9cbfc811cfc4296515a403d395875a43bfa26aff0c9c9b08be0804b15bbf6eca`.
Son evidencia heredada, no ejecuciones nuevas de R5.10a. Este corte puro no
modifica UI, rutas ni lectores runtime y no requiere repetir esas superficies
sin un cambio que lo justifique.

## R5.10b — Demo fiscal inerte verificada

En `codex/tax-fixture-demo` se desarrolla `/demo/admin/impuestos`, «Impuestos y
totales», con dos zonas: preparar ejemplo y comprobar desglose. Implementación
y QA cerradas; demo disponible en el repositorio, sin desplegar.

Los cinco casos son cerrados y sintéticos: dos tipos y portes, céntimos y
redondeo, cero y exención, portes pendientes y ausencia de respuesta fiscal.
Un selector permite comparar precio incluido/excluido. Los importes ya están
descontados y son de solo lectura; no se introducen NIF, país ni importes
libres. La selección recalcula en memoria, sin buffers ni acción de guardar;
reset y recarga recuperan el ejemplo inicial.

El desglose muestra neto/cuota/bruto por línea cuando existen o ausencia
explícita cuando quedan sin resolver. `totals: null` no se representa como
cero ni como una suma parcial utilizable. La evidencia VAT es independiente,
con casos positivo, negativo, caducado e indisponible: cambiarla nunca modifica
el tratamiento fiscal del ejemplo.

La superficie exige manifest demo **y** `DEMO_MODE=true` y es noindex,
sin envío, red, almacenamiento, D1 ni operación fiscal real. MKT-009/010
siguen inactivas y CHK-006 pendiente. La validación de R5.10b corresponde a
esta superficie; la evidencia anterior R5.10a conserva su corte de contrato.

[Verificación final](../../audits/r5-10b/verification-report.json): `pnpm check`
pasa 921 archivos sin diagnósticos, 235 suites/2.427 pruebas, incluidas 36 del
modelo y seis de arquitectura; build y guardas de 44 HTML, 44 formularios y
cero crons. Revisión independiente de 496 comprobaciones sin P1/P2; modelo de
seis fuentes/30.148 B y cliente de ocho fuentes/23.091 B, sin runtime operativo.

[Navegador](../../audits/r5-10b/report.json): 340/340. [A11y](../../audits/r5-10b/a11y-report.json):
ocho superficies, cero errores y avisos; ocho capturas revisadas sin
bloqueantes. E2E nuevo: 168/168. Cero efectos del módulo; el almacenamiento de
la guía compartida y el rAF visual de WhatsApp se verifican por sus puntos
exactos de llamada y se contabilizan aparte.

La base QA conserva 143 tablas y 353 filas, con SHA-256 antes/después idéntico
`9cbfc811cfc4296515a403d395875a43bfa26aff0c9c9b08be0804b15bbf6eca`.
Worker y Chrome detenidos. Demo verificada y disponible en el repositorio,
sin despliegue; integración pendiente.

Después sigue **R5.11a: contrato puro de importe presentado y evidencia FX
fixture**, en un módulo separado, con unidades menores/exponente, tasa racional
dirigida vigente, redondeo identificado y snapshot correlacionado. Conserva
el importe original y no cambia los contratos monetarios, ledger, formateo
de céntimos ni el perfil EUR de `taxes`. No habilita monedas operativas ni
requiere proveedor, DDL o red.

R5.11b cubrirá métodos sintéticos y R5.11c su demo. La ola R5.11 permanecerá
parcial: estos previews no resuelven cobro, reembolso ni conciliación
operativos. Este ADR solo registra la continuación elegida; no implementa
ni verifica esos bloques.
