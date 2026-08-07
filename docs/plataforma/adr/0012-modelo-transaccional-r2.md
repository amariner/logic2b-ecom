# ADR-0012 — Modelo transaccional incremental para R2

- Estado: **accepted como diseño; cada migración conserva su propia puerta**
- Fecha: 2026-08-07
- Mandato: R2.1

## Contexto

El MVP sostiene con pruebas el flujo producto simple → pago → pedido → envío,
pero usa una fila de producto como unidad editorial, vendible e inventariable;
un string de pedido como resumen comercial, financiero y logístico; y columnas
de Stripe/tracking como único historial. Ese modelo no puede admitir variantes,
movimientos de stock, reembolsos ni envíos parciales sin perder invariantes o
llenar `orders` de estados contradictorios.

Una reescritura big-bang rompería clonabilidad, seeds, copias, fixtures y la
ruta de cobro ya probada. D1 y el despliegue aislado por cliente permiten una
transición aditiva por releases, pero obligan a que cada corte tenga un lector
anterior disponible y un backfill determinista.

## Decisión

Adoptar el modelo y el plan de
[`../MODELO_TRANSACCIONAL_R2.md`](../MODELO_TRANSACCIONAL_R2.md):

1. `products` conserva identidad editorial y `product_variants` pasa a ser la
   unidad vendible con SKU, precio, estado y combinación de opciones.
2. El inventario se registra como movimientos append-only y una proyección de
   balance por variante; reservas es un módulo opcional posterior.
3. Pagos y transacciones forman un ledger independiente del estado del pedido;
   los reembolsos tienen workflow, asignación por líneas e idempotencia propia.
4. Fulfillment agrupa cantidades de líneas y posee su tracking; el estado global
   del pedido es una proyección, no la única evidencia.
5. Las líneas de pedido conservan snapshots y añaden referencia de variante.
6. La transición usa expand/backfill/shadow-read/doble escritura/contract. Las
   columnas legacy permanecen como espejos hasta R2.14.

R2.1 acepta la dirección y las invariantes, no autoriza SQL vivo. R2.2, R2.6,
R2.9 y R2.11 deben presentar el SQL exacto y activar de nuevo la puerta de
esquema que les corresponda.

## Invariantes no negociables

- Dinero en céntimos enteros y moneda congelada; el cliente no aporta precios.
- Un producto vendible tiene al menos una variante y exactamente un default.
- El stock disponible se decide atómicamente desde movimientos/balance; no se
  satura a cero para ocultar una carrera.
- Movimientos financieros y de inventario son inmutables y deduplicados.
- Un reembolso no se infiere de una cancelación histórica: falta evidencia del
  PSP y se marca para reconciliación humana.
- Cantidades preparadas, canceladas y reembolsadas nunca exceden la línea.
- Tarjeta y respuesta cruda del PSP permanecen fuera de D1.
- Un módulo apagado no añade navegación, jobs, efectos ni carga de operación.

## Compatibilidad y recuperación

Cada paso es aditivo hasta R2.14. Seeds v1 producen una variante por defecto;
backups y exports se versionan; el CSV logístico consume snapshots. El binario
anterior puede releer espejos mientras estos sigan completos. Tras declarar un
ledger fuente de verdad, un rollback con escrituras exige congelar, reconciliar
y registrar el delta antes de avanzar de nuevo.

R2.1 ensayó export y restore local en una base temporal: 12 tablas, 18 índices
y recuentos idénticos; claves foráneas e integridad en verde. Antes de cada
migración se repite sobre export remoto en una D1 aislada y se conserva la copia
hasta superar el periodo de observación.

## Alternativas rechazadas

- **Añadir columnas de talla/color/segundo tracking a las tablas actuales:**
  multiplica casos especiales y no modela cantidades ni historia.
- **JSON de variantes, movimientos o fulfillments:** evita FKs, unicidad,
  consultas indexadas y guardas de concurrencia.
- **Reemplazar tablas en una sola migración:** acopla schema y binario, elimina
  rollback seguro y arriesga seeds/copias de cada clon.
- **Usar eventos/outbox como ledger:** los eventos distribuyen hechos; no
  sustituyen el saldo consultable ni la contabilidad de negocio.
- **Crear ubicaciones en R2:** adelanta interfaz y complejidad de R3.6. R2 lleva
  balance global por variante y R3 hará el backfill a ubicación principal.
- **Asumir que cancelado significa reembolsado:** el motor actual no llama al
  PSP al cancelar; fabricar esa transacción falsearía dinero.

## Consecuencias

- El producto simple conserva comportamiento mediante una variante default.
- Las olas posteriores obtienen bases estables para promociones, B2B,
  multidivisa, ubicaciones y devoluciones sin rediseñar el pedido otra vez.
- Durante R2 existe coste temporal de doble escritura y reconciliación; está
  acotado y se elimina únicamente en la consolidación.
- Habrá varias migraciones pequeñas y puertas explícitas en lugar de una gran.
- La matriz puede pasar a `especificado` solo en las capacidades cuyo contrato
  queda fijado; ninguna se presenta todavía como disponible.
