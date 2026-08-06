# Deuda arquitectónica aceptada en R1.1

> Refleja exactamente `tests/architecture-allowlist.ts`. Una excepción es una
> deuda, no una API. La lista solo puede mantenerse o reducirse.

## Resumen por regla

| Regla | Archivos | Propietario | Salida |
|---|---:|---|---|
| `legacy-inverted-import` | 1 | storefront | R1.12 |
| `module-dependency` | 2 | arquitectura/orders | R1.5 / R1.12 |
| `restricted-sdk-import` | 1 | payments | R1.5 |
| `presentation-sql` | 3 | módulos propietarios | R1.5 |

## Excepciones exactas

| Archivo | Regla | Motivo | Propietario | Bloque que la elimina |
|---|---|---|---|---|
| `src/lib/demo-catalog.ts` | `legacy-inverted-import` | La demo materializa fixtures importando `seed/`. | storefront | R1.12 |
| `src/lib/format.ts` | `module-dependency` | El supuesto shared-kernel lee moneda desde config concreta; retirarlo exige inyectar contexto en presentación y notificaciones. | arquitectura | R1.12 |
| `src/lib/payment-transition.ts` | `module-dependency` | Pedido crea plantillas de notificación directamente. | orders | R1.5 |
| `src/pages/api/webhooks/stripe.ts` | `restricted-sdk-import` | La presentación conoce el tipo `Stripe.Checkout.Session`. | payments | R1.5 |
| `src/pages/api/admin/orders/[id].ts` | `presentation-sql` | PATCH coordina estado, stock y outbox en SQL. | orders | R1.5 |
| `src/pages/api/checkout/session.ts` | `presentation-sql` | Checkout inserta pedido/items/evento y consulta producto. | checkout | R1.5 |
| `src/pages/api/webhooks/stripe.ts` | `presentation-sql` | El webhook consulta pedido/items antes de la mutación. | payments | R1.5 |

No se incluyen `src/lib/db.ts`, `orders.ts`, `send-email.ts`, `thanks.ts` o
`backup.ts` en esta regla porque, aunque hoy estén planos, actúan como
adaptadores de infraestructura y no como presentación. Su traslado físico se
hará al tocar el caso de uso; los checks de dominio impiden convertirlos en
precedente dentro de una capa `domain/`.

R1.2 crea la configuración tipada, pero deliberadamente no la conecta al
runtime. Por eso `format.ts` no puede dejar de leer `shop.config.ts` sin pasar
moneda/contexto por sus consumidores de storefront y notificaciones o mover la
misma deuda a otro helper. Su salida queda en la consolidación R1.12; la clave
de la excepción no cambia y la allowlist no crece.

R1.4 retira dos excepciones: el registro de escaparates pasa a
`src/collections/index.ts`, donde compone piezas de su propia capa, y la
exportación de backup delega en un caso de uso con adaptador D1 bajo
`src/platform/operations/`. La allowlist baja de 9 a 7 claves.
