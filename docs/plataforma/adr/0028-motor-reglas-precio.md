# ADR-0028 — reglas de precio puras y snapshot por línea

- Estado: **aceptado e implementado localmente**
- Fecha: 2026-08-14
- Bloque: R4.1

## Contexto

El precio base ya se obtiene en servidor y se calcula en céntimos, pero los
descuentos futuros necesitan una frontera única. Resolver cada promoción en el
checkout produciría prioridades implícitas, redondeos distintos y pedidos cuyo
importe no podría explicarse después de cambiar una regla.

R4.1 debe preparar esa frontera sin adelantar códigos promocionales,
persistencia de campañas ni combinabilidad.

## Decisión

El módulo `pricing` recibe un precio base, cantidad, instante UTC, moneda,
mercado, canal y candidatas ya resueltas. La evaluación es pura: valida todo el
contrato, descarta candidatas fuera de contexto o vigencia y elige como máximo
una por prioridad ascendente e ID estable.

El resultado incluye precio base/efectivo, subtotales, descuento entero, regla
ganadora y evaluación de todas las candidatas. La cotización autoritativa usa
ese resultado para portes y cobro. Al crear el pedido, `order_items` congela
precio base y el JSON completo además del precio efectivo existente.

`0025_price_rule_snapshots.sql` es expand-only. Backfillea líneas históricas
con descuento cero y añade un trigger de compatibilidad para writers previos.
No crea una tabla de reglas: código promocional y descuento automático son las
fuentes de R4.2 y R4.3.

## Invariantes

1. el cliente nunca aporta precio, descuento ni regla aplicable;
2. todos los importes son enteros en céntimos y el precio nunca es negativo;
3. una misma entrada produce siempre el mismo resultado;
4. fin de vigencia es exclusivo y los instantes son UTC explícitos;
5. R4.1 aplica cero o una regla; no existe apilado accidental;
6. prioridad menor gana y el ID desempata independientemente del orden recibido;
7. portes, Stripe y pedido usan el precio efectivo de la misma cotización;
8. el snapshot histórico no se recalcula al cambiar una regla futura.

## Rollback

Retirar `PRC-003` de la composición hace que la fuente entregue cero
candidatas: precio efectivo y base vuelven a coincidir. Las columnas y snapshots
se conservan; writers anteriores siguen funcionando mediante el trigger. No se
eliminan datos ni se revierte `0025` durante un rollback operativo.
