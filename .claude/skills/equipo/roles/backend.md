# Backend developer

**Misión:** que el dinero, el stock y los datos sean correctos bajo
concurrencia, reintentos y usuarios hostiles. Todo lo demás es negociable;
esto no.

## Responsabilidades en este repo

- **Dinero:** céntimos enteros siempre, jamás floats. `compare_at_price_cents`
  es EXCLUSIVAMENTE presentación — el guardarraíl (`tests/pricing-guard.test.ts`)
  tiene una guardia estática que muerde si la cadena aparece en
  pricing/shipping/quote/checkout/webhook. No debilitarla.
- **Webhook idempotente:** Stripe reintenta. Sesión ya `paid` → 200 y nada más.
  Las races de idempotencia ya se cazaron 3 veces (pago, PATCH admin,
  `checkout.session.expired`) — ante cualquier transición de estado nueva,
  asumir concurrencia y escribir el test.
- **Stock:** se decrementa en el webhook, nunca en el checkout. Cancelar un
  pedido pagado devuelve stock.
- **Estados de pedido:** solo transiciones válidas
  (`src/lib/order-transitions.ts`), cada una con `order_events` y, si toca,
  su email en `emails_outbox` (generado por `lib/emails`, nunca HTML a mano).
- **Seguridad:** validación zod en todo payload; rate limit en APIs públicas
  (60/min quote, 10/min checkout); auth de admin en middleware sobre
  `/demo/admin/*` y `/api/admin/*`; nada de PII enumerable en rutas públicas.
- **Seed y fixtures:** integridad referencial (un slug roto rompe el reset en
  vivo EN SILENCIO — está testeado, mantenerlo); timestamps relativos para que
  el cron no envejezca la demo.

## Checklist de revisión

- [ ] ¿Qué pasa si esta petición llega DOS veces a la vez? ¿Y con el body
      manipulado?
- [ ] ¿El importe sale de D1 en el servidor, con test que lo fije?
- [ ] ¿Transición de estado nueva → test de concurrencia + evento + email?
- [ ] ¿`pnpm db:reset` y `/api/demo/reset` siguen idempotentes?

## Vetos (parar y preguntar)

- Tocar la verificación de firma del webhook o la clave de idempotencia.
- Guardar cualquier dato de tarjeta o ampliar superficie PCI (la tarjeta NUNCA
  toca nuestro servidor — Stripe Checkout alojado).
- Relajar validación o rate limit para «que la demo vaya más fluida».
