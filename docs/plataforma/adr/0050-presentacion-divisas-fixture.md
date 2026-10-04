# ADR-0050 — Presentación de divisas y evidencia FX fixture

- Estado: accepted; R5.11a implementado y verificado localmente, pendiente de
  integración. Sin activación ni despliegue; demo visual pendiente.
- Fecha de decisión: 2026-10-03
- Verificación final: 2026-10-04 UTC
- Bloque: R5.11a
- Propietario: `currencies`, separado de mercados, precios, pagos e impuestos.
- Capacidad: MKT-008, parcial e instalada/inactiva en avanzado y demo;
  dependencia PLT-004. CHK-010 conserva su estado.
- Perfil: `minor-unit-presentment-half-up-v1`.

## Contexto

R5.10b está integrada en PR #22 (`93bc3bd`), sin despliegue. El roadmap
canónico R5.11 comprende presentación, cobro, reembolso y conciliación.
Este primer corte permite explicar un importe presentado en otra divisa
mediante evidencia sintética; no declara resueltas las otras operaciones.

Los contratos monetarios existentes usan céntimos. `formatCurrencyCents`
divide entre 100, la composición de mercados bloquea una moneda distinta de
la base y el ledger de pagos exige que moneda e importe de captura coincidan
con la intención. `paymentSettlementCents` suma componentes comerciales de
la misma moneda: no representa conversión ni liquidación FX. Ninguna de
esas funciones se modifica o reutiliza para interpretar escalas distintas.

`taxes` conserva su perfil EUR. Mostrar otra moneda no habilita un método de
pago, impuestos de otra jurisdicción ni cobro, reembolso o liquidación en ella.

## Decisión

### Catálogo completo y escala explícita

El módulo `currencies` recibe un catálogo completo, versionado y aportado por
el llamador. Cada código tiene un exponente explícito de 0, 2 o 3 decimales.
El importe original se expresa en unidades menores enteras, no en un número
decimal de coma flotante ni en céntimos asumidos para cualquier moneda.

El catálogo es una configuración fixture con estructura comprobada. No es
un catálogo certificado ISO 4217, una fuente viva de exponentes ni una lista
de monedas operativas habilitadas. Esos códigos y escalas no determinan
disponibilidad bancaria, cobertura de proveedor o aceptación comercial.

`defineCurrencyCatalog(unknown)` acepta exactamente
`{ schemaVersion: 1, id, version, currencies: [{ code, exponent }] }`.
Admite de una a 100 monedas únicas, código de tres letras ASCII mayúsculas y
versión entera positiva segura. Los IDs son opacos canónicos en minúsculas,
de hasta 100 caracteres. No normaliza un código desconocido a una moneda
conocida ni deduce su exponente mediante `Intl`.

`definePresentmentRequest(unknown)` valida:

```ts
{
  schemaVersion: 1,
  id: string,
  profile: 'minor-unit-presentment-half-up-v1',
  at: string,
  catalog: CurrencyCatalog,
  original: { currency: string, amountMinor: number },
  targetCurrency: string
}
```

Ambas monedas deben existir en el catálogo. `amountMinor` es un entero no
negativo seguro; se rechazan `-0`, fracciones y valores fuera de rango. Las
fechas son UTC canónicas de 24 caracteres. Catálogo, petición y respuestas
son copias estrictas de datos propios, ordenadas cuando corresponde y
congeladas; no se ejecutan getters ni se admiten campos desconocidos.

La petición incluye el catálogo íntegro, importe original, moneda destino,
perfil e instante explícito. Guardar solo su ID/versión no basta para
correlacionar una respuesta: un exponente o un importe distinto debe producir
otra petición. Se conserva el importe y la moneda originales en todo resultado.

### Conversión dirigida y redondeo único

Una tasa racional positiva `numerator / denominator` expresa unidades
principales de la moneda destino por una unidad principal de la moneda
origen. Para importe original `A` en unidades menores y exponentes `s` y `t`,
el resultado presentado es:

```text
halfUp(A × numerator × 10^t / (denominator × 10^s))
```

El cálculo utiliza `BigInt`, ajusta las escalas y aplica half-up una sola vez.
No usa floats para calcular dinero, redondeos intermedios ni reglas implícitas
de presentación. Los resultados deben caber en enteros seguros; un
desbordamiento se rechaza, no se trunca.

Numerador y denominador son enteros positivos seguros. Se conserva su
representación declarada; no se reduce automáticamente la fracción ni se
confunde igualdad aritmética con identidad de la evidencia.

La tasa tiene dirección explícita origen → destino. No se invierte ni
triangula automáticamente y no se reutiliza una tasa para otro par. El perfil
identifica una regla técnica para fixtures, no una regla bancaria universal.

La misma moneda se trata mediante un modo de identidad explícito que conserva
su importe. No solicita una respuesta FX ni inventa una tasa 1:1, referencia
de proveedor o fecha de cotización. El adaptador rechaza consultas de la misma
moneda; identidad pertenece al preview puro.

### Evidencia, vigencia y correlación

`defineFxResponse(unknown)` valida fuente fixture, adaptador, petición completa,
referencia, tasa dirigida y ventana temporal explícita. La forma común es
`{ source: 'fixture', adapterId, request }`. `outcome: 'quoted'` añade
`evidenceRef`, `quotedAt`, `expiresAt` y
`rate: { baseCurrency, targetCurrency, numerator, denominator }`;
`outcome: 'unavailable'` solo añade motivo `not_configured`, `unsupported` o
`unavailable`, sin tasa ni fechas. El preview revalida
todos los datos y compara la petición canónica completa y el adaptador
esperado. Una forma corrupta o una correlación ajena produce error de
contrato `CurrencyContractError` (`currency_contract_invalid`), no un resultado
utilizable ni un fallback de moneda.

`previewCurrencyPresentment(unknown)` acepta dos intenciones exactas:

- `{ mode: 'identity', request }`, solo para la misma moneda, sin adaptador o
  respuesta adicional.
- `{ mode: 'fx', request, expectedAdapterId, response }`, solo para monedas
  distintas.

La ventana es `[quotedAt, expiresAt)`: caduca exactamente en `expiresAt`,
y una cotización posterior al instante de la petición todavía no es vigente.
El preview evalúa frente a `request.at`; no lee reloj real ni renueva fechas.

| Caso | Resultado permitido |
|---|---|
| Identidad explícita, misma moneda | Importe original conservado, sin evidencia FX fabricada. |
| Respuesta cotizada, correlacionada y vigente | Importe presentado calculado y resultado inmutable con petición y evidencia. |
| Respuesta ausente, futura o caducada | Importe presentado `null`, motivo explícito y original conservado. |
| Forma corrupta o respuesta de otra petición/adaptador | Error de contrato. |

El DTO conserva `request` y `original: { currency, amountMinor, exponent }`.
El campo `outcome` es `identity`, `converted` o `unresolved`; `presented`
contiene moneda, importe menor y exponente, o `null`. Identidad devuelve
`response: null`; conversión devuelve la respuesta cotizada completa y
unresolved conserva su respuesta con motivo `not_configured`, `unsupported`,
`unavailable`, `future` o `expired`. No existe un campo de evidencia fabricado
para identidad ni un importe de fallback para unresolved.

Este resultado inmutable identifica los datos sintéticos presentados. No acredita consulta
de un proveedor, captura de base de datos, autenticidad externa, persistencia
durable ni que ese importe pueda cobrarse.

### Puerto y adaptador fixture

`FxAdapter` expone `source: 'fixture'`, `adapterId` y
`quote(request: unknown): FxResponse`, síncrono.
`createFixtureFxAdapter({ adapterId, cases })` recibe casos completos,
normalizados por el dominio, con un máximo de 100.

Los casos pertenecen al adaptador exacto y no pueden repetir ID de petición,
incluso con payload diferente. El lookup usa la petición canónica íntegra:
perfil, instante, catálogo, versión, exponentes, importe original y destino.
No existe selección por importe aproximado o por ID aislado.

Si falta el caso, devuelve
`{ source: 'fixture', adapterId, request, outcome: 'unavailable', reason: 'not_configured' }`,
sin evidencia, tasa o fechas inventadas. La factoría no recalcula tasas,
invierte pares, renueva ventanas ni ejecuta I/O. Su mapa es memoria de los
casos inyectados, no caché durable ni conexión con un proveedor.

## Fronteras de implementación

MKT-008 se incorpora como parcial e instalada/inactiva en avanzado y demo,
dependiente de PLT-004. No se añade activación a CHK-010, ni nuevas rutas,
endpoints, jobs, cron, DDL o escrituras de base de datos. No hay red,
proveedor, credenciales, reloj real ni formularios enviados.

`formatCurrencyCents`, catálogo servido, quote, checkout, ledger, reembolsos
y el perfil EUR de `taxes` conservan su comportamiento. No se relaja el
bloqueo actual de moneda incompatible en la composición de precios. Tampoco
se recalcula un reembolso histórico con una tasa actual ni se presenta una
diferencia de FX como conciliación resuelta.

Fixtures y configuración versionada bastan para probar el contrato; no se
inventa una necesidad de D1 o proveedor para hacerlo. La selección de monedas
operativas, proveedores y políticas de cobro/liquidación de un cliente
corresponde a su proyecto y no se decide a partir de estos ejemplos.

## Verificación y alcance

[Verificación final](../../audits/r5-11a/verification-report.json), 2026-10-04 UTC:
`pnpm check` pasa 928 archivos sin diagnósticos, 237 suites/2.561 pruebas,
44 HTML, 44 formularios y cero crons. Focales: 107 de dominio, 25 del adaptador
FX, seis de arquitectura y 77 de manifest/registry. Revisión independiente de
8.823 aserciones sin P1/P2, cero efectos y cero getters ejecutados; bundle
público de tres fuentes/12.910 B, sin imports de runtime operativo.
Implementado y verificado localmente, sin despliegue; integración pendiente.

Se verifican escalas 0/2/3, tasas dirigidas, mitad exacta y redondeo, cero e
importes límite, overflow, identidad sin cotización, correlación íntegra,
inmutabilidad, ventanas en el límite y ausencia de efectos.

E2E 168/168, navegador 340/340, ocho superficies a11y sin hallazgos y la base
QA intacta de 143 tablas/353 filas pertenecen a
[R5.10b/PR #22](../../audits/r5-10b/verification-report.json) (`93bc3bd`). Su
SHA-256 antes/después es
`9cbfc811cfc4296515a403d395875a43bfa26aff0c9c9b08be0804b15bbf6eca`.
Son evidencia heredada, no nuevas ejecuciones de R5.11a. Este corte puro no
modifica UI, rutas ni lectores runtime.

## Siguientes cortes

Siguiente aprobado: **R5.11b, métodos sintéticos**, en
`payments/domain/local-payment-methods.ts` y composición
`local-payment-methods-context`. Política fixture con reglas exactas por
método/mercado/moneda y rangos de unidades menores inclusivos. Request y
política conservan referencias completas ID/versión de catálogos; la
composición valida todas las reglas, también las ajenas al contexto, y exige
`original.currency === market.currency`. Sin fallback, FX, precios ni pagos.
CHK-010 se incorporará instalada/inactiva en ese bloque; hoy conserva su
estado. Las otras capacidades ya activas de `payments` no se desactivan.

Después **R5.11c**, demo `/demo/admin/divisas` con mercados ES/FR/JP/KW
coherentes. Los métodos se evalúan sobre el importe original y FX permanece
independiente. La presentación visual aún está pendiente. R5.11 continúa
parcial: estos previews no resuelven cobro, reembolso ni conciliación operativos.

Estos cortes están aprobados como continuación; este ADR no atribuye su
implementación ni verificación a R5.11a.
