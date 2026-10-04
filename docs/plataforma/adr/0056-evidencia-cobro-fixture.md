# ADR-0056 — Evidencia de importes aplicados y revertidos con fixtures

- Estado: accepted; R6.4b implementado, verificado localmente e integrado en PR #34 (`2d72d2f0`). R6.4c implementada y verificada localmente, con integración pendiente; sin activación ni despliegue.
- Fecha: 2026-10-04
- Propietario: módulo `companies`, versión 1.4.0.
- Capacidad: B2B-003, parcial e instalada/inactiva en avanzado/demo, dependencia única B2B-001; ausente en mínimo/estándar.
- Dependencia de módulo: `platform-configuration`; sin nuevas capacidades, flags o superficies operativas.
- Demo: R6.4c, calendario y evidencia, verificada localmente y disponible en el repositorio; integración pendiente, sin despliegue.

## Contexto

R6.4a está integrada en PR #33 (`cb3493ec`), sin despliegue. El
[ADR-0055](0055-condiciones-pago-fixture.md) calcula calendario y condiciones
declaradas; `after_due` no prueba impago, captura o saldo. Este corte añade un
snapshot acotado de importes declarados aplicados y revertidos a una revisión
exacta de obligación sintética. Conserva calendario e importes como dimensiones
independientes y no crea un ledger ni una autoridad financiera.

`paymentSettlementCents` suma importes esperados de la intención, no importes
observados. `planPaymentCapture` confirma el importe exacto de una intención,
y `preliminary-order.expiresAt` caduca una oferta. Ninguno se reutiliza como
saldo o vencimiento B2B. La factura y su autoridad legal siguen fuera del
contrato, conforme al [ADR-0027](0027-documentos-operativos-no-fiscales.md).

## Decisión y API pública

`companies/domain/company-collection-evidence.ts` contiene el dominio y el
preview combinado; importa el calendario desde su archivo hermano, sin ciclo
por el barrel propio ni composición transversal. Se exportan:

- `defineCompanyCollectionObligation(input: unknown)`.
- `defineCompanyCollectionRequest(input: unknown)`.
- `defineCompanyCollectionEvidence(input: unknown)`.
- `evaluateCompanyCollectionEvidence(input: unknown)`.
- `previewCompanyCollection(input: unknown)`.
- `CompanyCollectionContractError` y `COMPANY_COLLECTION_LIMITS`.

Se exportan también los DTO reutilizables `CompanyCollectionEvidenceMetadata`
y `CompanyCollectionObservedAmounts`, junto a los tipos públicos del contrato.

### Obligación declarada y petición

```ts
{
  schemaVersion: 1,
  source: 'fixture',
  profile: 'company-applied-eur-cents-v1',
  id,
  version,
  directoryRef: { id, version, capturedAt },
  companyId,
  currency: 'EUR',
  amountCents,
  terms: { policyRef: { id, version }, baseDate }
}
```

`amountCents` es el importe esperado explícito de esta revisión sintética.
No se obtiene de catálogo, factura, pedido, impuestos, intención de pago,
condición o `capturedAt`. Se admite cero sin inferir que haya habido un pago.
La obligación no acredita deuda exigible, hecho fiscal o acuerdo comercial.

La petición es exactamente `{ schemaVersion: 1, id, evaluatedAt }`. El instante
de evaluación puede variar sin crear una nueva revisión de obligación.
Cambiar empresa, importe, base de calendario o referencias requiere correlación
con el contenido completo de la obligación; solo comparar id/version no basta.

### Evidencia completa o incompleta

```ts
{
  schemaVersion: 1,
  source: 'fixture',
  id,
  version,
  obligation, // obligación completa normalizada
  observedAt,
  coverage: 'complete',
  appliedCents,
  reversedCents
}
```

La variante `coverage: 'incomplete'` conserva los metadatos y la obligación,
pero no admite `appliedCents` o `reversedCents`, ni siquiera con `undefined`.
La ausencia se expresa con `null`, sin fechas o versiones inventadas.

`appliedCents` declara acumulado de cobros completados realmente asignados a
esta revisión hasta `observedAt`, incluidos los posteriormente revertidos.
Excluye expectativas, autorizaciones o cobros pendientes, promesas, importes
sin asignar, comisiones y aplicaciones a otra obligación. `reversedCents`
declara reversiones/desasignaciones completadas de importes ya incluidos en
el primer contador. Puede representar devolución, contracargo o retirada de
asignación sintéticos; no ejecuta esas operaciones ni acredita un estado de
proveedor. No se cuentan reversiones pendientes.

`complete` declara que ambos contadores cubren todo el alcance de aplicación
y reversión de esta obligación hasta esa observación; no prueba autenticidad.
Un importe neto inferior al esperado en evidencia completa es distinto de
una evidencia incompleta. No se agregan eventos, se selecciona el último
registro ni se acepta historial de transacciones.

### Importes y comparación firmada

El perfil es únicamente EUR y céntimos enteros seguros no negativos. Sin
catálogo de divisas, FX, moneda de mercado, precios, cantidades o impuestos.
Con intermediarios `BigInt`:

```text
netAppliedCents = appliedCents - reversedCents
differenceCents = obligation.amountCents - netAppliedCents
```

Se exige `0 <= reversedCents <= appliedCents`. Una pareja contradictoria es
`inconsistent_evidence`, incluso si la observación es futura; no se oculta
como `unknown`. La diferencia positiva muestra el importe no cubierto por
esas aplicaciones observadas; cero indica igualdad numérica y el valor
negativo conserva todo el exceso. No se recorta a cero ni se fabrica un
reembolso, saldo actual o deuda.

`amountPosition` es `below_expected`, `equal_expected` o `above_expected`.
`reversalPosition` es `none` cuando el contador revertido es cero, incluido
0/0; `full` solo con aplicaciones positivas y reversión igual; `partial` en
el resto de pares válidos. Una reversión total conserva los dos contadores
positivos aunque el neto sea cero. Esperado cero y observado 0/0 producen
igualdad y ninguna reversión, sin acreditar pago. Sin evidencia, esperado
cero sigue produciendo `unknown`.

Una revisión nueva no arrastra ni borra aplicaciones implícitamente. Exige
evidencia explícita para la obligación completa nueva; evidencia anterior
incompatible se rechaza, no se convierte en cero.

### Observación histórica y evaluación

`observedAt` y `evaluatedAt` son instantes UTC canónicos de 24 caracteres,
con fechas reales y años 0001–9999. No se acepta rollover, año cero, zonas
locales, espacios o reloj implícito. No se impone observación posterior a la
base del calendario: esa base no acredita creación de deuda ni primer pago,
y una aplicación anticipada puede conservarse como declaración sintética.

Tras validar forma, correlación completa y consistencia, la prioridad es:

1. Ausencia: `unknown` / `missing_evidence`.
2. Observación posterior a evaluación: `unknown` / `future_observation`.
3. Evidencia incompleta restante: `unknown` / `incomplete_evidence`.
4. Completa no futura, incluida igualdad exacta: `observed`.

No hay TTL, caducidad, ventana de frescura o antigüedad máxima. Una declaración
pasada permanece histórica y no certifica continuidad o ausencia de movimientos
posteriores. `observedAmounts.asOf` siempre es exactamente `observedAt`; no
se sustituye por `evaluatedAt` ni se presenta como saldo actual.

### Evaluador autónomo y contexto conservado

`evaluateCompanyCollectionEvidence` recibe exactamente
`{ obligation, request, evidence }`. Todos los resultados conservan `source`,
perfil, `requestId`, `evaluatedAt` y la obligación completa normalizada, con
empresa, moneda EUR, importe esperado y contexto de condición. Por sí solo
este evaluador no acredita la existencia de la empresa en un directorio externo.

`observed` añade metadatos de evidencia completa, `reason: null` e importes:
`asOf`, aplicado, revertido, neto, diferencia, posición monetaria y posición
de reversión. `unknown` conserva metadatos de evidencia si existe y una razón
cerrada, con `observedAmounts: null`; nunca expone contadores parciales o
derivados monetarios. El importe declarado permanece en la obligación y no
se confunde con un importe observado.

### Preview combinado: calendario real desde datos normalizados

`previewCompanyCollection` recibe exactamente
`{ directory, termsPolicy, obligation, request, evidence }` y devuelve:

```ts
{
  source: 'fixture',
  profile: 'company-applied-eur-cents-v1',
  requestId,
  company: { id, state },
  calendar,
  collection
}
```

La ubicación canónica de obligación es `collection.obligation`; no se duplica
en la raíz. Fuente, perfil e id de petición coinciden entre raíz/evaluación,
y `calendar.requestId` conserva el mismo id.

Construye la petición del calendario desde la obligación y petición ya
normalizadas: referencia de directorio, empresa, política/base de `terms` y
`evaluationDate = evaluatedAt.slice(0, 10)`. Invoca `previewCompanyPaymentTerms`
del mismo módulo; no copia aritmética civil ni relee objetos de entrada brutos
tras normalizarlos. No acepta `dueDate`, calendario, estado de cobro o hitos
externos suministrados por el llamador.

Se comparan todos los campos normalizados de obligación y evidencia, incluidos
schema, fuente, perfil, id/version, referencia completa del directorio,
empresa, moneda, importe y contexto de condiciones. El calendario valida
íntegros directorio y política, incluso registros ajenos o inactivos, antes
de cualquier respuesta combinada. Errores u overflow no devuelven resultado
parcial y no se esconden tras evidencia ausente, incompleta o futura.

Una condición ausente mantiene calendario `unconfigured` aunque haya importes
observados utilizables. No se inventa condición desde esos importes. Empresa
inactiva conserva ambos diagnósticos descriptivos, sin reactivar permisos,
crédito o compra; empresa desconocida sigue siendo error. Avanzar evaluación
puede cambiar posiciones o permitir una observación antes futura, pero no
crea aplicaciones, reversiones o notificaciones. Una vez admitida la observación,
sus importes y `asOf` no cambian al avanzar la evaluación.

### Frontera y errores

Una obligación y un snapshot de evidencia como máximo por preview. Contadores
0–`Number.MAX_SAFE_INTEGER`, sin `-0`, fracciones, coerciones, `NaN` o infinitos;
versiones positivas seguras e identificadores canónicos de `companies` de
1–100 caracteres. Se reutilizan límites/fechas de directorio y condiciones.
Los deltas firmados permanecen en rango seguro sin redondeo o clamp.

Records exactos con propiedades propias de datos, copias canónicas congeladas
profundamente; rechazo de getters sin ejecutarlos, símbolos, campos extra,
valores heredados y arrays corruptos. Mutaciones posteriores del llamador no
alteran los snapshots normalizados.

`CompanyCollectionContractError` usa código `company_collection_contract_invalid`
y razones cerradas: `invalid_data`, `unknown_company`, `unknown_reference`,
`reference_mismatch`, `inconsistent_evidence`, `duplicate_assignment`,
`duplicate_offset` y `date_overflow`. Constructor reason-only, mensajes fijos
sin valores, fechas, importes, ids, paths, errores originales o `cause`.
Mapea las razones cerradas del calendario; errores ajenos y trampas Proxy se
redactan como `invalid_data`. Evidencia ausente/no utilizable es un resultado
desconocido, no una excepción.

## Estado y verificación

**Implementado y verificado localmente; integrado en PR #34 (`2d72d2f0`), sin despliegue.**
[Verificación final R6.4b](../../audits/r6-4b/verification-report.json), 2026-10-04: `pnpm check` pasa
973 archivos sin diagnósticos, 257 suites/3.510 pruebas, 44 HTML,
44 formularios locales y cero crons. Focales: 37 de dominio, seis de arquitectura
y 118 de registry/manifest/acceso (19/69/30) de la ejecución de registro de este
corte. Revisión independiente: 22.216 comprobaciones, 3.944 casos monetarios
(2.093 válidos y 1.851 inconsistencias rechazadas) y 300 integraciones con
calendario (150 `observed`, 150 `unknown`); sin P1/P2, efectos, getters o reloj
implícito. Bundle público de diagnóstico: 18.153 B/4.925 B gzip, tres fuentes
puras, directorio/calendario/evidencia, sin imports externos; no es un asset UI.

Comparación nueva contra PR #33: cuatro grafos cliente iguales en nombres,
archivos, aristas, specifiers, SHA-256, bytes y gzip, sin imports externos.
También permanecen iguales las 349 fuentes de superficie y 19 CSS emitidos,
sin añadidos, eliminaciones o cambios. No se ejecutaron Worker, HTTP,
navegador, a11y, E2E o DB para este corte puro.

Navegador 2.084 comprobaciones/72 visitas, E2E 184/184, ocho superficies a11y
sin hallazgos, ocho capturas y base QA de 143 tablas/353 filas se heredan de
PR #32. Hash histórico, sin nueva lectura en b:
`9cbfc811cfc4296515a403d395875a43bfa26aff0c9c9b08be0804b15bbf6eca`.
El check de a/PR #33 (971 archivos/256 suites/3.473 pruebas) conserva su propio
corte. B2B-003 y R6.4 siguen parciales, sin activación u operación financiera.

Los grafos conservan Cantidades (53.687 B/17.349 B gzip), Catálogo de empresa
(60.527 B/19.836 B gzip), Empresas (26.856 B/8.818 B gzip) y guía
(15.154 B/6.300 B gzip). La comparación de las 349 fuentes de superficie no
es un grafo transitivo completo de SSR; estas comprobaciones no se presentan
como resultados nuevos de cabeceras HTTP, interacción o DB.

## R6.4c — Demo verificada localmente

**R6.4c está implementada y verificada localmente**, disponible en el
repositorio, con integración pendiente y sin despliegue. Ruta `/demo/admin/condiciones-pago`, «Condiciones y cobros de
ejemplo», en Clientes después de Cantidades. Dos selectores cerrados: 12 casos
y tres instantes de evaluación, con dos diagnósticos separados de calendario
e importes observados. Estado inicial: aplicación parcial y evaluación en el
día del vencimiento. Cambiar caso conserva evaluación; cambiar evaluación
conserva obligación/evidencia del caso. Reset/recarga al inicio, sin edición,
buffers, reloj o acciones financieras.

Casos incluidos: parcial, ausente, incompleto, futuro, aplicado cero, inmediato
con igualdad, exceso, reversión parcial/total, declarado cero, sin condición
y empresa inactiva. Los importes muestran su observación `asOf`; unknown
elimina importes/atributos derivados y no inventa ceros. Igualdad numérica
no se etiqueta como pago ni calendario como impago. Calendario sin condición
conserva derivados nulos aunque haya evidencia observada.

La demo consume los contratos públicos, con SSR inicial completo, controles
inertes sin JavaScript y gate manifest demo AND `DEMO_MODE=true`; privada/noindex,
solo memoria y sin I/O. Verificados 36 estados por tamaño, 72 visitas en
1.440/375 px, ocho capturas y ocho superficies a11y (parcial/en vencimiento,
sin evidencia/después, exceso y sin condición). La operación real permanece
fuera de este corte.

B2B-003 y R6.4 permanecen parciales. No se acreditan deuda legal/fiscal,
autenticidad bancaria, liquidación, conciliación, movimiento de dinero,
autorización, reembolso, crédito, intereses o envío de recordatorios.
La operación real y sus fuentes de autoridad conservan un alcance separado.

### Verificación de R6.4c

**Implementada y verificada localmente, disponible en el repositorio.**
Integración pendiente, sin despliegue. B2B-003 permanece parcial e instalada/inactiva.
[Verificación final R6.4c](../../audits/r6-4c/verification-report.json), 2026-10-04: `pnpm check` pasa
977 archivos sin diagnósticos, 258 suites/3.560 pruebas, 50 del modelo y seis
de arquitectura; build de 44 HTML/44 formularios locales, sin envíos, beacons
o crons. Revisión independiente: 23.857 comprobaciones, 36 estados y 540
transiciones, sin P1/P2, efectos, getters o reloj implícito. Matriz: 28 estados
con observación y ocho desconocidos, 33 calendarios configurados y tres sin
condición; los importes no se convierten en indicadores de autorización.

QA nueva: navegador 2.660 comprobaciones/72 visitas, ocho superficies a11y sin
hallazgos y ocho PNG revisadas por frontend; root contrastó cuatro. E2E nuevo
188/188 y Worker cerrado. La base QA conserva 143 tablas/353 filas con SHA-256
antes/después idéntico:
`9cbfc811cfc4296515a403d395875a43bfa26aff0c9c9b08be0804b15bbf6eca`.
Estas ejecuciones corresponden a c; los checks de a/b y la interacción de
PR #32 conservan sus cortes históricos.

Cliente real: tres archivos, 31.812 B/9.612 B gzip, sin imports externos;
arranque sin raíz con una consulta DOM, 82 fechas explícitas y cero efectos.
Es una sonda diferente de la interacción de navegador. El diagnóstico del
modelo ocupa 26.964 B/7.341 B gzip, cuatro fuentes puras. La guía, medida por
separado, ocupa 15.171 B/6.309 B gzip; el incremento de 17 B/9 B gzip se limita
a añadir `condiciones-pago` a la lista de rutas permitidas. Su sonda sin raíz
no atribuye ausencia de efectos a las interacciones propias de la guía.

## Continuidad: R6.5a

**R6.5a — Límites de crédito declarados con fixtures** es el siguiente corte,
con diseño exacto por fijar y sin implementación. La dirección es separar
política por empresa/comprador, solicitud explícita y evidencia declarada de
exposición; no convertir diagnóstico de límites en autorización de compra.
No se reutilizan saldo regalo, `differenceCents` de R6.4 o roles descriptivos
como crédito o permiso. Esquema, límites técnicos, cobertura y temporalidad
requieren diseño y revisión propios antes de implementar; criterios y límites
comerciales reales permanecen fuera del ensayo. El workflow de aprobación
humana y su demostración se definirán en subcortes posteriores.
