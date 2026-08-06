# Deuda arquitectónica aceptada en R1.1

> Refleja exactamente `tests/architecture-allowlist.ts`. Una excepción es una
> deuda, no una API. La lista solo puede mantenerse o reducirse.

## Resumen por regla

| Regla | Archivos | Propietario | Salida |
|---|---:|---|---|
| `legacy-inverted-import` | 1 | storefront | R1.12 |
| `module-dependency` | 1 | arquitectura | R1.12 |

## Excepciones exactas

| Archivo | Regla | Motivo | Propietario | Bloque que la elimina |
|---|---|---|---|---|
| `src/lib/demo-catalog.ts` | `legacy-inverted-import` | La demo materializa fixtures importando `seed/`. | storefront | R1.12 |
| `src/lib/format.ts` | `module-dependency` | El supuesto shared-kernel lee moneda desde config concreta; retirarlo exige inyectar contexto en presentación y notificaciones. | arquitectura | R1.12 |

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

R1.5 retira cinco más y deja la allowlist en **2 claves**, ambas con salida en
R1.12:

- `payment-transition.ts` deja de construir plantillas de notificación —emite un
  hecho— y se traslada a `src/modules/orders/domain/`, así que su excepción
  desaparece con el archivo;
- el webhook deja de conocer los tipos del SDK: `lib/stripe.ts` devuelve un
  evento de checkout ya normalizado;
- las tres rutas de escritura (webhook, checkout y PATCH del panel) delegan en
  casos de uso compuestos y adaptadores D1, así que no queda SQL en
  presentación: `presentation-sql` pasa de 3 archivos a **0**.

`products.stock` se sigue escribiendo desde el adaptador de pedidos. No es una
excepción de la allowlist —no cruza ninguna regla estática— pero sí deuda de
propiedad física declarada: el ledger de inventario es R2.6/R2.7.
