# ADR-0029 — códigos promocionales con uso reservado

- Estado: **aceptado e implementado localmente**
- Fecha: 2026-08-14
- Bloque: R4.2

## Contexto

Un código promocional no es solo una regla de precio: necesita lookup seguro,
scope, límites concurrentes y un ciclo de vida ligado al pedido. Contar usos
después del pago permite superar el límite con checkouts simultáneos; contarlos
para siempre desde la cotización bloquea cupo sin pedido. Guardar el texto claro
amplía además su exposición en backups y panel.

## Decisión

El código se normaliza mediante NFKC y un alfabeto ASCII cerrado, se busca por
SHA-256 con namespace y D1 solo conserva hash y pista parcial. La API de alta
devuelve el valor normalizado una vez; listados, auditoría y usos nunca lo
incluyen.

`promotion_codes` congela versión, efecto, vigencia, moneda, mercados, canales,
mínimo, límites y scope de producto. Un scope vacío significa todos los
productos. R4.2 admite porcentaje o cantidad fija **por unidad elegible**; los
descuentos de pedido/envío esperan su clase explícita en R4.5.

Al crear el pedido, `promotion_code_usages` reserva el cupo en la misma batch
que líneas y evento. El trigger recalcula límites y contrasta versión, contexto,
scope e importe contra los snapshots R4.1. Pago confirmado consume; caducidad o
cancelación pendiente libera. Una compra ya pagada conserva el uso aunque se
reembolse: el importe proporcional sale del precio efectivo por unidad y no se
habilita reutilización abusiva.

El límite por cliente usa un hash namespaceado del email normalizado. No crea
perfil ni segmento y no introduce PII nueva; esas capacidades pertenecen a R5.

## Invariantes

1. el cliente aporta un código, nunca precio, efecto, prioridad ni descuento;
2. código y email no aparecen claros en tablas de uso, auditoría o respuesta de listado;
3. reservas y consumos cuentan para los límites; liberadas no cuentan;
4. una carrera por el último uso tiene un único ganador D1;
5. la reserva exige pedido pendiente y snapshots que correspondan al código;
6. moneda, ventana, mínimo, mercado, canal y producto se revalidan en servidor;
7. el uso conserva versión e importe aunque la configuración se desactive;
8. un reembolso usa `order_items.unit_price_cents`, ya proporcional al descuento;
9. R4.3 le da precedencia global sobre un automático; no existe apilado hasta PRC-008.

## Rollback

Desactivar `PRC-004` cierra API y hace que cotización rechace cualquier código.
Los pedidos sin código siguen iguales. Se conservan tablas, usos y snapshots;
las reservas pendientes se liberan por su transición normal, no borrando filas.
