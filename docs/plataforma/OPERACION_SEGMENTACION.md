# Operación de segmentación calculada

## R5.6d — Demostración visual verificada en el repositorio

R5.6c.3 está integrada en PR #14 (`9b3a8ab`), sin despliegue. R5.6d implementa
`/demo/admin/segmentos` con 12 perfiles sintéticos, cuatro
hechos, tres templates y lotes de tres. La evaluación y el progreso ilustrativo
ocurren en el navegador: sin captura de perfiles reales, APIs operativas,
repositorios, store, jobs ni persistencia.

La implementación y su QA están cerradas; la demo visual está disponible en
el repositorio, sin desplegar. Se verifican navegador en escritorio/móvil,
teclado, accesibilidad y ausencia de escrituras o tráfico operativo.
CUS-009 continúa parcial, instalada e inactiva en operación; esta presentación
no habilita flags, rutas operativas ni consumidores.

[Validación final](../audits/r5-6d/verification-report.json): `pnpm check` pasa
883 archivos sin diagnósticos, 222 suites/1.730 pruebas y build con 44 HTML y
44 formularios cerrados a envíos; E2E 156/156.
[Navegador](../audits/r5-6d/report.json): 119/119 comprobaciones y ocho capturas,
incluido sin JavaScript, cero llamadas a API, peticiones mutantes, beacons o
errores. [Accesibilidad](../audits/r5-6d/a11y-report.json): ocho superficies
a 1440/375, estados inicial/completado/inválido y movimiento reducido, cero
errores y avisos. La base QA conserva 143 tablas y 353 filas, con SHA-256 antes
y después `9cbfc811cfc4296515a403d395875a43bfa26aff0c9c9b08be0804b15bbf6eca`.

## Corte vigente R5.6c.3 y límite de la demo

La migración `0046_customer_segment_execution.sql` y backup **39** amplían el
corte local con políticas completas, planes e intenciones de pasos. Andreu
autoriza su implementación y ensayo en QA aislada el 2026-10-03. No se aplica
DDL a la D1 desplegada, no se registra un handler ni se activa CUS-009.

El corte local de la demo usa exclusivamente fixtures: sin cron, pedidos
reales, envío de formularios ni escrituras operativas en D1. Un scheduled
antiguo no llama al runner; las peticiones mutantes demo se rechazan antes de
leer el cuerpo o la base. Contacto y previews son ejemplos locales, sin beacon.
Los SELECT de fixtures existentes y la cookie stateless del acceso guiado no
crean datos comerciales.

Este corte está verificado en local y no se ha desplegado. La demo requiere
reconstruir con manifest `deployment.mode = 'demo'` y `DEMO_MODE=true` en build
y runtime. Cambiar solo una variable remota no convierte en demo el HTML de
un build de cliente. Antes de un despliegue autorizado hay que reconstruir y
validar ese artefacto; la versión servida permanece intacta.

El store interno conserva la política antes de capturar y el lote en el plan.
`enqueueStep` confirma intención y cola en un batch; la correlación se resuelve
por el job realmente reclamado. La cola de plataforma puede purgarse y no forma
parte del backup. `recoverStep` solo reconstruye explícitamente una fila
pendiente de revisión todavía vigente y abierta, con identidad y fechas
originales. Un replay histórico no reconstruye cola por sí solo.

Backup 39 exige 0046 y las ocho tablas de segmentación vacías. Su preflight
rechaza esquema ausente, historia existente y colisiones de ID/clave con jobs
del destino antes de modificar datos legacy. Restaura políticas, la solicitud
de cada run, su plan, resultados/revisiones/publicaciones y al final intenciones;
no crea `platform_job_runs`. No se desactivan las guardas. El formato 38 queda
como evidencia histórica de 0045, no como alternativa para datos de c.3.

El [contrato y alcance autorizado](PROPUESTA_EJECUCION_SEGMENTACION.md) detalla
los repositorios, el rollback aditivo y la recuperación. La demo visual de
segmentación queda verificada en R5.6d, disponible en el repositorio sin desplegar.

Validación final del 2026-10-03: `pnpm check` pasa 877 archivos sin diagnósticos,
220 suites/1.705 pruebas y build de 44 HTML con 44 formularios de simulación.
El [ensayo workerd/D1](../audits/r5-6c/facts-d1-report.json) pasa 15 bloques y
restaura 129 tablas con backup 39. [E2E](../audits/demo-fixtures/e2e-report.json):
153/153; [navegador](../audits/demo-fixtures/report.json): 31 comprobaciones,
cero escrituras y beacons; [accesibilidad](../audits/demo-fixtures/a11y-report.json):
ocho superficies, cero errores y avisos. La base QA de la demo conserva sus
143 tablas y 353 filas, con SHA-256 antes y después
`9cbfc811cfc4296515a403d395875a43bfa26aff0c9c9b08be0804b15bbf6eca`.

## Corte R5.6b

El 2026-09-18 Andreu autorizó continuar la propuesta de persistencia con alcance
local: cinco tablas, repositorios y backup/restore sobre bases aisladas.
`0045_customer_segmentation.sql` es una expansión sin backfill. CUS-009
permanece `installed` e inactiva. El Worker y la D1 remota no se han modificado. El cierre pasa 210 suites/1.261
pruebas, tipos, baseline, build y E2E completo; el [informe D1](../audits/r5-6b/d1-report.json)
registra 126 tablas restauradas idénticas y cero errores FK.
La demo visual, el productor comercial de hechos, los jobs, las rutas y los
consumidores siguen pendientes.

## Contratos y límites

Cada definición guarda template, parámetros y SHA-256 canónicos. Una versión
nueva exige la versión vigente exacta; una misma identidad/versión de template
no puede describir dos contenidos. Los comandos guardan actor técnico, fecha,
clave de idempotencia y huella de su entrada normalizada. Un reintento idéntico
devuelve su evidencia histórica; reutilizar la clave con otro contenido falla.

Una ejecución fija definición y generación consecutiva. Su estado se deriva
del historial de fotografías: `requested → running → completed|failed`, con
progresos intermedios. El fallo anterior al inicio no contiene población.
Los datos de entrada se copian antes de cualquier operación asíncrona.

El snapshot de hechos incluye referencia, política/versiones, fecha, moneda,
población ordenada y versión de cada perfil. Sus cuatro hechos conservan `null`
cuando no están disponibles. La importación completa y la fotografía inicial
son un solo `db.batch`: un fallo no deja candidatos parciales. Reutilizar una
referencia de snapshot con otro contenido produce conflicto.

Límites técnicos de esta implementación: **100 candidatos**, **256.000 bytes**
de JSON canónico y **32 condiciones / 16.000 caracteres** por template. Un
exceso se rechaza; no se trunca ni se parte en transacciones independientes.
Estos límites describen el adaptador actual, no umbrales comerciales ni una
promesa de capacidad de un proveedor futuro.

El repositorio evalúa los hechos persistidos mediante el dominio. El llamador
solo identifica ejecución, revisión, cursor opaco y tamaño de lote. Los
resultados y su fotografía se confirman juntos. El SQL vuelve a comprobar
evaluación, posiciones, contadores y transición; una carrera revierte el lote
perdedor. Al agotar candidatos el cursor queda nulo, incluso antes de completar.

Completar y publicar son operaciones distintas. La publicación exige una
ejecución completa de la definición vigente, una generación superior a la
publicada y CAS de publicación. Puede existir una generación posterior todavía
en curso. Reintentar una publicación antigua conserva el puntero más reciente.

Las lecturas distinguen ausencia de publicación, definición superada, perfil
modificado/fusionado, perfil fuera del snapshot y evaluación negativa. Un
resultado nunca se transfiere al destino de una fusión. La pertenencia no
concede consentimiento ni autorización. Los fallos de D1 se propagan como
fallos; no se traducen en listas vacías ni resultados negativos.

## Backup y restauración

El formato vigente **39** exige `0046`. La extracción usa un único batch
consistente, columnas explícitas y validación de contratos, evaluación y
huellas de definiciones, hechos, conjuntos y políticas completas. Comprueba
planes, intenciones y fechas canónicas de 24 caracteres. Las claves y huellas
de comandos históricos se conservan para mantener su idempotencia. El formato
38 es histórico de 0045; no representa los datos nuevos de c.3.

Restaurar en una base aislada preparada con las migraciones correctas. El
preflight comprueba el esquema, exige las ocho tablas de segmentación vacías
y rechaza colisiones de ID/clave con la cola del destino antes de cualquier
borrado. Las guardas permanecen activas. Tras las políticas, el SQL reconstruye
cada segmento por versión de definición; dentro de ella reproduce ejecuciones,
planes después de `requested` y antes de iniciar, candidatos,
revisiones/resultados y publicaciones antes de avanzar a la siguiente
definición. Las intenciones se restauran al final; la cola no se restaura.
No necesita reproducir el orden temporal global entre ejecuciones independientes,
pero conserva todos sus timestamps y relaciones.

El ensayo incluye dos definiciones publicadas, una tercera sin publicar, una
ejecución antigua que finaliza tarde, estados parciales/fallidos, conjunto vacío,
perfiles fusionados y reintentos históricos. Se compara la totalidad de las
filas exportadas y se exige `foreign_key_check` vacío.

El rollback habitual conserva el esquema aditivo y CUS-009 inactiva. No borrar
tablas, eliminar fotografías o desactivar triggers como forma de recuperación.
Una restauración sobre datos reales y cualquier rollout remoto requieren su
autorización independiente.

## Comprobaciones locales

```sh
pnpm exec vitest run tests/customer-segmentation*.test.ts tests/customer-segment-execution-store.test.ts tests/backup.test.ts
pnpm db:rehearse:customer-segmentation -- \
  --baseline-sqlite /ruta/a/copia-local-en-0044.sqlite \
  --output-dir tmp/segmentation-rehearsal
pnpm db:rehearse:customer-segmentation:d1
pnpm check
```

El rehearsal histórico de SQLite abre su origen en solo lectura y lo copia
mediante el backup de Node; prueba 0044→0045, conserva el hash de todas las
tablas anteriores, verifica cinco tablas nuevas vacías y revierte sus probes.
Una copia cruda `.dump` no sustituye la prueba de restore con los triggers
definitivos activos. El ensayo D1 prueba ese lifecycle y después aplica 0046
sin alterar la historia para ensayar el backup 39 vigente; no inventa
compatibilidad con formato 38. Usa exclusivamente datos sintéticos y
dos bindings temporales, con `remoteBindings: false` y `envFiles: []`. Genera
configuración, artefactos y un informe en `tmp/segmentation-d1`, ejecuta el ciclo
de repositorio y restaura el SQL de la misma composición que usa el panel.
Prueba 100 candidatos en un batch de 101 sentencias, rechazo previo de 101
candidatos y rollback ante un fallo al final del batch. La restauración también
se ejecuta como batch completo: no se simula únicamente con SQLite de Node.

## Captura de hechos R5.6c.1 (2026-10-03)

El productor interno ya lee perfiles, pedidos, pagos y saldo del motor mediante
un único batch consistente de siete lecturas. La política es obligatoria y
versionada; sus decisiones y restricciones están en
[ADR-0045](adr/0045-segmentos-calculados-observables.md). Ninguna política de
prueba está registrada en el runtime ni existe un valor comercial por defecto.

La captura contiene toda la población de perfiles activos o falla. A los 100
perfiles/256.000 bytes del snapshot se añaden límites de lectura: 1.000 pedidos,
5.000 pagos, 10.000 transacciones externas, 10.000 asientos de saldo y 1.000
modificaciones aplicadas. Exceder cualquiera impide devolver el snapshot, sin
escribir filas ni iniciar una ejecución parcial. No se elude el límite
dividiendo una población viva en páginas; ampliar escala requiere otro diseño.

No se consultan emails, nombres, direcciones, notas, tokens ni referencias de
proveedor. La fuente propaga un fallo de D1 y rechaza datos incompletos; nunca
los convierte en cero candidatos. La fecha procede del reloj D1 en la misma
transacción. Las fechas legacy `YYYY-MM-DD HH:mm:ss` significan UTC. No se
acepta un parámetro `asOf` ni se promete reconstrucción histórica.

El SHA-256 de la política queda en la referencia opaca. La captura por sí sola
conserva la huella; desde c.3, el plan referencia una política registrada
completa y el backup 39 incluye sus reglas. Los runs históricos sin plan no
reciben políticas inventadas ni backfill. Antes de una activación por proyecto
deben elegirse y registrarse expresamente sus reglas comerciales.
Cambios posteriores de pagos no modifican los hechos congelados; requieren
otra captura. Un cambio de perfil sigue invalidando la vigencia de su pertenencia.

Ensayo reproducible, sin acceder a la D1 persistente de desarrollo:

```sh
pnpm exec vitest run tests/customer-segmentation-facts*.test.ts
pnpm db:rehearse:customer-segmentation-facts:d1
```

El [informe](../audits/r5-6c/facts-d1-report.json) verifica con workerd/D1 local
captura, publicación, cambios posteriores, política alternativa, frontera
100/101 y, tras ampliar el ensayo a c.3, restore de 129 tablas idénticas con
triggers activos y backup 39. Sus 15 bloques incluyen políticas, planes,
intenciones y recuperación explícita. La fuente no altera ninguna tabla.
El restore conserva hechos, referencia y replay de publicación. c.1 no añadió
DDL; 0046 corresponde al corte c.3 autorizado solo en QA, sin despliegue remoto.

## Ejecución reanudable R5.6c.2 (2026-10-03)

El [coordinador interno](EJECUCION_SEGMENTACION.md) avanza una transición por
llamada: captura/inicio, un lote o cierre. Reanudar consulta la revisión durable
y no captura de nuevo una población ya iniciada. Ante colisión CAS relee una
vez; los errores de transporte después de enviar una escritura se propagan
sin inventar éxito o fallo. La publicación queda separada y necesita una
versión esperada explícita, sin incrementarla automáticamente tras conflicto.

Cada intención de pago acredita ahora por separado su componente externo y su
saldo. Los importes esperados evitan que una captura o un saldo ya confirmado
oculten otra parte sin asientos. El modo neto devuelve ausencia/rechazo según
política, nunca un importe parcial como si fuese completo. Si se excluye saldo,
su ausencia no invalida un cobro externo acreditado. No se cambia el dinero del
pedido: estas son reglas de lectura para hechos de segmentación.

Pruebas de recuperación:

```sh
pnpm exec vitest run tests/customer-segmentation-execution.test.ts
pnpm db:rehearse:customer-segmentation-facts:d1
```

El ensayo D1 añade carreras de inicio/progreso, reinicio sin recaptura,
publicación CAS y replay, y restaura ambas publicaciones históricas. Los 29
tests del coordinador cubren además abortos, respuestas perdidas, fuente
inválida, límite 101 y cambio de definición/política. Sigue sin composición de
runtime, jobs registrados, rutas ni flags nuevas.

## Siguiente bloque y gate

El [cierre R5.6c.3](PROPUESTA_EJECUCION_SEGMENTACION.md) conserva políticas,
planes y correlación con pasos de jobs mediante 0046 y backup 39, autorizados
y verificados exclusivamente en QA local. R5.6d queda cerrada como demostración
visual sobre fixtures, con evaluación pura, sin APIs operativas, cron ni
persistencia. Sigue R5.7a–b: ADR, modelo de mercados y composición pura en QA
(país, idioma, moneda, dominio, resolución y fallback), limitada a moneda base
y configuración versionada en Git, sin DDL ni endpoints. G3 remoto, política
comercial, retención y uso real G4 permanecen separados y no bloquean ese
alcance puro. CUS-009 sigue parcial e inactiva; su demo visual está disponible
en el repositorio sin activar operación ni desplegar.
