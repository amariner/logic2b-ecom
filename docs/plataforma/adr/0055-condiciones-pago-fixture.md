# ADR-0055 — Condiciones de pago y calendario civil con fixtures

- Estado: accepted; R6.4a implementado, verificado localmente e integrado en PR #33 (`cb3493ec`); sin activación ni despliegue.
- Fecha: 2026-10-04
- Bloque: R6.4a, condición declarada por empresa y calendario civil.
- Propietario: módulo `companies`, versión 1.3.0.
- Capacidad: B2B-003, alcance parcial, instalada/inactiva en avanzado/demo, dependencia única B2B-001; ausente en mínimo/estándar.
- Superficies operativas: ninguna. El módulo conserva su dependencia de `platform-configuration`.
- Visualización y estado de cobro: subcortes posteriores, sin implementación en a.

## Contexto

R6.3b está integrada en PR #32 (`04d5f9a9`), sin despliegue. La siguiente
capacidad es B2B-003: condiciones de pago, vencimiento y estado de cobro.
Calcular una fecha cubre solo una parte. El tiempo transcurrido no acredita
saldo pendiente, impago, autorización, captura ni pago completo.

El directorio de [ADR-0052](0052-directorio-empresas-fixture.md) identifica
empresas declaradas. Sus referencias no prueban identidad legal ni acuerdo
comercial. `preliminary-order.expiresAt` caduca un presupuesto; no constituye
un vencimiento de pago. El ledger de pagos conserva sus hechos financieros y
no participa en este contrato. El [ADR-0027](0027-documentos-operativos-no-fiscales.md)
mantiene la autoridad fiscal en el sistema externo.

## Decisión

El dominio `companies/domain/company-payment-terms.ts` normaliza el directorio
mediante la API de su propio módulo. No añade composición transversal,
agregador runtime, repositorio o dependencia operativa de `payments`.
Las APIs públicas reciben `unknown`:

- `defineCompanyPaymentTermsPolicy`.
- `defineCompanyPaymentTermsRequest`.
- `previewCompanyPaymentTerms`.
- `CompanyPaymentTermsContractError` y `COMPANY_PAYMENT_TERMS_LIMITS`.

### Política y asignación explícita

```ts
{
  schemaVersion: 1,
  source: 'fixture',
  id,
  version,
  calendar: 'utc-civil-days-v1',
  directoryRef: { id, version, capturedAt },
  assignments: [{
    companyId,
    condition: { kind: 'immediate' } | { kind: 'net_days', days },
    reminderOffsetsDays: [-7, 0, 5]
  }]
}
```

Cada empresa tiene como máximo una asignación. No hay herencia, prioridades,
catálogo adicional de condiciones, campo `enabled` ni fallback. `immediate`
no admite `days`, tampoco con valor `undefined`; `net_days` lo exige.
La política ordena asignaciones por `companyId` y offsets numéricamente.
Los valores del ejemplo son sintéticos, no condiciones comerciales recomendadas.

### Petición y correlación

```ts
{
  schemaVersion: 1,
  id,
  directoryRef: { id, version, capturedAt },
  policyRef: { id, version },
  companyId,
  baseDate,
  evaluationDate
}
```

`previewCompanyPaymentTerms` recibe exactamente `{ directory, policy, request }`.
Normaliza y copia los tres objetos completos antes de seleccionar la empresa
o devolver ausencia de configuración. Valida todas las asignaciones, también
las de otras empresas e inactivas. Las referencias de directorio de política
y petición deben coincidir con `id`, `version` y `capturedAt` del directorio;
`policyRef` debe coincidir con `id` y `version` de la política.

Estas comparaciones correlacionan revisiones declaradas. No autentican el
contenido, autoridad, historia, vigencia o acuerdo comercial. `capturedAt`
no es una fecha de vigencia ni determina `baseDate` o `evaluationDate`.
El llamador declara la base; el contrato no certifica que sea emisión de
factura, aceptación de pedido, entrega o inicio de una obligación.

### Calendario civil UTC explícito

El perfil `utc-civil-days-v1` acepta únicamente fechas gregorianas reales
`YYYY-MM-DD`, años 0001–9999. Rechaza año cero, fechas inexistentes, espacios,
timestamps, zonas horarias y formatos alternativos; no normaliza rollover.
La base cuenta como día cero: inmediato vence en la base y neto N suma N días
civiles. Sin días laborales, festivos, horas, horario de verano, regla de fin
de mes, gracia, intereses, redondeo o ajustes automáticos.

La evaluación puede preceder la base. Su posición se expresa como
`before_base`, `on_base` o `after_base`. Frente al vencimiento se devuelve
`before_due`, `on_due` o `after_due`. `daysUntilDue` es exactamente fecha de
vencimiento menos fecha de evaluación, en días enteros firmados.

Cada hito suma un offset al vencimiento. Puede caer antes de la base y se
conserva así. El offset cero no se añade implícitamente; un array vacío no
produce hitos. Cada resultado contiene:

```ts
{
  offsetDays,
  date,
  milestonePosition: 'upcoming' | 'today' | 'past',
  daysUntilMilestone
}
```

`daysUntilMilestone` es fecha del hito menos evaluación. Los hitos son puntos
del calendario: no tienen destinatario, canal, estado de envío, job, reintento
o identificador de comunicación. Que un hito esté en el pasado no indica que
se haya enviado ni que siga pendiente un recordatorio.

Vencimiento y todos los hitos de la asignación seleccionada deben caber en
0001-01-01–9999-12-31; cualquier overflow rechaza el resultado completo. Las
otras asignaciones se validan íntegramente, pero no se evalúan con la base de
una empresa ajena. La aritmética de días debe preservar los años 0001–0099,
sin el remapeo implícito de `Date.UTC(year, ...)`; no usa reloj implícito.

### Resultado descriptivo, ausencia e inactividad

El preview devuelve `source`, referencias de directorio/política, `requestId`,
perfil de calendario, empresa `{ id, state }`, fechas base/evaluación,
`basePosition`, `outcome`, `condition`, `dueDate`, `duePosition`,
`daysUntilDue` y `reminderMilestones`.

Con asignación, `outcome` es `configured`. Empresa existente sin asignación
produce `unconfigured`: condición, vencimiento, posición del vencimiento y
delta nulos, con hitos vacíos. Conserva las fechas explícitas y `basePosition`.
No convierte ausencia en inmediato o neto cero. Empresa inexistente es error.

Empresa inactiva conserva la lectura descriptiva de la condición declarada
en esta revisión. No se presenta como condición histórica, vigente o
autorizada. No altera el selector descriptivo ni los bloqueos comerciales de
catálogo/precios. El resultado no contiene importes ni `collectionStatus`.

### Límites y frontera estricta

| Dato | Límite del perfil fixture |
| --- | --- |
| Asignaciones | 0–100, empresas únicas |
| Offsets por asignación | 0–20, únicos |
| Días de neto N | Entero 1–3.650 |
| Offset del hito | Entero −3.650–3.650, incluido cero explícito |
| Identificadores | Gramática canónica de `companies`, 1–100 caracteres |
| Versiones | Enteros positivos seguros |
| `capturedAt` | UTC canónico de 24 caracteres conforme al directorio |

Son límites técnicos, no restricciones financieras o legales para un cliente.
Se rechazan `-0`, fracciones, `NaN`, infinitos y coerciones. Records exactos con
propiedades propias de datos y arrays densos limitados; sin getters, símbolos
o campos extra. Copias canónicas desacopladas y profundamente congeladas.

El error `CompanyPaymentTermsContractError` tiene código
`company_payment_terms_contract_invalid` y razones cerradas: `invalid_data`,
`duplicate_assignment`, `duplicate_offset`, `unknown_reference`,
`unknown_company`, `reference_mismatch` y `date_overflow`. El constructor solo
acepta la razón; mensajes fijos sin valores, paths, `cause` o eco de entrada.
Errores ajenos del directorio o trampas Proxy se redactan como `invalid_data`.
Errores contractuales preceden ausencia e inactividad descriptivas.

## Ejemplos e invariantes de verificación

- Neto 30 desde 2026-10-03 vence el 2026-11-02. Offsets −7/0/5 generan
  2026-10-26, 2026-11-02 y 2026-11-07; evaluación 2026-10-26 deja siete días
  para vencer y el primer hito en `today`.
- Inmediato desde 2026-10-03 evaluado el 2026-10-01 produce `before_base`,
  `before_due` y delta dos. No produce deuda, cobro o tarea.
- 1900 y 2100 no son bisiestos; 2000 y 2400 sí. Debe funcionar
  0099-12-31 + 1 = 0100-01-01 sin remapear el año.
- 9999-12-31 inmediato sin hitos es válido; sumarle un día o retroceder desde
  0001-01-01 es overflow. No se entrega una lista parcial de hitos.
- Una referencia ajena corrupta invalida el preview aunque la empresa
  seleccionada no tenga asignación. Los límites inclusivos, duplicados,
  errores redactados, orden, copias y freeze deben tener verificación propia.

Estos criterios están cubiertos por las verificaciones del contrato descritas a continuación.

## Estado y evidencia

[Verificación final R6.4a](../../audits/r6-4a/verification-report.json), 2026-10-04:
`pnpm check` pasa 971 archivos sin diagnósticos, 256 suites/3.473 pruebas,
44 HTML, 44 formularios locales y cero crons. Focales: 46 de dominio, seis de
arquitectura y 118 de registry/manifest/acceso (19/69/30). Revisión independiente:
21.702 comprobaciones, 15.090 casos de calendario y 336 fechas base; 14.327
resultados válidos y 763 overflow esperados. Las 96 fechas inválidas producen
192 rechazos al probar ambos campos. Sin P1/P2, efectos, getters o reloj implícito.

El bundle público de diagnóstico ocupa 12.249 B/3.802 B gzip, con dos fuentes
puras, directorio y condiciones, sin imports externos. No es un asset de UI.
La comparación nueva del build conserva íntegros los cuatro clientes de PR #32:
Cantidades, Catálogo por empresa, Empresas y guía; mismos nombres, grafos,
aristas, specifiers, SHA-256 y tamaños bytes/gzip, sin imports externos.
No hubo nuevas ejecuciones de Worker, HTTP, navegador, a11y, E2E o DB.

Navegador 2.084 comprobaciones/72 visitas, E2E 184/184, ocho superficies a11y
sin hallazgos y ocho capturas son evidencia heredada de R6.3b/PR #32. Su base QA
conservó 143 tablas/353 filas y SHA-256
`9cbfc811cfc4296515a403d395875a43bfa26aff0c9c9b08be0804b15bbf6eca`.
No constituyen una lectura o ejecución nueva en este corte puro. Implementado
y verificado localmente, integrado en PR #33 (`cb3493ec`), sin despliegue.

La comparación de assets mantiene Cantidades (53.687 B/17.349 B gzip),
Catálogo por empresa (60.527 B/19.836 B gzip), Empresas (26.856 B/8.818 B gzip)
y guía (15.154 B/6.300 B gzip). La evidencia heredada de interacción se conserva
porque este corte no cambia UI, SSR, estilos, shell, rutas o middleware;
igualdad de JavaScript por sí sola no prueba HTTP o DB.

## Continuidad y límites

R6.4a está integrada en PR #33 (`cb3493ec`), sin despliegue. R6.4b está
implementado y verificado localmente, integrado en PR #34 (`2d72d2f0`), según el [ADR-0056](0056-evidencia-cobro-fixture.md): perfil EUR,
obligación completa/versionada, evidencia aplicada/revertida correlacionada y
comparación firmada referida a `asOf`. El preview combinado consume el
calendario de este ADR desde datos normalizados, sin convertir posiciones
temporales en estado de cobro ni admitir vencimientos externos.

La obligación declarada no prueba deuda legal/fiscal; ausencia, evidencia
incompleta o futura no implican impago o saldo cero. R6.4c está implementada y
verificada localmente como demo conjunta, disponible en el repositorio con
integración pendiente y sin despliegue. B2B-003 y R6.4 siguen parciales, con operación real
separada y sin reutilizar importes esperados o caducidad de presupuesto como
evidencia financiera.

Sin DDL, persistencia, UI, rutas, jobs, crons, formularios, destinatarios,
proveedores o cambios de checkout/ledger. Crédito y aprobaciones B2B-004,
fiscalidad y plazos comerciales reales siguen fuera de este perfil fixture.
Desactivar la capacidad no borra datos: este corte no crea registros durables
ni activa superficies operativas.
