# Operación de evidencia de consentimiento (`CUS-007`)

## Estado del contrato

R5.2 está implementado localmente con la migración expand-only `0037`,
repositorio D1 y backup esquema 31. `CUS-007` permanece `installed`: ningún
preset captura consentimiento, habilita rutas, muestra UI, ejecuta jobs o envía
marketing. El esquema solo ofrece una primitiva durable para proyectos que
aporten una política y una superficie aprobadas.

Producción continúa en `0032`; `0033`–`0037` requieren un rollout remoto
autorizado y ordenado. No se guarda email, teléfono, IP, user-agent o texto
legal en la evidencia. `contact_identity_hash` es una identidad HMAC sensible:
no debe aparecer en logs, métricas, eventos o errores.

## Preflight y rehearsal

1. Confirmar backup y Time Travel del D1 objetivo.
2. Aplicar y validar primero `0033`–`0036`.
3. Obtener una baseline exacta en `0036` y ejecutar:

   ```bash
   pnpm db:rehearse:consent-evidence -- \
     --baseline /ruta/baseline-0036.sql \
     --output-dir /ruta/aislada
   ```

4. Exigir que forward y restore conserven el mismo hash de productos,
   variantes, balances, pedidos, líneas, pagos, perfiles, direcciones y merges.
5. Aplicar `0037_consent_evidence.sql` y comprobar:

   ```sql
   SELECT count(*) FROM customer_consent_evidence;
   PRAGMA foreign_key_check;
   PRAGMA integrity_check;
   ```

   En el primer rollout, el recuento debe ser cero y ambos pragmas deben quedar
   limpios. No se permite poblar evidencia desde pedidos, perfiles,
   preferencias, outbox o emails históricos.

El rehearsal local del 2026-08-17 conservó 284 productos, 286 variantes y
balances, 8 pedidos, 13 líneas y 8 pagos, con hash
`eff16b7d1cd6c2eedcfc639ae2cd2514b0ed0c9520f669b1cb5cf95d3fed77c2`.
El dump restaurable ocupa 615.795 bytes y no inventó perfiles ni evidencia.

## Activación por proyecto

La migración no activa la capacidad. Antes de capturar o consumir evidencia,
el proyecto debe aportar y aprobar fuera del motor:

1. finalidades, canales y clasificación de comunicaciones;
2. identificadores/versiones de avisos y la forma de presentar cada aviso;
3. regiones aplicables, base jurídica y política de conservación;
4. flujo de retirada y, si corresponde, double opt-in;
5. permisos administrativos, rate limits y respuestas anti-enumeración;
6. secreto HMAC por despliegue para identidades guest, sin persistirlo en D1;
7. manifest específico que active solo las superficies y efectos revisados.

Una preferencia `subscribed` nunca crea un grant. Una compra tampoco. Las
comunicaciones clasificadas y aprobadas como transaccionales necesarias no
dependen de `CUS-007`; marketing no puede reclasificarse para eludir el gate.

## Escritura y concurrencia

- La clave de estado es sujeto + canal + finalidad.
- Cada append exige la versión siguiente y un `occurred_at` no anterior al
  último hecho del mismo alcance.
- Dos comandos distintos sobre la misma versión dejan un solo ganador.
- Dos retries idénticos convergen en una fila y el perdedor devuelve `replayed`.
- Una retirada solo referencia el grant vigente y conserva su aviso/version.
- Reconsentir añade una versión; nunca actualiza el grant anterior.
- El trigger impide `UPDATE`. Los deletes solo pertenecen al restore
  privilegiado completo; la aplicación no expone esa operación.

## Incidencias y reconciliación

- `customer_consent_conflict`: releer el alcance y decidir entre retry idéntico
  o nueva versión; no devolver sujeto, HMAC, idempotency key o SQL al cliente.
- Conflicto de versión: otro escritor ganó. No forzar un número ni sobrescribir.
- Retirada sin grant vigente: no inventar un grant o una retirada retroactiva.
- Perfil fusionado/inactivo: resolver primero el sujeto vigente; conservar la
  evidencia histórica bajo su identidad original.
- Idempotencia reutilizada con otro payload: rechazar y revisar al emisor.

La reconciliación mínima verifica secuencias por alcance, referencias de
retirada, FKs e integridad. Los informes deben usar recuentos agregados y no
imprimir identidades.

## Backup y rollback

El backup esquema 31 ordena hechos por versión antes de restaurarlos, de modo
que cada grant existe antes de su retirada autorreferenciada. Restaurar exige
una base con `0037` aplicada.

El rollback seguro es de comportamiento: mantener `CUS-007` sin flags o
desactivar sus consumidores futuros. No borrar evidencia ni contraer la tabla;
puede ser necesaria para acreditar concesión o retirada. Una contracción exige
export verificado, política de datos aprobada y una migración posterior propia.
