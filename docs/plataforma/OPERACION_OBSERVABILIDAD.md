# Runbook de observabilidad operativa

> Alcance R1.9. Señales en Workers Logs, sin PII, sin endpoint público y sin
> persistencia adicional en D1.

## Identificadores

| Campo | Origen | Uso |
|---|---|---|
| `operation_id` | UUID interno; también sale en `x-operation-id` para checkout y webhooks válidos | Encontrar una ejecución concreta. |
| `correlation_id` | Correlación técnica del pedido | Agrupar hechos del mismo recorrido. |
| `causation_id` | Evento interno o evento Stripe ya firmado | Seguir la causa de webhook/outbox. |

No buscar por email, nombre, dirección, teléfono, sesión Stripe o payment
intent: esos datos no se registran. El cliente debe facilitar el valor exacto
de `x-operation-id` cuando la respuesta lo incluya.

## Consulta autorizada

Desde un terminal autenticado en la cuenta del Worker:

```bash
pnpm exec wrangler tail ecom-logic2b --format json
```

Filtrar las líneas cuyo mensaje JSON tenga
`schema="logic2b.observability.v1"`. Los campos estables son `kind`, `level`,
`emitted_at`, `operation_id`, `duration_ms` y los específicos indicados abajo.
No existe ruta HTTP de consulta o exportación.

## Señales y primera respuesta

| Señal/código | Interpretación | Primera comprobación segura |
|---|---|---|
| `checkout.completed` | Checkout legítimo creado | Revisar `payment_mode`, `payment_outcome` y duración. |
| `checkout.provider_failed` | Stripe no creó la sesión | Estado/credenciales del proveedor; el error es reintentable. |
| `checkout.persistence_failed` | No se confirmó la escritura del pedido | Salud de D1 y guards de concurrencia. |
| `webhook.processed` | Evento firmado procesado | `event_kind`, `outcome` y `causation_id`; `duplicate` puede ser idempotencia normal. |
| `webhook.processing_failed` | Firma válida, procesamiento incompleto | D1/outbox; Stripe recibe 500 y puede reintentar. |
| `outbox.dispatch` | Tanda reclamada | Comparar `claimed`, `delivered` y `failed`. |
| `outbox.*` | Fallo tipado de consumidor | Buscar misma operación/correlación y revisar dead-letter autorizado. |
| `email.delivery` | Tanda enviada a Resend | `failed>0` implica reclamo liberado para reintento. |
| `email.delivery_failed` | Fallo inesperado de la tanda | D1/configuración; nunca buscar el destinatario en logs. |

Un cron sin trabajo no emite nada. Una firma inválida, payload inválido o
petición demo tampoco: su ausencia es deliberada y evita amplificación hostil.

## Contención

1. Correlacionar por `operation_id`; no copiar datos de cliente a incidencias.
2. Si el volumen procede de 4xx o tráfico demo, estas señales no son su fuente:
   revisar métricas agregadas del Worker/rate limit, no habilitar logging por
   petición.
3. No añadir temporalmente cuerpos, mensajes crudos ni un endpoint de debug.
4. Si falla un proveedor, mantener reintentos existentes; no vaciar ni exportar
   colas desde el Worker público.
5. Escalar con código, instante UTC, operación/correlación y conteos agregados.

R1.9 no define alertas ni SLO. Su diseño y umbrales corresponden a R11.5 tras
observar suficiente tráfico legítimo y deben conservar estas reglas de
minimización.
