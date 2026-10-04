# ADR-0058 — Expediente de revisión de crédito con fixtures

- Estado: accepted; R6.5b verificado localmente, 3.653 pruebas; integración pendiente. Sin activación ni despliegue.
- Fecha: 2026-10-04.
- Módulo: `companies` 1.6.0; dependencia `platform-configuration`.
- Capacidad: B2B-004 parcial, instalada/inactiva en avanzado/demo, ausente en mínimo/estándar; dependencia única B2B-001 y superficies operativas vacías.
- Perfil: `company-credit-review-v1`.
- Continuidad: R6.5a integrada en PR #36 (`787a9e73`); demo conjunta R6.5c pendiente.

## Contexto y decisión

El [ADR-0057](0057-limites-credito-fixture.md) compara tres límites declarados
sin producir una aprobación financiera. Este corte añade un expediente puro
de decisiones declaradas sobre su contexto completo. `accepted` significa
que se alcanzó el quórum del ejemplo; no concede crédito, acredita identidad,
reserva importe ni autoriza una compra. `rejected` tampoco ejecuta un rechazo
comercial. El expediente no se abre automáticamente al superar límites.

Una política fixture declara contactos revisores, separación del comprador y
quórum. Son reglas explícitas del perfil de simulación, sin inferir autoridad
desde roles del directorio. No se reutiliza la aprobación de `preliminary-order`,
que expresa aceptación de una oferta, ni saldo regalo, cobros, ledger o B2B-009.
R6.5 y B2B-004 siguen parciales, con operación real y demo pendientes.

## API y artefactos

El dominio es `companies/domain/company-credit-review.ts`, con imports
de archivos hermanos de directorio y crédito, exportado por la API pública:

- `defineCompanyCreditReviewPolicy(input: unknown)`.
- `defineCompanyCreditReviewCase(input: unknown)`.
- `createCompanyCreditReviewCase(input: unknown)`: `{id, createdAt, context}`.
- `previewCompanyCreditReview(input: unknown)`: `{case, context}`.
- `applyCompanyCreditReviewDecision(input: unknown)`: `{case, context, command}`.
- `CompanyCreditReviewContractError` y `COMPANY_CREDIT_REVIEW_LIMITS`.

La política contiene `schemaVersion:1`, `source:'fixture'`, perfil, `id`,
`version`, `directoryRef:{id,version,capturedAt}`, `companyId`,
`reviewerContactIds`, `buyerSeparation:'required'|'allowed'` y `quorum`.
Una política explícita para una empresa por expediente; no hay descubrimiento,
herencia o prioridad entre políticas.

El contexto contiene el directorio completo, `creditPolicy`, solicitud completa
`request`, `evaluatedAt`, evidencia completa o `null` y `reviewPolicy`. Todos se
normalizan y validan, y el preview de crédito se recalcula mediante R6.5a desde
esas copias. No se admite un preview financiero arbitrario como fuente.

El expediente contiene `schemaVersion:1`, `source:'fixture'`, perfil, `id`,
`version`, `createdAt`, contexto completo y `decisions`. Cada comando declara
`id`, `caseId`, `expectedVersion`, `reviewerContactId`,
`decision:'accept'|'reject'` y `occurredAt`. No hay notas, motivos libres,
adjuntos, destinatarios ni datos de autenticación.

## Contactos y apertura

La política admite entre uno y veinte contactos distintos, existentes y propios
de su empresa. Se valida toda la lista, incluso contactos inactivos o no usados.
La elegibilidad descriptiva exige contacto activo, explícitamente seleccionado
y permitido por la separación del comprador:

- `required` excluye al `buyerContactId`, aunque esté en la lista.
- `allowed` admite su declaración cuando figura explícitamente y está activo.
- Contactos inactivos se conservan en la política pero no cuentan para quórum.

Quórum entero entre uno y veinte, sin superar la lista declarada. Tras aplicar
estado y separación, la apertura exige suficientes contactos elegibles.
Empresa inactiva, comprador inactivo o quórum inalcanzable bloquean apertura,
por ese orden y después de validar todo. No modifican los diagnósticos
financieros descriptivos de R6.5a.

Un voto corresponde a un **contacto declarado**, no a una persona autenticada.
Dos contactos que comparten identidad externa no se fusionan: un voto por
contacto no acredita una persona/un voto. No se consulta `identityRef`, email,
hash, VAT, nombre, rol o sede para asignar autoridad.

`create` válido produce versión 1, historial vacío, estado `pending`, cero
aceptaciones y `lastOccurredAt=createdAt`. La creación bloqueada devuelve
contexto, crédito y revisores elegibles, sin fabricar un expediente abierto.

## Contexto completo e inmutable

El expediente conserva una copia canónica de todos los artefactos, no solo sus
IDs o las tres comparaciones. `preview` y `apply` reciben además el contexto
completo y exigen igualdad íntegra con el almacenado **antes de replay,
comparación de versión o bloqueo terminal**.

Cambiar solicitud, importe, comprador, directorio —incluso un contacto ajeno—,
reglas no seleccionadas, política de revisión, evidencia o `evaluatedAt` exige
un expediente nuevo sin decisiones. No hay edición, revinculación, migración
de votos, reapertura o reset del historial. Un expediente anterior sigue
representando su contexto anterior; no acredita vigencia frente a cambios
externos no suministrados.

La correlación completa no es firma, autenticación ni registro inviolable.
Un artefacto entero reescrito coherentemente no puede detectarse mediante una
función pura. El llamador aporta los IDs; sin repositorio global el motor no
acredita que un expediente distinto nunca reutilizó uno de ellos.

## Historia y estado derivado

El expediente no acepta estado ni contadores calculados como entrada. Se
reconstruye todo el historial desde el contexto normalizado y la apertura:

| Acción declarada válida | Resultado del expediente |
|---|---|
| `accept` sin alcanzar quórum | `pending`, una aceptación adicional |
| `accept` que alcanza quórum | `accepted`, terminal |
| Primer `reject` | `rejected`, terminal aunque hubiera aceptaciones previas |
| Comando nuevo tras terminal | Bloqueado, sin cambios |
| Replay exacto de decisión registrada | Snapshot actual completo, sin cambios |

Cada contacto decide una sola vez. No hay abstención, revocación, sustitución
del voto o reapertura. Un segundo comando del contacto se bloquea si sigue
pendiente; en expediente terminal prima el bloqueo por terminalidad.

`case.version` es exactamente `1 + decisions.length`. Cada comando histórico
comparte `caseId` y, en posición `i` empezando en cero, tiene
`expectedVersion=i+1`. IDs de comando y contactos son únicos en todo el
historial; se conserva orden declarado, incluso con fechas iguales. Todo voto
debe ser elegible y no puede existir uno posterior al primer rechazo o al
quórum. Un historial imposible produce error, sin confiar en un estado externo.

El snapshot conserva expediente, preview financiero íntegro, estado derivado,
quórum, aceptación acumulada, listas canónicas de revisores elegibles/decididos/
restantes y `lastOccurredAt`. `unknown`, `unconfigured`, sus valores `null` o
`above_limit` permanecen intactos aunque el expediente se declare aceptado.
Puede declararse rechazado con importes bajo límite: ninguna relación numérica
toma la decisión humana ni se convierte en permiso.

## Replay, conflictos y orden de evaluación

Se normalizan expediente/historia, contexto y comando completos antes de
producir una salida. Tras igualdad de contexto y `caseId`, se valida existencia
y propiedad del revisor incluso si la expectativa de versión no coincide.

1. ID ya registrado y payload completo idéntico: `replayed`, con el snapshot actual, incluida cualquier decisión posterior.
2. ID registrado con otro payload: `conflict/command_id_reused`.
3. ID nuevo y expectativa distinta: `conflict/version_mismatch`, sin reintento automático.
4. Versión actual y expediente terminal: `blocked/case_terminal`.
5. Pendiente: se comprueban contacto ya decidido, selección, actividad y separación del comprador.
6. Decisión nueva aplicable: fecha no regresiva, añadir un comando e incrementar versión una vez.

El payload idempotente incluye `caseId`, `expectedVersion`, contacto, decisión
y fecha; no basta el ID. Un `caseId` ajeno es error de referencia. Contexto
cambiado se rechaza antes de considerar un replay, aunque el comando exista.

Solo comandos `applied` se registran. Bloqueos y conflictos no consumen IDs ni
acreditan recepción; un comando no registrado puede volver a presentarse con
una expectativa explícitamente revisada. Dos comandos para una versión no se
fusionan: después de aplicar uno, el otro entra en conflicto. No hay CAS,
idempotencia, exclusión mutua o auditoría durable de servidor.

Repetir `create` con el mismo contenido genera un artefacto equivalente, no un
replay contra un almacén. La ausencia de repositorio también limita cualquier
afirmación de unicidad global o continuidad entre llamadas.

## Fechas, fronteras y límites

`createdAt >= context.evaluatedAt`; cada decisión nueva aplicable tiene
`occurredAt >= lastOccurredAt`. Fechas iguales son válidas. Instantes UTC
canónicos de 24 caracteres y años 0001–9999, sin reloj implícito, TTL o calendario
laboral. `capturedAt` conserva la frontera del directorio, incluido año cero,
y no expresa vigencia. La evidencia futura puede permanecer `unknown`; no se
exige convertirla en observación al abrir un expediente.

El replay exacto conserva su fecha histórica: no se compara con la última
fecha como si fuera una decisión nueva. El historial ya se valida como secuencia
no regresiva. Un comando nuevo bloqueado o conflictivo no se aplica al historial.

| Límite técnico | Valor |
|---|---|
| Revisores de política | 1–20 contactos únicos |
| Quórum | 1–20, no superior a la lista declarada |
| Decisiones por expediente | 0–20 |
| Versión del expediente | 1–21, exactamente uno más que el número de decisiones |
| Expedientes y comandos por llamada | Uno |
| Contexto | Límites completos de directorio y R6.5a, sin duplicarlo por voto |

IDs canónicos `companies` de 1–100 caracteres; versiones de política y
expectativas enteras seguras positivas sin `-0`. Entradas `unknown` exactas,
registros de datos propios, arrays densos, sin getters, símbolos, propiedades
ocultas, prototipos ajenos o extras `undefined`. Copias canónicas profundamente
congeladas y comparación serializada solo después de validar; no se releen
originales ni se serializa entrada arbitraria.

## Errores y privacidad

`CompanyCreditReviewContractError`, código `company_credit_review_contract_invalid`,
usa motivos cerrados: `invalid_data`, `credit_context_invalid`,
`duplicate_reviewer`, `unknown_reference`, `cross_company_reference`,
`reference_mismatch`, `context_mismatch`, `invalid_history` e
`invalid_chronology`. Conflicto de versión o ID reutilizado es salida `conflict`,
no excepción. Las comprobaciones contractuales completas preceden los bloqueos.

Constructor por motivo y mensajes fijos, sin IDs, importes, fechas, datos de
entrada o `cause`. Errores de crédito/directorio se redactan como
`credit_context_invalid`, y errores arbitrarios/Proxy no filtran contenido.

El expediente íntegro puede contener datos del directorio. No se añaden logs,
persistencia o endpoints; una futura demo proyectará solo etiquetas sintéticas
y omitirá referencias técnicas e identidades privadas. El contrato no convierte
un hash de email en anonimización ni una referencia de perfil en autenticación.

## Registro, verificación y continuidad

`companies` 1.6.0 conserva capacidades y dependencias existentes. B2B-004 sigue
parcial e instalada/inactiva en avanzado/demo, ausente mínimo/estándar, con
única dependencia B2B-001. Sin superficies operativas, DDL, jobs, notificaciones,
proveedores, autenticación, reserva, checkout o cobro; B2B-009 permanece pendiente.

**Implementado y verificado localmente; integración pendiente, sin despliegue.**
[Verificación final R6.5b](../../audits/r6-5b/verification-report.json), 2026-10-04:
`pnpm check` pasa 981 archivos sin diagnósticos, 260 suites/3.653 pruebas;
48 de dominio, seis de arquitectura y 119 de registry/manifest/acceso.
Build de 44 HTML y 44 formularios locales, con cero crons.
Revisión independiente: 33.973 comprobaciones, 128 historiales, 4.512
transiciones (120 aplicadas, 1.416 bloqueadas y 2.976 conflictos), 240 replays,
114 cambios de contexto y 22 historiales corruptos; cero P1/P2, efectos,
getters o reloj implícito. Bundle público de diagnóstico: 24.218 B/6.199 B gzip,
con una constante histórica de 113 B, sin dependencias operativas. Es distinto
del asset real emitido por Astro.

Comparación nueva contra PR #36: cinco grafos cliente completos idénticos en
nombres, imports, SHA-256, bytes y gzip; 352 fuentes de superficie explícitas y
19 CSS sin cambios. Condiciones/cobros 31.812 B/9.612 gzip, Cantidades
53.687/17.349, Catálogo por empresa 60.527/19.836, Directorio 26.856/8.818 y guía
15.171/6.309. No es una medición del grafo transitivo SSR completo ni una
interacción HTTP, navegador o DB.

Navegador 2.660 comprobaciones/72 visitas, E2E 188/188, ocho superficies a11y
sin hallazgos, ocho PNG y base QA de 143 tablas/353 filas son **heredados de
PR #35**, sin nuevas ejecuciones runtime. Hash histórico antes/después:
`9cbfc811cfc4296515a403d395875a43bfa26aff0c9c9b08be0804b15bbf6eca`.
R6.5c sigue en diseño, sin implementación o QA visual nueva.

R6.5c tiene orientación visual aceptada: `/demo/admin/credito`, «Límites y
revisión de crédito», en Clientes tras condiciones de pago. Quince contextos
cerrados, incluyendo exposición/solicitud/comprador configurados por separado;
abrir revisión explícitamente, seleccionar contacto, declarar aceptación o
rechazo y restablecer. No se editan importes, fechas, políticas o quórum ni se
expone una consola de CAS/replay. Cambiar escenario inicia otro ejemplo sin
trasladar decisiones; reset/recarga vuelve al ejemplo sin expediente abierto.

La demo deberá separar los tres diagnósticos del resultado declarado, conservar
unknown/unconfigured/excesos y bloquear respuestas tras terminalidad aunque
queden contactos sin responder. Ocho capturas previstas —pendiente con una
aceptación, aceptado con exceso, aceptado sin exposición y apertura bloqueada
por quórum, cada una en 1.440/375 px— aún no realizadas. Diseño pendiente de
implementación tras integrar b; no se anticipa QA ni disponibilidad visual.
