# Operación de perfiles de cliente (`CUS-002`)

## Estado del contrato

R5.1 está implementado localmente con la migración expand-only `0036` y backup
esquema 30. `CUS-002` permanece `installed`: ningún preset crea perfiles ni
añade rutas, navegación o autoservicio. Guest checkout sigue siendo suficiente
y todos los pedidos anteriores o nuevos pueden conservar
`customer_profile_id = NULL`.

Producción continúa en `0032`; `0033`–`0036` requieren un rollout remoto
autorizado y ordenado. El secreto HMAC nunca se incluye en D1, exports, logs,
eventos, manifest público o este repositorio.

## Preflight y rehearsal

1. Confirmar backup y Time Travel del D1 objetivo.
2. Aplicar y validar primero `0033`, `0034` y `0035`.
3. Obtener una baseline exacta en `0035` y ejecutar:

   ```bash
   pnpm db:rehearse:customer-profiles -- \
     --baseline /ruta/baseline-0035.sql \
     --output-dir /ruta/aislada
   ```

4. Exigir que forward y restore conserven el mismo hash de las tablas legacy,
   no inventen perfiles/enlaces y terminen sin errores de FK o integridad.
5. Aplicar `0036_customer_profiles.sql` y comprobar:

   ```sql
   SELECT count(*) FROM customer_profiles;
   SELECT count(*) FROM customer_address_revisions;
   SELECT count(*) FROM customer_profile_merges;
   SELECT count(*) FROM orders WHERE customer_profile_id IS NOT NULL;
   PRAGMA foreign_key_check;
   ```

   En el primer rollout, los cuatro recuentos deben ser cero y el pragma no
   debe devolver filas. No se permite poblar perfiles desde `orders.email`.

## Activación por proyecto

La migración no activa la capacidad. Un proyecto que decida usarla debe:

1. acordar antes el contrato de consentimiento/privacidad de R5.2–R5.3;
2. generar un secreto aleatorio distinto para ese despliegue, con al menos 32
   caracteres, y cargarlo mediante el gestor de secretos como
   `CUSTOMER_PROFILE_HMAC_SECRET`;
3. activar `CUS-002.sideEffects` en su manifest específico;
4. verificar que alta y reutilización producen la misma respuesta pública y
   que una identidad en revisión cae a guest sin revelar existencia;
5. validar dos checkouts concurrentes con el mismo email: una sola fila de
   perfil y ambos pedidos enlazados al mismo id opaco.

No rotar el secreto de forma unilateral: cambiarlo crea un espacio de identidad
nuevo. Una rotación exige un plan dual-key/migración separado que R5.1 no
implementa.

## Incidencias y reconciliación

- `customer_profile_conflict`: conservar el pedido como guest y revisar solo en
  una superficie administrativa futura; no responder con email, hash o id de
  candidato.
- Carrera de dirección: releer la revisión vigente y pedir una nueva versión;
  nunca actualizar una fila histórica.
- Pedido ya enlazado: no sobrescribir la FK sin una operación revisada. Email,
  nombre y `address_json` del pedido siguen siendo snapshots inmutables.
- Perfil fusionado: no reutilizarlo; mantener `requires_review`. R5.1 no
  relaciona identidades distintas ni ofrece merge automático.

La reconciliación mínima compara perfiles activos, revisiones vigentes, FKs de
pedido y `PRAGMA foreign_key_check`. No debe imprimir PII ni HMAC en métricas.

## Rollback

El rollback seguro es de comportamiento: desactivar `CUS-002.sideEffects` y
retirar el secreto del runtime. El checkout vuelve a guest sin borrar filas ni
desenlazar pedidos. No eliminar las tablas, la columna o las revisiones durante
el rollback; son evidencia y pueden estar referenciadas. Cualquier contracción
requiere export verificado, política de datos y una migración posterior propia.
