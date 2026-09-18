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

## Siguiente contrato

R5.6c.1 debe definir una política explícita y versionada de hechos, sin reglas
comerciales predeterminadas, y un productor interno de lectura consistente.
La política debe expresar estados/eventos contados, fecha de actividad,
tratamiento de ajustes, cancelaciones, cobros, reembolsos y saldo almacenado,
moneda y cómputo temporal. Su implementación se verifica con políticas
sintéticas; elegir y activar una política real sigue siendo una decisión por
proyecto.
