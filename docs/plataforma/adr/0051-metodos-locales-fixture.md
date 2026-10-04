# ADR-0051 — Métodos locales disponibles en fixtures

- Estado: accepted; R5.11b implementado y verificado localmente, pendiente
  de integración. Sin activación ni despliegue; demo visual pendiente.
- Fecha: 2026-10-04
- Bloque: R5.11b
- Propietario: `payments`, contrato puro `domain/local-payment-methods.ts`.
- Composición: `src/composition/local-payment-methods-context.ts`.
- Capacidad: CHK-010, parcial e instalada/inactiva en avanzado y demo;
  dependencia PLT-004. Las demás capacidades activas de `payments` conservan
  su estado; el módulo completo no se declara inactivo.

## Contexto

R5.11a está integrada en PR #23 (`c928ef9`), sin despliegue. Su contrato
`currencies` presenta un importe con evidencia FX fixture, pero no decide qué
método de pago está configurado para ese importe original. Disponibilidad de
un método y presentación en otra divisa son decisiones separadas.

R5.11 comprende presentación, cobro, reembolso y conciliación. Este corte
solo explica disponibilidad sintética con reglas explícitas; no declara
que un proveedor real acepte un método, que pueda iniciarse un pago o que
se hayan resuelto las operaciones de la ola.

## Decisión

### Política exacta y petición ligada a ambos catálogos

`defineLocalPaymentMethodPolicy(unknown)` define una política `source: 'fixture'`,
versionada, con métodos explícitos y reglas por la tupla exacta
método/mercado/moneda. Cada regla declara habilitación y límites inclusivos
en unidades menores. No hay comodines, inferencia desde país o idioma,
prioridades, herencia ni fallback desde otra tupla.

La política acepta exactamente:

```ts
{
  schemaVersion: 1,
  source: 'fixture',
  id: string,
  version: number,
  currencyCatalogRef: { id: string, version: number },
  marketCatalogRef: { id: string, version: number },
  methods: Array<{ id: string }>,
  rules: Array<{
    methodId: string,
    marketId: string,
    currency: string,
    exponent: 0 | 2 | 3,
    enabled: boolean,
    minMinor: number,
    maxMinor: number
  }>
}
```

Los métodos son IDs opacos, no instrumentos o proveedores certificados. Una
regla debe referenciar un método declarado y cada tupla es única. Métodos y
reglas se ordenan por sus IDs en orden ASCII determinista. No hay etiquetas
comerciales ni una promesa de soporte incorporadas al contrato.

`defineLocalPaymentMethodRequest(unknown)` recibe el mercado exacto y el
importe original, con moneda, unidades menores y exponente. Tanto la política
como la petición incluyen `currencyCatalogRef` y `marketCatalogRef`, cada
una con ID y versión. Las referencias de política y petición deben coincidir;
la composición las contrasta después contra ambos catálogos reales inyectados.

La forma exacta de petición es:

```ts
{
  schemaVersion: 1,
  id: string,
  marketId: string,
  original: { currency: string, exponent: 0 | 2 | 3, amountMinor: number },
  currencyCatalogRef: { id: string, version: number },
  marketCatalogRef: { id: string, version: number }
}
```

Los límites exportados en `LOCAL_PAYMENT_METHOD_LIMITS` son 100 métodos y
10.000 reglas. La política admite de uno a 100 métodos y de cero a 10.000
reglas; no se truncan entradas. Los importes y bordes son enteros seguros no
negativos, con `-0` rechazado; ambos bordes son inclusivos. `enabled` es un
booleano, no un valor convertido implícitamente. `minMinor <= maxMinor`;
un importe cero puede estar disponible cuando el rango incluye cero, sin
una excepción oculta. Los IDs opacos tienen hasta 100 caracteres y las
versiones son enteros positivos seguros. Mercado canónico en mayúsculas de
dos a 40 caracteres y moneda de tres letras ASCII mayúsculas.

Los exponentes admitidos son 0, 2 y 3. Una misma moneda debe tener el mismo
exponente en todas las reglas, incluidas las deshabilitadas y las de otro
contexto. Si la política conoce esa moneda, el exponente del importe original
debe coincidir; una contradicción produce error, no indisponibilidad silenciosa.

La entrada no admite campos de resultado FX ni respuestas del conversor; el
llamador debe aportar el importe original. El contrato no acredita su origen
en un pedido, un cálculo servidor o una lectura de base de datos. IDs/versiones
son referencias declaradas, no firmas o pruebas de autenticidad. El contrato
no solicita un reloj, instante, tasa, proveedor, precio o sesión de pago.

### Preview puro y motivos deterministas

`previewLocalPaymentMethods({ policy, request })` revalida ambas entradas.
Los errores estructurales, de referencia o de coherencia usan
`LocalPaymentMethodContractError`, código `local_payment_method_contract_invalid`.
Un resultado de disponibilidad no oculta datos corruptos como si fueran una
simple ausencia de configuración.

El resultado conserva:

```ts
{
  source: 'fixture',
  request: LocalPaymentMethodRequest,
  policyRef: { id: string, version: number },
  methods: Array<{
    methodId: string,
    outcome: 'available_in_fixture' | 'unavailable_in_fixture',
    reason: null | 'not_configured' | 'disabled' |
      'below_minimum' | 'above_maximum',
    matchedRule: LocalPaymentMethodRule | null
  }>
}
```

La evaluación aplica una precedencia cerrada:

1. Sin regla exacta: `not_configured`, con `matchedRule: null`.
2. Regla deshabilitada: `disabled`.
3. Importe menor que el mínimo: `below_minimum`.
4. Importe mayor que el máximo: `above_maximum`.
5. En el rango inclusivo: `available_in_fixture`, con `reason: null`.

Una regla deshabilitada puede explicar su estado sin convertirse en disponible
por satisfacer el rango. La ausencia de regla es distinta de una decisión
explícita deshabilitada. El nombre `available_in_fixture` conserva ese límite:
no autoriza un cobro real, crea una sesión ni acredita aceptación del proveedor.

### Composición y validación global

`previewLocalPaymentMethodsContext(unknown)` acepta exactamente
`{ markets, currencies, policy, request }`. Normaliza ambos catálogos mediante
sus APIs públicas y devuelve datos congelados:

```ts
{
  markets: MarketCatalog,
  currencies: CurrencyCatalog,
  policy: LocalPaymentMethodPolicy,
  result: LocalPaymentMethodsPreview
}
```

El resultado incluye los catálogos y la política completos normalizados; la
petición canónica vive en `result.request`. Sus IDs/versiones y los de la
política deben coincidir con los catálogos aportados. Una referencia no se
valida solo por nombre mientras se ignora su versión.

La composición verifica **todas las reglas**, aunque estén deshabilitadas o
pertenezcan a otro mercado: mercado y moneda conocidos, exponente exacto del
catálogo y moneda nominal de la regla igual a la del mercado. Para la
petición exige mercado conocido explícito,
`original.currency === market.currency` y exponente correcto de la moneda.
No acepta un selector con fallback ni convierte un importe para hacerlo encajar.

Los errores del contexto usan el error público de métodos; los catálogos
inválidos conservan el error de su dominio. El dominio de métodos no importa
internals de mercados o divisas: la composición conecta sus contratos
públicos sin invocar lectores runtime, precios o pagos.

## Fronteras de implementación

CHK-010 se registra parcial e instalada/inactiva en avanzado y demo,
dependiente de PLT-004. `payments` ya posee otras capacidades activas: añadir
este contrato no cambia su estado ni modifica ledger, checkout, captura,
cancelaciones, reembolsos o adaptadores operativos existentes.

No se añaden rutas, endpoints, jobs, healthchecks, cron, DDL, persistencia,
red, credenciales, proveedor, reloj real ni formularios enviados. La
disponibilidad fixture se explica en memoria, sin iniciar operaciones ni
consultar un catálogo externo de métodos. No se promete disponibilidad por
mercado de un proveedor concreto.

La configuración versionada e inyectada basta para probar el contrato. Las
decisiones comerciales de monedas, proveedores y métodos operativos
pertenecen a cada proyecto; no bloquean los fixtures ni crean una necesidad
artificial de migración o servicio externo.

## Verificación y alcance

[Verificación final](../../audits/r5-11b/verification-report.json), 2026-10-04:
`pnpm check` pasa 932 archivos sin diagnósticos, 239 suites/2.679 pruebas,
44 HTML, 44 formularios y cero crons. Focales: 86 de dominio, 30 de composición,
seis de arquitectura y 79 de manifest/registry. Revisión independiente de
6.366 aserciones sin P1/P2, efectos ni getters ejecutados. El bundle de
composición mide 25.741 B, sin ledger, D1, Stripe, checkout, configuración
operativa ni preview/adaptador FX efectivo; retiene una constante pura de
`markets` de 142 B. Implementado y verificado localmente, sin despliegue;
integración pendiente.

Se verifican tuplas exactas, ausencia/deshabilitación, bordes inclusivos,
enteros seguros, exponentes, referencias ID/versión, reglas ajenas al contexto,
errores de catálogos, inmutabilidad y ausencia de efectos. La revisión del
ADR frente al dominio y la composición no deja divergencias P1/P2.

E2E 168/168, navegador 340/340, ocho superficies a11y sin hallazgos y la base
QA intacta de 143 tablas/353 filas son
[evidencia heredada de R5.10b/PR #22](../../audits/r5-10b/verification-report.json).
Su SHA-256 antes/después es
`9cbfc811cfc4296515a403d395875a43bfa26aff0c9c9b08be0804b15bbf6eca`.
No son ejecuciones nuevas de R5.11b; este corte no modifica la UI o los
lectores runtime de la demo.

## Siguientes cortes

R5.11c tiene aprobado `/demo/admin/divisas`: mercados ES/FR/JP/KW coherentes,
importes nominales cerrados y monedas destino EUR/JPY/KWD. FX ofrece casos
vigente, caducado e indisponible; la identidad conserva el importe sin evidencia
fabricada. Los métodos se evalúan siempre sobre el original y permanecen
invariantes ante cambios de FX. Se usará formato exacto con `BigInt` y 32
respuestas fixture. La UI todavía no está implementada; demo visual pendiente,
sin activación de capacidades ni autorización de pagos reales.

Después, R5.12 consolidará el alcance demostrado con fixtures y sus límites
legales, SEO y de seguridad. Los previews no resuelven cobro, reembolso o
conciliación operativos; esos alcances no se dan por terminados por mostrar
un método o un importe en una demo.
