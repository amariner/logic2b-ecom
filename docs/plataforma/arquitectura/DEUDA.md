# Deuda arquitectónica aceptada en R1.1 — cerrada en R1.12

> Refleja exactamente `tests/architecture-allowlist.ts`. Una excepción es una
> deuda, no una API. La lista solo puede mantenerse o reducirse.

## Estado

La allowlist ejecutable está vacía: **0 excepciones**. Se mantienen el sello de
la línea base y los checks para impedir que una deuda antigua reaparezca bajo
otro nombre.

## Cierre de las dos últimas excepciones

- `src/lib/demo-catalog.ts` ahora recibe un contrato de fixtures puro;
  `src/composition/demo-catalog.ts` es el único punto que conecta los seeds.
- `src/lib/format.ts` recibe la divisa como argumento; notificaciones inyecta
  `shopConfig.currency` y el wrapper EUR de presentación sigue siendo puro.

No se incluyen `src/lib/db.ts`, `orders.ts`, `send-email.ts`, `thanks.ts` o
`backup.ts` en esta regla porque, aunque hoy estén planos, actúan como
adaptadores de infraestructura y no como presentación. Su traslado físico se
hará al tocar el caso de uso; los checks de dominio impiden convertirlos en
precedente dentro de una capa `domain/`.

R1.4 retira dos excepciones: el registro de escaparates pasa a
`src/collections/index.ts`, donde compone piezas de su propia capa, y la
exportación de backup delega en un caso de uso con adaptador D1 bajo
`src/platform/operations/`. La allowlist baja de 9 a 7 claves.

R1.5 retiró cinco más y dejó la allowlist en **2 claves**, cerradas por R1.12:

- `payment-transition.ts` deja de construir plantillas de notificación —emite un
  hecho— y se traslada a `src/modules/orders/domain/`, así que su excepción
  desaparece con el archivo;
- el webhook deja de conocer los tipos del SDK: `lib/stripe.ts` devuelve un
  evento de checkout ya normalizado;
- las tres rutas de escritura (webhook, checkout y PATCH del panel) delegan en
  casos de uso compuestos y adaptadores D1, así que no queda SQL en
  presentación: `presentation-sql` pasa de 3 archivos a **0**.

Desde R2.7 `products.stock` solo es espejo de la variante default y el módulo de
inventario posee balance/movimiento. R2.8 separa además la versión de reservas.
R2.14 verificó el conjunto y conservó el espejo: retirarlo es una contracción
destructiva futura, condicionada por `GUIA_MIGRACION_R2.md` a una versión
estable observada, ADR/migración propios y autorización expresa.
