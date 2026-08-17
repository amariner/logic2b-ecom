# Operación de suscripciones por adaptador (`PRC-013`)

## Estado del contrato

R4.10 está implementado localmente con migración `0034` y backup esquema 28.
La capacidad queda `installed`, no activa. Solo existe el adaptador
`simulated-subscriptions`, sin red ni cobros; producción continúa en `0032`
hasta un rollout autorizado que primero incluya `0033` y después `0034`.

## Preflight y rollout

1. Confirmar backup y Time Travel del D1 objetivo.
2. Exportar una baseline con `0033` aplicada y ejecutar:

   ```bash
   pnpm db:rehearse:subscriptions -- \
     --baseline /ruta/baseline-0033.sql --output-dir /tmp/logic2b-r410
   ```

3. Verificar hash idéntico, dump restaurable, `foreign_key_check` vacío y las
   cinco tablas nuevas vacías.
4. Aplicar `0034_provider_subscriptions.sql` antes del Worker compatible.
5. Mantener `PRC-013` instalada hasta que el proyecto decida proveedor, planes,
   cadencia, política de impago y URLs permitidas.
6. Un adaptador real debe verificar firma/cuerpo, mapear códigos saneados y
   pasar pruebas contractuales. Solo entonces se puede añadir y habilitar una
   ruta webhook.
7. Activar flags de rutas/efectos en un manifest de cliente; nunca en la demo.

No ejecutar rollout remoto ni instalar SDKs sin autorización separada.

## Reconciliación

```sql
-- Hechos duplicados: debe devolver cero filas.
SELECT provider_adapter, provider_event_reference, count(*) AS duplicates
FROM subscription_provider_events
GROUP BY provider_adapter, provider_event_reference
HAVING count(*) > 1;

-- Versiones proyectadas e historial deben coincidir.
SELECT subscription.id, subscription.version,
       COALESCE(max(event.version_after), 1) AS event_version
FROM subscriptions subscription
LEFT JOIN subscription_events event ON event.subscription_id = subscription.id
GROUP BY subscription.id
HAVING subscription.version <> COALESCE(max(event.version_after), 1);

-- Suscripciones en impago para conciliación manual, sin fijar SLA.
SELECT id, provider_adapter, provider_subscription_reference,
       failed_payment_count, current_period_ends_at, updated_at
FROM subscriptions
WHERE status = 'past_due'
ORDER BY updated_at, id;

-- Ciclos cuyo intento no encaja con su estado actual.
SELECT cycle.*
FROM subscription_cycles cycle
WHERE (cycle.status = 'paid' AND cycle.failure_code IS NOT NULL)
   OR (cycle.status = 'failed' AND cycle.failure_code IS NULL);

PRAGMA foreign_key_check;
PRAGMA integrity_check;
```

Los resultados contienen PII/referencias operativas y no se publican en logs ni
comentarios de incidencias.

## Incidencias

- Firma inválida: responder sin procesar, no guardar el payload y revisar reloj,
  secreto y rotación del adaptador.
- Replay: devolver éxito idempotente; no crear segunda transición ni ciclo.
- Versión en conflicto: detener ese hecho, releer proyección y reconciliar con
  el proveedor. Nunca forzar `version` a mano.
- `past_due`: consultar al proveedor y la política aprobada del proyecto. R4.10
  no decide reintento, suspensión ni comunicación.
- Portal: generar otra sesión efímera. No copiar la URL a D1 o logs.
- Evento desconocido: mantenerlo fuera del agregado hasta ampliar el contrato y
  sus tests; no mapearlo a un estado parecido.

## Rollback

1. Desactivar `sideEffects` y `routes` de `PRC-013`.
2. Pausar nuevas altas/eventos en el proveedor.
3. Mantener el Worker compatible mientras existan hechos pendientes.
4. No borrar `subscription_*`: son evidencia y un Worker anterior las ignora.
5. Restaurar solo desde backup esquema 28 sobre una base con `0034` aplicada.

