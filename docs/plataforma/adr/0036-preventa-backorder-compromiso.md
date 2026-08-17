# ADR-0036 — Preventa y backorder como compromiso explícito

- Estado: aceptado; implementado localmente con autorización de Andreu
- Fecha: 2026-08-17
- Bloque: R4.9
- Capacidad: `PRC-014`

## Contexto

El stock físico disponible no puede volverse negativo ni dejar de ser la fuente
de verdad solo porque una tienda quiera aceptar una preventa. Una venta sin
existencias necesita explicar qué cantidad se sirve ahora, qué cantidad queda
comprometida, cuándo se espera poder asignarla y cuándo se cobra. Esa promesa
debe sobrevivir a cambios posteriores de catálogo y ser visible para cliente y
operación.

El motor actual reserva exclusivamente unidades existentes y las consume al
confirmar el pago. Cancelación, reembolso, edición, fulfillment y RMA presuponen
que toda unidad pagada llegó a descontarse del ledger. Permitir que checkout
ignore esa precondición introduciría stock fantasma al reponer y permitiría
preparar una línea que todavía no se puede servir.

## Decisión propuesta

1. `PRC-014` gobierna toda la superficie. Apagada, no añade rutas, payloads,
   navegación ni efectos y conserva exactamente el rechazo actual por falta de
   stock.
2. Una política versionada se aplica a una variante y distingue:
   - `preorder`: toda la cantidad elegible nace diferida durante una ventana
     publicada, aunque exista stock físico;
   - `backorder`: solo la cantidad que excede el disponible nace diferida.
3. La política congela en cada línea de pedido su tipo, versión, cantidad
   inmediata, cantidad diferida, ventana de disponibilidad y texto público. La
   fecha no se recalcula retroactivamente si el comercio cambia la política.
4. R4.9 soporta únicamente `charge_now`: checkout cobra el total mediante el
   mismo Stripe Checkout alojado y muestra la condición antes de crear la
   sesión. `charge_on_allocation` queda representable como política inactiva,
   pero el dominio y el API deben rechazar su activación hasta R4.11 o un
   contrato específico de pago posterior. No se guarda tarjeta ni se amplía la
   superficie PCI.
5. El límite vendible se decide en servidor como `cantidad física disponible +
   cupo diferido restante`. Una política sin cupo, sin ventana válida o vencida
   no hace comprable una línea agotada. La cotización separa explícitamente
   `immediate_quantity` y `deferred_quantity`; solo ambas sumadas forman la
   cantidad cobrada.
6. Al crear el pedido se reservan únicamente las unidades inmediatas. Las
   diferidas crean compromisos append-only/proyectados ligados a
   `order_item_id`; confirmar el pago consume la reserva inmediata, nunca
   descuenta inventario inexistente.
7. El compromiso recorre `pending_payment → awaiting_stock → partially_allocated
   → allocated`; una cancelación parcial deja `partially_cancelled` y la total
   termina en `cancelled`. Cada transición usa versión esperada, idempotency key,
   evento y auditoría. Un replay no duplica asignación ni comunicación.
8. Asignar exige existencias reales en una ubicación. La operación consume el
   ledger global y el de ubicación con motivo explícito de asignación diferida,
   enlaza el movimiento al compromiso y respeta FIFO por `paid_at`, `created_at`
   e `id`. No se puede asignar una cantidad superior a la pendiente ni dejar
   `on_hand < reserved`.
9. Fulfillment no puede incluir cantidad diferida no asignada. Una vez asignada,
   esa cantidad se comporta como stock ya comprometido por el pedido y entra en
   el motor R3.9 sin una segunda venta.
10. Cancelación, reembolso parcial y edición distinguen tres cantidades por
    línea: inmediata consumida, diferida asignada y diferida pendiente. Solo las
    dos primeras pueden reponerse; la pendiente se cancela sin crear stock.
    Devolución física sigue limitada a unidades realmente enviadas.
11. La confirmación de pago informa de cada línea diferida y de su ventana. Una
    asignación completa emite una comunicación específica; cambios de promesa
    nunca se envían silenciosamente y requieren una transición auditada con
    motivo. La demo pública permanece de solo lectura.
12. Ninguna fecha concreta se inventa en código, seed o documentación
    comercial. Los fixtures pueden usar fechas relativas y rotularse como demo;
    cada despliegue de cliente configura y asume su propia promesa.

## Persistencia propuesta

La migración expand-only `0033_preorders_backorders.sql` añade:

- `preorder_policies`: variante, tipo, estado, ventana de venta, ventana de
  disponibilidad, cupo diferido, política de cobro, texto público, versión y
  timestamps;
- `preorder_commitments`: pedido/línea/variante, snapshot de política, cantidades
  inmediata/diferida/asignada/repuesta/cancelada, estado, versión y timestamps;
- `preorder_commitment_events`: historial idempotente y guarda optimista de las
  transiciones;
- `preorder_allocations`: cantidad asignada, ubicación, movimientos global/local,
  orden FIFO, clave idempotente y timestamp;
- índices parciales para política activa por variante, cola pendiente FIFO y
  compromisos de pedido.

Las proyecciones deben imponer por `CHECK` y trigger:

```text
ordered = immediate + deferred
deferred = allocated + cancelled + pending
restored <= allocated
fulfilled <= immediate + allocated - restored
0 <= committed_active <= policy.capacity
```

El esquema no modifica ni borra filas existentes. Pedidos anteriores no reciben
compromisos por backfill y conservan la semántica actual.

## Fronteras del bloque

- No incluye suscripciones R4.10, presupuestos/enlaces de pago R4.11, perfiles
  R5 ni conectores de compra o aprovisionamiento.
- No promete una fecha de entrega: conserva una ventana de disponibilidad
  aportada por el comercio y distingue expresamente disponibilidad de envío.
- No autoasigna al recibir stock sin una operación idempotente observable; una
  futura automatización podrá invocar el mismo caso de uso.
- No permite overselling ilimitado ni stock negativo.

## Verificación exigida

- Property tests de resolución inmediata/diferida, cupo y ventanas.
- Carreras de última unidad física, último cupo y doble asignación.
- Pago, expiración, cancelación, reembolso parcial y total sin stock fantasma.
- Fulfillment bloqueado antes de asignar y permitido después.
- Rehearsal `0033` sobre backup aislado, restore, foreign keys y compatibilidad
  con Worker anterior.
- API/admin, 1440/375, teclado, contraste, E2E de compra y bandeja de emails.
- Backup con el nuevo esquema y documentación operativa de reconciliación.

## Rollback

Desactivar `PRC-014` retira compra diferida, rutas y efectos. Las políticas se
pausan antes del rollback del Worker para no aceptar compromisos nuevos. Los ya
pagados se conservan y se operan con el último Worker compatible hasta quedar
asignados o cancelados. El Worker anterior ignora las tablas nuevas; no se
contraen ni se borran compromisos, eventos o asignaciones sin una migración
destructiva y autorización independiente.
