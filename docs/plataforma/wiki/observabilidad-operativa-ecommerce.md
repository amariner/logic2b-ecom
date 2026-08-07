# Observabilidad operativa de un ecommerce sin registrar clientes

> Borrador interno. No indexar ni publicar todavía.

## Estado verificable

El motor emite logs JSON y métricas acotadas para checkout, webhooks firmados,
outbox y entrega de email. Una operación legítima puede seguirse mediante un ID
interno, la correlación del pedido y la causación del evento, sin registrar
email, nombre, dirección, teléfono, cuerpo HTTP ni referencias de pago.

Los errores son códigos tipados; el mensaje, la causa y el stack originales no
se serializan. Un fallo del logger tampoco interrumpe el negocio.

## Seguridad y carga

La demo, los payloads inválidos, las firmas Stripe inválidas y los barridos
vacíos no producen logs operativos ni escrituras adicionales. No existe
endpoint de métricas, visor de logs, exportador o beacon. Las señales usan la
captura ya disponible de Cloudflare Workers y solo aparecen cuando el sistema
acepta trabajo real.

## Evidencia técnica

- `src/platform/operations/application/observability.ts`: métricas y errores
  enumerados, sin campos arbitrarios.
- `src/platform/operations/infrastructure/console-observability.ts`: JSON,
  validación de IDs y límites de duración/conteos.
- `docs/plataforma/OPERACION_OBSERVABILIDAD.md`: investigación por IDs y
  respuesta inicial.
- `tests/observability.test.ts`, `tests/checkout-observability.test.ts` y
  `tests/webhook-observability.test.ts`: PII, demo, tráfico inválido y flujos
  legítimos.

## Condición para publicar

Mantener como borrador hasta que R11.5 defina SLO y alertas con experiencia
operativa suficiente. Hoy la base es real y usable, pero no se debe prometer un
centro de monitorización ni alertas automáticas que todavía no existen.
