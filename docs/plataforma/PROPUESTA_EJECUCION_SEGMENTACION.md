# Propuesta R5.6c.3 — Política durable y correlación de ejecuciones

Estado: **implementada y verificada exclusivamente en QA local; inactiva**. Fecha: 2026-10-03.
Capacidad CUS-009; propietario `customers`. Continúa el
[coordinador R5.6c.2](EJECUCION_SEGMENTACION.md), sin sustituir sus guardas ni
autorizar una política comercial, programación periódica o consumidor.

Andreu autoriza expresamente la migración y ratifica que el proyecto público
debe permanecer solo con fixtures: sin cron, pedidos reales, envío de formularios
ni cambios en su base de datos. Esta autorización se aplica a la implementación
y pruebas sintéticas aisladas descritas aquí; no concede DDL remoto, activación
de consumidores ni despliegue de la demo.

## Decisión concreta

Autorización local ejecutada: migración aditiva
`0046_customer_segment_execution.sql`, con **tres tablas vacías**, índices y
guardas; repositorios internos, backup en formato **39** y ensayos SQLite/D1
en bases de QA aisladas. El backend de c.3 no añade backfill, dependencias,
precios, rutas, UI, cron, flags activos, credenciales ni despliegue remoto.

La base de implementación comprobada es `0045_customer_segmentation.sql` y
backup 38. El código incorpora ahora `0046_customer_segment_execution.sql` y
`BACKUP_SCHEMA_VERSION = 39`; no se aplican sobre la base desplegada.

## Necesidad y alternativa sin esquema nuevo

R5.6c.2 puede continuar localmente con el esquema actual: un llamador interno
proporciona la política completa y reanuda desde las fotografías persistidas.
También sería posible conservar un registro versionado en código y codificar
la correlación en claves técnicas. Esa opción exige conservar cada versión del
despliegue y reconstruir sus reglas al restaurar; no es imposible ni insegura
por definición.

Se eligió D1 para que la recuperación sea autocontenida y verificable:

- `customer_segment_runs` no fija política antes de capturar. Sus fotografías
  guardan nombre/versión y referencia desde `running`; una huella permite
  comprobar reglas disponibles, pero no recuperar reglas perdidas.
- `platform_job_runs` solo guarda identidad, trigger, calendario y lifecycle;
  no guarda payload ni relación con un run de segmento. El runner puede
  reclamar otro job distinto del recién solicitado.
- Los jobs exitosos se purgan tras 30 días y `platform_job_runs` **no pertenece
  al backup 38 ni al 39**. Usarlos como registro único de política o de idempotencia de
  segmentación perdería evidencia por una operación normal de mantenimiento.

Las tres tablas separan reglas inmutables, intención de un recálculo e intención
de ejecutar un paso. Es la elección de diseño implementada para esta operación;
ningún proveedor obliga a crear exactamente estas tablas. No se necesita la
migración para terminar o probar c.2.

## Modelo implementado

Todos los IDs, fechas ISO UTC, enteros seguros y huellas SHA-256 reutilizan las
reglas del contrato de segmentación. Las tres tablas rechazan UPDATE y DELETE.
No duplican estado, cursor, contadores ni resultados del run.

### `customer_segment_facts_policies`

| Campos | Restricción y significado |
|---|---|
| `policy_id`, `policy_version` | PK compuesta; versión positiva explícita. No existe una política «actual» elegida automáticamente. |
| `policy_json`, `policy_fingerprint` | Política completa normalizada de R5.6c.1, JSON canónico y SHA-256. |
| `created_at`, `created_by` | Fecha y actor técnico de registro, sin datos de contacto. |
| `idempotency_key`, `command_fingerprint` | Unicidad por `policy_id`; huella del comando completo. |

Una identidad/versión no admite dos contenidos. No se exige registrar versiones
numéricamente consecutivas: la identidad procede de una política explícita,
sin inventar versiones intermedias. Registrar reglas no las activa. El SQL
comprueba estructura cerrada, identidad/versión coherentes con JSON, tipos,
opciones y combinaciones permitidas de esquema 1; aplicación y lectura también
ejecutan el validador puro y verifican la huella. SQLite no calcula SHA-256.

### `customer_segment_execution_plans`

| Campos | Restricción y significado |
|---|---|
| `run_id` | PK y FK restrictiva a `customer_segment_runs`; un plan por run. |
| `policy_id`, `policy_version` | FK compuesta restrictiva a la política registrada. |
| `batch_size` | Entero obligatorio entre 1 y 100; fija el límite de trabajo de cada paso. |
| `created_at`, `created_by` | Contexto de la asignación, posterior o igual a solicitud, primera fotografía y registro de política. |
| `idempotency_key`, `command_fingerprint` | Clave única y huella de run, política/huella, lote y contexto. |

El alta solo acepta una ejecución todavía `requested`. El plan congela la
política **antes** de capturar. Una guarda adicional de inserción de fotografías
exige, cuando existe plan, que los snapshots iniciados usen su identidad,
versión, moneda y prefijo `source:<policy_fingerprint>:`. La aplicación sigue
comprobando la huella completa de contenido de la captura. Los runs históricos
sin plan conservan sus contratos: no se les inventa política ni se hace backfill.

La solicitud del run y la asignación de su plan usan dos operaciones recuperables:
repetir `requestRun` recupera el `runId`, y repetir el alta del plan recupera su
asignación. Una caída intermedia deja un run `requested` sin plan, **sin job**;
el adaptador de c.3 no captura ni encola hasta completar la asignación. Nunca
atribuye al run la política recibida de otro reintento incompatible.

### `customer_segment_job_intents`

| Campos | Restricción y significado |
|---|---|
| `job_run_id` | PK opaca de hasta 128 caracteres, compatible con plataforma. |
| `run_id`, `expected_revision` | FK al plan y FK compuesta a la fotografía del run; UNIQUE por pareja. |
| `scheduled_for` | Fecha congelada del comando de job `one-off`. |
| `created_at`, `created_by` | Contexto posterior o igual a plan y revisión referenciada. |
| `idempotency_key`, `command_fingerprint` | Clave única compartida con la cola y huella del comando completo. |

Cada fila representa la **intención de un solo paso** del coordinador, bajo el
descriptor reservado `customers.advance-segment`; no acredita que el job haya
corrido. El handler resolverá el plan desde el `job_run_id` realmente reclamado,
sin payload del navegador ni parámetros capturados de otra solicitud.

No hay FK hacia `platform_job_runs`: la intención debe sobrevivir a la purga
ordinaria de esa fila efímera y a una restauración que no incluye la cola. Sí
hay guardas en la cola para este descriptor: un INSERT exige intención previa
con el mismo ID, clave, fecha y trigger `one-off`, y una revisión vigente abierta;
las actualizaciones no pueden cambiar su identidad. Sus cambios de estado y
la purga habitual de exitosos siguen permitidos. Los demás jobs no cambian.

El alta operativa de intención y fila pendiente de plataforma se ejecuta en un
único `db.batch`, intención primero. Un fallo revierte ambas. Un replay exacto
conserva IDs y fechas. Reutilizar una clave o la pareja run/revisión con otro
contenido da conflicto; no genera otra ejecución. Las inserciones históricas
de intención requieren una revisión existente abierta en ese punto del
historial, sin exigir que siga siendo la última; esto permite restaurarlas.
Solo el alta **en la cola** exige que la revisión continúe vigente.

## Repositorios y recuperación implementados en local

Implementados `registerPolicy`/`readPolicy`, `attachPlan`/`readPlan`,
`enqueueStep`/`readJobIntent`, `recoverStep` y una composición de QA con c.2. Cada escritura
valida el comando antes de I/O, conserva su huella y permite replay histórico;
un error D1 no se transforma en conflicto o éxito sin evidencia exacta.

El plan no incluye publicación automática. Los resultados se completan mediante
c.2 y una publicación sigue necesitando su comando separado y CAS explícito.
Política distinta, definición obsoleta, captura inválida o aborto conservan los
resultados y errores definidos por ese coordinador.

Si un paso confirma una revisión y el proceso cae antes de preparar el siguiente,
la recuperación relee el run y prepara la intención de su revisión vigente.
Si existe intención pero se perdió la cola tras restaurar, puede reconstruirse
esa fila pendiente **solo para una revisión todavía vigente y abierta**, con su
identidad original, mediante una operación interna explícita. Nunca se reencola
un paso ya superado o un run terminal; tampoco se recrea el historial perdido
de intentos, locks o errores de plataforma. No existe un barrido automático en
este bloque. Los ejemplos y pruebas usan políticas y poblaciones sintéticas.

Un futuro handler marcará exitoso el **paso** realizado, sin presentar un run
parcial como recálculo completado. La creación/recuperación del paso siguiente
debe probarse antes de habilitar el handler; el progreso normal no consume el
presupuesto de reintentos de fallos del mismo job. c.3 no registra el descriptor
en el runtime, no cambia `JOB_DESCRIPTORS`, manifests ni flags y no procesa jobs
reales. El nombre reservado y las guardas solo se ejercitan en QA.

## Backup 39 y restore con guardas activas

Las tres tablas, con columnas explícitas, forman parte de la extensión de
segmentación y del corte transaccional del backup. El export valida todas las
políticas con el dominio, JSON/huellas, fechas canónicas de 24 caracteres,
planes y vínculos a revisiones antes de emitir SQL.
`platform_job_runs` sigue fuera: el backup conserva intenciones durables, no
promete conservar intentos o locks efímeros ni reanuda trabajos al restaurar.

El destino exige `0046` y las ocho tablas de segmentación vacías. El preflight
falla antes de modificar tablas legacy si falta esquema, existe historia o
hay colisiones de ID/clave con jobs del destino.
Orden de replay:

1. Políticas completas y dependencias de clientes.
2. Dentro del replay existente por segmento/definición, cada run y su primera
   fotografía `requested`; insertar su plan en ese punto, antes del inicio.
3. Candidatos y revisiones/resultados según backup 38, conservando publicaciones
   antes de la siguiente definición y todas las claves de comandos antiguos.
4. Intenciones de job, una vez existen sus planes y revisiones referenciadas.
   No insertar ninguna fila de `platform_job_runs` durante el restore.

Las guardas permanecen activas. Un plan no se inserta después de reproducir un
inicio, y la ausencia de cola al restaurar no se oculta con una FK desactivada.
El ensayo compara exactamente las ocho tablas y el resto del backup: 129 tablas
idénticas, `foreign_key_check` vacío y replay conservado después de restaurar.
No se declara compatible un backup 38 con historia nueva de c.3: su operación
histórica sobre bases 0045 queda separada del formato 39.

## Verificación, rollback y límites

La migración sobre copia sintética local 0045 conserva el hash de todas las
tablas anteriores y crea exactamente tres tablas nuevas vacías. Las pruebas
cubren conflicto de políticas bajo la misma versión, replay y mutación de
inputs; plan duplicado o tardío; captura incompatible con plan; carreras de
encolado; rollback de todo el batch; IDs/fechas de job incompatibles y
reivindicación de otro job.

El corpus de restore incluye políticas no usadas, runs sin plan, planes todavía
`requested`, ejecuciones parciales/fallidas/completadas, publicación antigua,
intenciones con cola existente y purgada, y caída entre confirmar progreso y
preparar el paso siguiente. La purga de un job exitoso conserva su intención
y un paso antiguo no se reencola. Ensayo workerd/D1 aislado, backup/restore
reales y `pnpm check` completados, sin usar la base compartida de landing.

Evidencia final del 2026-10-03:

| Comprobación | Resultado |
|---|---|
| `pnpm check` | 877 archivos, cero diagnósticos; 220 suites/1.705 pruebas. |
| Build demo | 44 HTML y 44 formularios de simulación. |
| [workerd/D1](../audits/r5-6c/facts-d1-report.json) | 15 bloques; backup 39; 129 tablas restauradas idénticas. |
| [E2E](../audits/demo-fixtures/e2e-report.json) | 153/153 comprobaciones. |
| [Navegador](../audits/demo-fixtures/report.json) | 31 comprobaciones; cero escrituras y beacons. |
| [Accesibilidad](../audits/demo-fixtures/a11y-report.json) | Ocho superficies; cero errores y avisos. |

La base QA de la demo conserva 143 tablas y 353 filas. Su SHA-256 antes y
después es `9cbfc811cfc4296515a403d395875a43bfa26aff0c9c9b08be0804b15bbf6eca`.
Son bases sintéticas aisladas, separadas de la D1 operativa.

La demo debe reconstruirse con manifest `deployment.mode = 'demo'` y
`DEMO_MODE=true` en build y runtime. El HTML ya generado de un build de cliente
no se convierte en demo cambiando solo variables remotas: hay que reconstruir
y validar el artefacto antes de cualquier despliegue autorizado. Este cierre
no despliega; la versión servida permanece intacta.

Rollback: mantener esquema aditivo y CUS-009 inactiva; retirar únicamente la
composición de c.3. No borrar políticas, planes, intenciones ni resultados, ni
desactivar triggers. Una restauración de datos reales mantiene su autorización
independiente. No se fija un plazo de retención, frecuencia, volumen comercial
ni promesa de coste. La retención y eliminación legal de esa evidencia requieren
su diseño por proyecto antes del uso real; no se reutilizan los 30 días de jobs.

## Autorización local recibida y alcance de los gates

El veto exacto es «**Migración de esquema D1**» en
[arquitectura](../../.claude/skills/equipo/roles/arquitecto.md), reforzado por
`CLAUDE.md` §17. La autorización anterior de cinco tablas de R5.6b no incluye
estas tres. Ese fue el motivo de consultar antes de implementar 0046; la
autorización expresa recibida el 2026-10-03 resuelve ese gate local. No debe
solicitarse de nuevo para este alcance.

La decisión autorizada e implementada incluye **las tres tablas y guardas,
repositorios y backup/restore 39, exclusivamente en QA local y con políticas
sintéticas**. G2 local queda cerrado con pruebas y revisión. G3 remoto no se
solicita; el [G4 vigente](PROPUESTA_SEGMENTACION_PERSISTENTE.md) de política,
lifecycle, retención/recuperación y consumidores por proyecto sigue pendiente.
Este permiso local prepara parte de su evidencia, sin aprobar activación,
reglas reales, cron, envíos, precios, gastos o despliegue.

Consejo: arquitecto ✓ migración aditiva autorizada y ensayada en QA ·
backend ✓ identidad, CAS y cola efímera separados · fullstack ✓ restore y
recuperación verificados · producto ✓ CUS-009 parcial e inactiva, demo visual pendiente.
