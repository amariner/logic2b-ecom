# ADR-0015 — Fulfillment por líneas y transición del envío total

- Estado: **aceptado e implementado localmente en R2.11**
- Fecha: 2026-08-11
- Mandato: R2.11

## Contexto

El envío actual modifica `orders.status` y guarda un único transportista y
tracking en `orders`. Es correcto para el caso simple, pero no demuestra qué
cantidades de cada línea se prepararon, impide varios grupos y convierte el
estado del pedido en la única evidencia logística. R2.11 debe introducir la
primitiva por líneas sin adelantar todavía la operación parcial de R2.12 ni las
ubicaciones de R3.6.

ADR-0012 ya aceptó el destino y exigió una puerta separada para su SQL. Andreu
aprobó esa puerta el 2026-08-11: el esquema se materializó y ensayó localmente;
la aplicación remota y el despliegue continúan sujetos a autorización propia.

## Decisión

El esquema aceptado vive en
[`../../../migrations/0012_fulfillment_lines.sql`](../../../migrations/0012_fulfillment_lines.sql):

1. `fulfillments` representa un grupo operativo de un pedido, con estado,
   tracking, timestamps, versión y clave idempotente;
2. `fulfillment_items` asigna una cantidad positiva a una línea y conserva
   `order_id` para que dos FKs compuestas impidan unir pedidos distintos;
3. un fulfillment puede avanzar `pending → ready|shipped|cancelled`,
   `ready → shipped|cancelled` y `shipped → delivered`; los terminales no
   reabren;
4. `shipped` y `delivered` exigen transportista, tracking y timestamps
   coherentes; carrier y número aparecen o desaparecen juntos;
5. el envío total actual crea un único grupo ya `shipped` y asigna toda cantidad
   neta pendiente de cada línea; R2.12 añadirá la selección parcial sin cambiar
   estas tablas;
6. `orders.status` y `orders.tracking_*` permanecen como proyección/espejo hasta
   R2.14. El tracking canónico pertenece al fulfillment.

No entra una dependencia, proveedor, etiqueta, coste, ubicación, nueva ruta ni
promesa comercial. La demo pública sigue siendo de solo lectura.

## Invariantes

- toda cantidad es un entero positivo y la suma activa por línea nunca supera
  `order_items.qty` neta de cancelaciones;
- un grupo contiene solo líneas de su propio pedido, incluso ante SQL hostil;
- la pareja fulfillment–línea es única;
- un replay usa la misma clave idempotente y no crea otro grupo ni duplica
  cantidades;
- un fulfillment cancelado deja de consumir cantidad disponible, pero conserva
  evidencia; no se borra para “liberar” unidades;
- un tracking pertenece al grupo, no al pedido; el espejo legacy solo se
  escribe mientras exista un único envío total;
- no se guarda PII, dinero, SKU, etiqueta binaria ni respuesta cruda de un
  transportista;
- preparar o enviar no mueve inventario: el stock ya salió al capturar el pago.

## Backfill determinista

Sobre un export fresco restaurado en aislamiento:

1. bloquear pedidos `shipped|delivered` sin líneas, carrier o tracking;
2. bloquear cantidades no enteras/positivas y líneas ajenas;
3. crear un grupo por pedido enviado con clave
   `r2:fulfillment:legacy:order:{order_id}`;
4. derivar `shipped_at` del primer `order_events.to_status='shipped'` y
   `delivered_at` del primer evento equivalente; una ausencia bloquea, no se
   sustituye por “ahora”;
5. insertar una asignación por línea con `quantity = order_items.qty`;
6. no crear grupos ficticios para `pending`, `paid` o `cancelled`;
7. repetir el backfill y demostrar hashes idénticos, cero FKs y
   `integrity_check = ok`, después hacer dump/restore y repetir las guardas.

## Escritura dual y concurrencia

La transición administrativa `paid → shipped` conserva el evento
`orders.order_shipped`. En la misma `DB.batch()` guardada por estado y ausencia
de reembolso activo se escriben:

1. evento, auditoría y entregas de outbox;
2. cabecera con clave `r2:fulfillment:event:{event_id}`;
3. todas las líneas pendientes calculadas en servidor;
4. timeline y espejo `orders.status`/`tracking_*`.

Las sentencias de cabecera y líneas dependen del evento persistido y de la clave
única. Una carrera perdedora produce cero evidencia nueva. Si una cantidad ya
está agotada, toda la batch revierte; nunca se trunca ni se satura. La transición
`shipped → delivered` actualiza grupo y proyección con versión esperada.

R2.11 no añade un segundo formulario: el panel conserva “Marcar enviado” como
caso total y lee el grupo canónico. R2.12 podrá mostrar selección por cantidades
y múltiples trackings cuando exista operación parcial real.

## Rollout y rollback

1. aprobar y materializar el DDL como migración aditiva `0012`;
2. ensayar preflight/backfill/replay/restore sobre copia aislada;
3. aplicar esquema y backfill sin cambiar lectores;
4. desplegar doble escritura y shadow-read contra el espejo;
5. cortar lectura al fulfillment tras reconciliación a cero;
6. conservar columnas legacy hasta R2.14.

Volver al binario anterior es seguro mientras la doble escritura mantenga el
espejo. La migración no elimina columnas ni filas. Un despliegue remoto y el
corte de lector requieren su propia autorización operativa.

## Alternativas rechazadas

- **Segundo tracking en `orders`:** aplaza el problema y no asigna cantidades.
- **JSON de líneas:** pierde FKs, sumas consultables y guardas de concurrencia.
- **Una fila por línea sin cabecera:** duplica tracking/estado y no modela grupo.
- **Crear ubicaciones ahora:** pertenece a R3.6 y añade operación ficticia.
- **Implementar parciales en R2.11:** mezcla dos bloques y amplía UI/API antes de
  estabilizar el caso total.
- **Eliminar el espejo al cortar:** impide rollback incremental antes de R2.14.

## Consecuencias

- el envío simple actual pasa a ser evidencia por cantidades sin cambiar la
  carga operativa del panel;
- R2.12 podrá añadir varios grupos sobre el mismo contrato;
- la FK compuesta añade un índice pequeño a `order_items`, aceptable frente a
  impedir asociaciones cruzadas de pedido;
- la suma por línea sigue siendo una guarda transaccional de aplicación porque
  SQLite no admite `CHECK` con agregados entre filas;
- R2.11 materializa migración, seed, runtime, backup y lectura administrativa;
  producción conserva `0011` hasta una autorización operativa separada.
