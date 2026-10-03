# Operación de segmentación calculada

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

El formato **38** exige `0045`. La extracción usa un único batch consistente,
columnas explícitas y validación de contratos, evaluación y huellas de
definiciones, hechos y conjuntos. Las claves y huellas de comandos históricos
se conservan para mantener su idempotencia.

Restaurar en una base aislada preparada con las migraciones correctas. El
preflight comprueba el esquema y rechaza historia de segmentación existente
antes de cualquier borrado. Las guardas permanecen activas. El SQL reconstruye
cada segmento por versión de definición; dentro de ella reproduce ejecuciones,
candidatos, revisiones/resultados y publicaciones antes de avanzar a la siguiente
definición. No necesita reproducir el orden temporal global entre ejecuciones
independientes, pero conserva todos sus timestamps y relaciones.

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
pnpm exec vitest run tests/customer-segmentation*.test.ts tests/backup.test.ts
pnpm db:rehearse:customer-segmentation -- \
  --baseline-sqlite /ruta/a/copia-local-en-0044.sqlite \
  --output-dir tmp/segmentation-rehearsal
pnpm db:rehearse:customer-segmentation:d1
pnpm check
```

El rehearsal de SQLite copia su origen, conserva el hash de todas las tablas
anteriores, verifica exactamente cinco tablas nuevas vacías y revierte sus
probes. Una copia cruda `.dump` no sustituye la prueba de restore con los triggers
definitivos activos. El ensayo D1 local usa exclusivamente datos sintéticos y
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

El SHA-256 de la política queda en la referencia opaca. Antes de una activación
por proyecto hay que conservar además el documento canónico de esa política:
el backup de hechos conserva su huella, pero no almacena sus reglas completas.
Cambios posteriores de pagos no modifican los hechos congelados; requieren
otra captura. Un cambio de perfil sigue invalidando la vigencia de su pertenencia.

Ensayo reproducible, sin acceder a la D1 persistente de desarrollo:

```sh
pnpm exec vitest run tests/customer-segmentation-facts*.test.ts
pnpm db:rehearse:customer-segmentation-facts:d1
```

El [informe](../audits/r5-6c/facts-d1-report.json) verifica con workerd/D1 local
captura, publicación, cambios posteriores, política alternativa, frontera
100/101 y restore de 126 tablas idénticas con triggers activos. La fuente no
altera ninguna tabla. El restore conserva hechos, referencia y replay de
publicación. No hay migración nueva, proveedor ni despliegue remoto.

## Siguiente contrato

Continuar R5.6c.2: ejecución interna reanudable, concurrencia y recuperación
sobre estas capturas y revisiones durables, sin registrar cron ni activar
consumidores. Elegir y activar una política real sigue siendo una decisión por
proyecto. CUS-009 permanece parcial y la demo visual continúa pendiente.
