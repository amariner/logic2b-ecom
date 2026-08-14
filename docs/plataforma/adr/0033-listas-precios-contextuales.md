# ADR-0033 — Listas de precios contextuales antes de promociones

- Estado: accepted; R4.6 implementado localmente
- Fecha: 2026-08-14
- Capacidad: `PRC-009`

## Contexto

El precio de catálogo ya era autoritativo, pero ventas por mercado, canal o
empresa necesitan una base distinta sin convertir una lista en descuento ni
aceptar identidad comercial escrita por el comprador. La solución debe convivir
con `PRC-003`–`PRC-008`, conservar el precio histórico del pedido y funcionar
antes de que R5 introduzca perfiles de cliente.

## Decisión

1. Una lista selecciona el **precio base promocional**. Después se evalúan
   códigos, automáticos, cantidad/X-Y y combinabilidad sobre esa base.
2. La resolución es por producto: lista de empresa → lista general → catálogo.
   Dentro de cada nivel ganan `priority` ascendente e `id` estable.
3. Mercado, canal, divisa y tiempo proceden del contexto servidor. Una lista de
   empresa solo es elegible con `priceListCompanyKeyHash`, también resuelto por
   servidor. `customer.company` nunca participa en pricing.
4. El snapshot de línea conserva catálogo, lista, versión, prioridad, precio
   elegido, scope empresarial y profundidad de fallback. La aplicación por
   pedido agrega líneas y subtotales de catálogo/lista por cada lista usada.
5. Una lista se crea de forma inmutable en precios y scopes. Sus transiciones de
   estado son optimistas y versionadas; una tarifa nueva se modela como otra
   lista, no reescribiendo evidencia histórica.
6. Ediciones y devoluciones usan el precio unitario congelado del pedido. No se
   reevalúa una lista histórica.

## Consecuencias

- Una lista puede subir o bajar el precio respecto al catálogo; no se informa
  como descuento de campaña ni consume el tope de `PRC-008`.
- Un carrito puede usar varias listas por fallback por producto y persiste una
  aplicación por lista.
- Guest checkout solo usa listas generales hasta que un módulo posterior aporte
  identidad empresarial confiable.
- Ubicación/contrato quedan como extensiones explícitas posteriores; R4.6 no
  adelanta R5/R6.

## Rollback

Desactivar rutas y efectos de `PRC-009`. Quote vuelve al catálogo como base sin
contraer `0030` ni borrar aplicaciones históricas. Los pedidos existentes
mantienen sus snapshots y precios congelados.
