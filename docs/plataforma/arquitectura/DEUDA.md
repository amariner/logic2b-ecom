# Deuda arquitectónica aceptada en R1.1

> Refleja exactamente `tests/architecture-allowlist.ts`. Una excepción es una
> deuda, no una API. La lista solo puede mantenerse o reducirse.

## Resumen por regla

| Regla | Archivos | Propietario | Salida |
|---|---:|---|---|
| `legacy-inverted-import` | 2 | arquitectura/storefront | R1.4 / R1.12 |
| `module-dependency` | 2 | arquitectura/orders | R1.5 / R1.12 |
| `restricted-sdk-import` | 1 | payments | R1.5 |
| `presentation-sql` | 13 | módulos propietarios | R1.3–R1.5 / R1.12 |

## Excepciones exactas

| Archivo | Regla | Motivo | Propietario | Bloque que la elimina |
|---|---|---|---|---|
| `src/lib/collections.ts` | `legacy-inverted-import` | El registro del motor importa colecciones concretas. | arquitectura | R1.4 |
| `src/lib/demo-catalog.ts` | `legacy-inverted-import` | La demo materializa fixtures importando `seed/`. | storefront | R1.12 |
| `src/lib/format.ts` | `module-dependency` | El supuesto shared-kernel lee moneda desde config concreta; retirarlo exige inyectar contexto en presentación y notificaciones. | arquitectura | R1.12 |
| `src/lib/payment-transition.ts` | `module-dependency` | Pedido crea plantillas de notificación directamente. | orders | R1.5 |
| `src/pages/api/webhooks/stripe.ts` | `restricted-sdk-import` | La presentación conoce el tipo `Stripe.Checkout.Session`. | payments | R1.5 |
| `src/pages/api/admin/backup.sql.ts` | `presentation-sql` | El endpoint compone el dump D1. | platform/operations | R1.4 |
| `src/pages/api/admin/orders/[id].ts` | `presentation-sql` | PATCH coordina estado, stock y outbox en SQL. | orders | R1.5 |
| `src/pages/api/admin/orders/export.csv.ts` | `presentation-sql` | La exportación consulta pedido y líneas directamente. | fulfillment | R1.3 |
| `src/pages/api/admin/products/[id].ts` | `presentation-sql` | PATCH actualiza catálogo desde la ruta. | catalog | R1.3 |
| `src/pages/api/admin/shipping-rates/[id].ts` | `presentation-sql` | PATCH actualiza tarifas desde la ruta. | fulfillment | R1.3 |
| `src/pages/api/checkout/session.ts` | `presentation-sql` | Checkout inserta pedido/items/evento y consulta producto. | checkout | R1.5 |
| `src/pages/api/contact.ts` | `presentation-sql` | La ruta persiste y marca la solicitud directamente. | marketing | R1.3 |
| `src/pages/api/webhooks/stripe.ts` | `presentation-sql` | El webhook consulta pedido/items antes de la mutación. | payments | R1.5 |
| `src/pages/demo/admin/emails.astro` | `presentation-sql` | La página consulta la bandeja. | notifications | R1.3 |
| `src/pages/demo/admin/envios.astro` | `presentation-sql` | La página consulta tarifas. | fulfillment | R1.3 |
| `src/pages/demo/admin/index.astro` | `presentation-sql` | La página consulta listado y conteos de pedido. | orders | R1.3 |
| `src/pages/demo/admin/pedidos/[id].astro` | `presentation-sql` | La página consulta pedido, líneas y timeline. | orders | R1.3 |
| `src/pages/demo/admin/productos.astro` | `presentation-sql` | La página consulta productos. | catalog | R1.3 |

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
