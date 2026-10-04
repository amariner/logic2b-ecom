# ADR-0057 — Límites de crédito declarados con fixtures

- Estado: accepted; R6.5a implementado y verificado localmente, integrado en PR #36 (`787a9e73`). Sin activación ni despliegue.
- Fecha: 2026-10-04.
- Módulo: `companies` 1.5.0; dependencia de módulo `platform-configuration`.
- Capacidad: B2B-004 parcial, instalada/inactiva en avanzado/demo, ausente en mínimo/estándar; dependencia única B2B-001 y superficies operativas vacías.
- Perfil: `company-credit-eur-cents-v1`.
- Continuidad: R6.4c integrada en PR #35 (`b1bf0d2a`); R6.5b verificado localmente/integración pendiente y demo R6.5c en diseño.

## Contexto

R6.5 pide límites por empresa/comprador y un workflow humano. Son dos problemas
separados: comparar importes con una política declarada no acredita identidad,
concede crédito, reserva capacidad ni autoriza una compra. Este primer corte
ofrece tres diagnósticos numéricos independientes sobre datos sintéticos.

El directorio ya describe empresas y contactos con propiedad explícita, pero
sus roles no son permisos. El saldo regalo es prepago; los importes esperados
del ledger no son exposición observada. La diferencia de una obligación de
R6.4 es un dato acotado a esa obligación y a su observación, no una exposición
empresarial completa. Ninguno se reutiliza como fuente de este contrato.

## Decisión

Definir una política EUR versionada con tres colecciones independientes:

| Colección | Regla | Importe comparado |
|---|---|---|
| `companyExposureLimits` | `{companyId, limitCents}` | Exposición empresarial declarada, excluida la solicitud, más el importe íntegro de esta |
| `companyRequestLimits` | `{companyId, limitCents}` | Importe de esta solicitud de la empresa |
| `buyerLimits` | `{companyId, contactId, requestLimitCents}` | Importe de esta solicitud del contacto de esa empresa |

Los dos últimos límites son **por solicitud**. No representan presupuesto
mensual, gasto acumulado, exposición individual ni reglas por sede. No hay
herencia, precedencia o sustitución entre colecciones; una puede estar vacía
mientras las demás contienen reglas. La misma empresa puede aparecer una vez
en cada colección empresarial. Una ausencia afecta solo a su comparación y
no significa cero, ilimitado o un límite derivado de otro destinatario.

La solicitud y los límites admiten cero explícito. La igualdad con cero sigue
siendo una relación numérica; no autoriza operación ni evita la necesidad de
evidencia completa para comparar exposición empresarial.

## API y datos de entrada

El dominio puro es `src/modules/companies/domain/company-credit.ts`,
exportado por la API pública de `companies`:

- `defineCompanyCreditPolicy(input: unknown)`.
- `defineCompanyCreditRequest(input: unknown)`.
- `defineCompanyCreditExposureEvidence(input: unknown)`.
- `previewCompanyCredit(input: unknown)`, entrada exacta `{directory, policy, request, evaluatedAt, evidence}`.
- `CompanyCreditContractError` y `COMPANY_CREDIT_LIMITS`.

`DirectoryRef` contiene `{id, version, capturedAt}` y `PolicyRef` contiene
`{id, version}`. Son referencias declarativas exactas, sin autenticar el origen
ni detectar un cambio oculto de contenido bajo idénticas revisiones declaradas.

La política contiene `schemaVersion:1`, `source:'fixture'`, perfil, `id`,
`version`, `directoryRef`, `currency:'EUR'` y las tres colecciones completas.
La solicitud contiene `schemaVersion:1`, `source:'fixture'`, perfil, `id`,
`version`, `directoryRef`, `policyRef`, `companyId`, `buyerContactId`,
`currency:'EUR'` y `amountCents`. No es pedido, factura, obligación ni reserva.

`buyerContactId` debe existir en el directorio normalizado y pertenecer a la
empresa seleccionada. Todas las reglas validan referencias y propiedad,
incluso las ajenas a la solicitud o dirigidas a entidades inactivas. No se
infiere comprador desde perfil, email/hash, VAT, nombre, roles o sede, ni se
deduplican contactos por identidad externa.

El contexto de salida conserva únicamente IDs y estados de empresa/contacto,
con `inactiveReasons` ordenados (`company_inactive`, `buyer_inactive`). Una
entidad inactiva mantiene sus diagnósticos descriptivos, sin saltar validación,
conceder permisos o restaurar bloqueos comerciales existentes.

## Evidencia de exposición

Cada evidencia tiene `schemaVersion:1`, `source:'fixture'`, `id`, `version`,
`excludedRequest` y `observedAt`. La cobertura determina el resto:

- `coverage:'complete'` exige `companyExposureCents`, agregado no negativo de la exposición empresarial completa declarada a esa fecha.
- `coverage:'incomplete'` omite el contador por completo; tampoco admite el campo con valor `undefined`.
- Ausencia de evidencia se expresa mediante `null`, sin fabricar revisión, fecha o contador.

`excludedRequest` es una copia completa normalizada de la solicitud: esquema,
fuente, perfil, ID/versión, referencias completas de directorio y política,
empresa, comprador, moneda e importe. La correlación compara todos los campos;
no basta con compartir IDs. Cambiar un campo exige evidencia correlacionada con
el nuevo artefacto, también si la evidencia es futura o incompleta.

La cobertura completa declara que el contador corresponde al mismo alcance
empresarial completo y **excluye todo el importe de esa solicitud**. No es una
página, un comprador aislado o un conjunto parcial. El motor suma la solicitud
una sola vez, sin modos de inclusión ambiguos ni restas heurísticas:

```text
companyExposureWithRequestCents = companyExposureCents + request.amountCents
```

Se preservan contador original y `asOf`. La proyección es hipotética sobre ese
corte: no registra movimientos, reserva crédito, garantiza ausencia de otras
solicitudes concurrentes ni acredita disponibilidad actual. Cobertura y
exclusión son declaraciones sintéticas correlacionadas, no pruebas contables
o firmas. Una revisión nueva de solicitud no arrastra exposición anterior
implícitamente ni la reinicia a cero.

## Temporalidad y desconocidos

`evaluatedAt` es explícito y separado de la solicitud estable. Tanto ese campo
como `observedAt` usan instantes UTC canónicos de 24 caracteres, fechas reales
y años 0001–9999; no offsets locales, rollover, año cero o reloj implícito.
`capturedAt` sigue siendo metadato del directorio, no una fecha de vigencia.

Después de validar y correlacionar todo:

1. Evidencia `null`: `unknown`, motivo `missing_evidence`.
2. Observación posterior a `evaluatedAt`: `unknown`, motivo `future_observation`.
3. Cobertura incompleta: `unknown`, motivo `incomplete_evidence`.
4. Cobertura completa no futura: `observed`; la igualdad temporal es válida.

El futuro tiene prioridad diagnóstica sobre cobertura incompleta, sin ocultar
datos inválidos. En `unknown`, `amounts:null`; se preservan metadatos de evidencia
si existen. En `observed`, importes con `asOf` exactamente igual a `observedAt`.
No hay TTL ni caducidad inferida: avanzar evaluación no cambia una observación
histórica ni la convierte en saldo actual.

## Tres comparaciones y ninguna aprobación agregada

El preview conserva solicitud completa, referencias, evaluación, contexto,
exposición y `comparisons.{companyExposure,requestAmount,buyerAmount}`.

| Situación | Estado de la comparación | Datos conservados |
|---|---|---|
| Regla configurada e importe conocido | `compared` | Límite, importe comparado, diferencia firmada y posición |
| Sin regla en esa colección | `unconfigured` | Importe comparado si se conoce; límite/diferencia/posición `null`, motivo `limit_unconfigured` |
| Límite empresarial de exposición configurado y exposición desconocida | `unknown` | Límite conocido; importe/diferencia/posición `null`, motivo de exposición |

Las dimensiones de solicitud y comprador comparan un importe conocido sin
requerir exposición empresarial. Por ello pueden estar `compared` cuando
`companyExposure` sea `unknown`. Sin regla de exposición, esa comparación es
`unconfigured`; el diagnóstico de exposición separado conserva su motivo de
ausencia, futuro o incompletitud.

```text
differenceCents = limitCents - comparedCents
position = below_limit | equal_limit | above_limit
```

La diferencia negativa conserva el exceso. No se limita a cero, no se redondea
ni se convierte en crédito disponible. `below_limit` y `equal_limit` no aprueban;
`above_limit` no ejecuta rechazo ni inicia revisión humana. La salida carece de
resultado agregado aprobado, elegible, disponible o comprable, incluso cuando
las tres comparaciones quedan por debajo de sus límites.

## Validación, límites y privacidad

Fronteras `unknown` estrictas, registros exactos con datos propios, arrays
densos y copias canónicas profundamente congeladas. Se rechazan getters,
símbolos, propiedades ocultas, prototipos ajenos y campos extra incluso con
`undefined`; ningún cálculo vuelve a leer las entradas originales.

Se normalizan directorio, política, solicitud, evaluación y evidencia completos
antes de seleccionar. Se validan todas las reglas, referencias exactas de
política/directorio, existencia y propiedad del comprador y correlación de la
solicitud excluida. No hay retorno parcial frente a error.

| Límite técnico | Valor |
|---|---|
| Reglas de exposición empresarial | 0–100, empresa única dentro de la colección |
| Reglas de solicitud empresarial | 0–100, empresa única dentro de la colección |
| Reglas de comprador | 0–2.000, tupla empresa/contacto única |
| Solicitudes y evidencias por preview | Una solicitud; una evidencia o `null` |
| Importes, límites y exposición | EUR, enteros entre 0 y `Number.MAX_SAFE_INTEGER` |
| IDs | Gramática canónica de `companies`, 1–100 caracteres |
| Versiones | Enteros seguros positivos |

El orden es canónico por empresa y por empresa/contacto. Los máximos son
simultáneos e independientes; no son criterios comerciales. Se rechazan `-0`,
fracciones, strings, coerciones, `NaN`, infinitos y límites `null`.

La suma y las diferencias usan `BigInt`. Una evidencia completa cuya exposición
más solicitud supere el entero seguro produce `exposure_overflow` **antes** de
cualquier rama temporal, inactiva o sin reglas. Una evidencia corrupta futura
no se convierte en desconocida para ocultar overflow. La diferencia entre
operandos no negativos seguros permanece dentro del rango firmado seguro.

`CompanyCreditContractError` tiene código `company_credit_contract_invalid` y
motivos cerrados: `invalid_data`, `duplicate_company_exposure_limit`,
`duplicate_company_request_limit`, `duplicate_buyer_limit`, `unknown_reference`,
`unknown_company`, `unknown_buyer`, `cross_company_reference`,
`reference_mismatch` y `exposure_overflow`. Constructor solo por motivo;
mensajes fijos sin IDs, importes, fechas, nombres, entradas ni `cause`. Fallos
ajenos del directorio o de Proxy se redactan. La salida no publica campos de
identidad, hash, VAT, roles o datos personales de contacto.

## Registro y límites de alcance

B2B-004 queda parcial e instalada/inactiva en avanzado/demo. `companies` 1.5.0
mantiene dependencia de módulo `platform-configuration`; la capacidad depende
únicamente de B2B-001. B2B-009 sigue pendiente. No hay superficies operativas,
DDL, endpoints, jobs, reloj implícito, proveedor, notificaciones o I/O.

No se importa R6.4 para reconstruir exposición ni se compensan saldos regalo,
cobros, devoluciones, impuestos o descuentos. Se preservan ledger, checkout,
pricing y autenticación; este perfil no añade FX ni monedas operativas.
Una solicitud declarada no prueba identidad, delegación, deuda o financiación.

## Verificación y continuidad

**Implementado y verificado localmente; integrado en PR #36 (`787a9e73`), sin despliegue.**
[Verificación final R6.5a](../../audits/r6-5a/verification-report.json), 2026-10-04:
`pnpm check` pasa 979 archivos sin diagnósticos, 259 suites/3.605 pruebas;
44 de dominio, seis de arquitectura y 119 de registry/manifest/acceso
(19/70/30). Build de 44 HTML/44 formularios locales, sin envío, beacon ni cron.
Revisión independiente: 51.363 comprobaciones, 4.375 casos monetarios Python
(2.813 válidos/1.562 overflow) y 160 contextos; cero P1/P2, efectos, getters o
reloj implícito. Bundle público de diagnóstico: 15.266 B/4.277 B gzip;
directorio/crédito y una constante histórica de R6.4 de 113 B retenida por el
barrel, sin cálculo R6.4 ni imports operativos. No es un asset de UI.

Comparación nueva contra PR #35: cinco grafos cliente idénticos en nombres,
imports, archivos, bytes, gzip y SHA-256. También permanecen iguales las
352 fuentes de superficie explícitamente inventariadas y los 19 CSS emitidos.
Los grafos son Condiciones/cobros (31.812 B/9.612 gzip), Cantidades
(53.687/17.349), Catálogo por empresa (60.527/19.836), Directorio
(26.856/8.818) y guía (15.171/6.309). La comparación no cubre todo el grafo
transitivo SSR ni equivale a una ejecución runtime.

Navegador 2.660 comprobaciones/72 visitas, E2E 188/188, ocho superficies a11y
sin hallazgos, ocho PNG y base QA de 143 tablas/353 filas son evidencia
**heredada de PR #35**, sin nuevas ejecuciones de Worker, HTTP, navegador,
a11y, E2E o DB en este corte puro. Hash histórico antes/después:
`9cbfc811cfc4296515a403d395875a43bfa26aff0c9c9b08be0804b15bbf6eca`.
El workflow humano R6.5b está verificado localmente, con integración pendiente; la demo visual R6.5c está en diseño.

**R6.5b está implementado y verificado localmente**, según el [ADR-0058](0058-revision-credito-fixture.md):
expediente fixture con contexto íntegro, política explícita de contactos y
quórum, estado derivado del historial, versión `1+n`, terminalidad y replay
sobre el snapshot actual. La igualdad de contexto precede replay/conflictos;
solo las decisiones aplicadas registran ID. No hay concurrencia durable.
Aceptación declarada no equivale a crédito concedido; contacto no equivale a
persona y los diagnósticos financieros desconocidos o excedidos no cambian.
`companies` 1.6.0 conserva B2B-004 parcial e instalada/inactiva.
Implementado y verificado localmente, integración pendiente/sin despliegue:
981 archivos sin diagnósticos, 260 suites/3.653 pruebas, 48 dominio/seis
arquitectura/119 registro y revisión de 33.973 comprobaciones sin P1/P2.
Cinco grafos, 352 fuentes de superficie y 19 CSS iguales a PR #36; interacción
y base QA heredadas de PR #35. [Informe final](../../audits/r6-5b/verification-report.json).

**Siguiente: R6.5c, demo conjunta en diseño, sin código ni QA todavía.**
`/demo/admin/credito`, «Límites y revisión de crédito», en Clientes: quince
contextos cerrados, incluidas las tres colecciones configuradas por separado;
apertura explícita, selector de contacto, aceptación/rechazo declarados y reset.
Se conservan diagnóstico numérico e historial como dimensiones separadas,
sin controles técnicos de CAS ni traslado de votos al cambiar contexto.
Ocho capturas previstas, aún no realizadas. Sin autoridad comercial, DDL,
proveedor, I/O, reserva ni cambios de checkout o ledger.

La demo conjunta vendrá después de los contratos. No se declara resuelta la
identidad autenticada, la autorización de compra, el crédito operativo ni la
ola R6.5 completa; tampoco se fijan criterios comerciales reales en este ADR.
