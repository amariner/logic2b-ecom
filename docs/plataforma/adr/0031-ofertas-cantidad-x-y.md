# ADR-0031 — cantidad, compra X/Y y devolución proporcional

- Estado: **aceptado e implementado localmente**
- Fecha: 2026-08-14
- Bloque: R4.4

## Contexto

Los tramos y una oferta «compra X y consigue Y» dependen de cantidades de todo
el carrito, no solo de una línea aislada. A la vez, pedidos, Stripe, ediciones y
reembolsos ya operan con un precio unitario entero congelado. Guardar unidades
gratis separadas permitiría elegir qué unidad devolver y rompería la
proporcionalidad; recalcular al editar destruiría el contrato histórico.

## Decisión

`quantity_offers` representa dos contratos versionados:

1. `quantity_tier`: mide unidades o subtotal base dentro de un scope y elige el
   mayor umbral alcanzado;
2. `buy_x_get_y`: admite scopes X/Y idénticos o disjuntos, múltiplos, máximo de
   aplicaciones y premio porcentual o fijo sobre las unidades Y más baratas,
   con desempate por `product_id`.

X/Y calcula primero el beneficio teórico de las unidades premio. Después busca
el menor porcentaje entero que, al redondear por línea en céntimos, alcanza ese
beneficio y lo reparte entre todas las líneas participantes. Cualquier residuo
de redondeo favorece al comprador. El resultado mantiene un único precio
unitario por línea y permite devolver `precio congelado × cantidad` sin elegir
artificialmente entre una unidad pagada y otra gratis.

Un código elegible conserva precedencia global. Sin código, la campaña
automática y la oferta por cantidad elegibles compiten por prioridad e ID
estable. Solo una fuente entra en el pedido; la combinabilidad espera R4.5.

La edición no reevalúa campañas históricas: la cantidad vigente crece o decrece
al precio unitario congelado. Una línea nueva usa el precio base vigente. Esta
política es explícita en el snapshot y evita cambios retroactivos de precio.

## Invariantes

1. cantidades, productos, precios y contexto proceden del servidor;
2. un tramo usa el mayor umbral alcanzado sobre subtotal base o unidades;
3. scopes X/Y solo pueden ser idénticos o disjuntos, nunca parcialmente solapados;
4. la selección de Y es estable: menor precio y después menor `product_id`;
5. el descuento X/Y real nunca es inferior al premio teórico por redondeo;
6. pedido, edición, cancelación y devolución usan el precio unitario congelado;
7. código, automático y cantidad/X-Y nunca conviven en el mismo pedido;
8. `quantity_offer_applications` contrasta versión, contexto, scope, evidencia,
   múltiplos, redondeo, líneas e importe antes de aceptar el snapshot;
9. `PRC-006` y `PRC-007` son flags separados; apagar uno no activa el otro;
10. la demo no crea ofertas ni ejecuta compras reales.

## Consecuencias

El beneficio real de X/Y puede superar el teórico por pocos céntimos para
mantener proporcionalidad exacta por unidad; nunca queda por debajo. Las
ediciones no optimizan de nuevo la campaña: un cambio comercial posterior no
altera el pedido aceptado. La combinación de fuentes y topes agregados queda
fuera hasta R4.5.

## Rollback

Desactivar rutas/efectos de `PRC-006` y `PRC-007` impide nuevas aplicaciones.
No se contrae `0028` ni se borran snapshots. Pedidos históricos siguen
reembolsándose y editándose con su precio congelado.
