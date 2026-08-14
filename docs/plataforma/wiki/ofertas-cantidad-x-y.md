# Ofertas por cantidad y compra X/Y trazables

## Qué está disponible

- tramos por cantidad total o subtotal base dentro de un scope de productos;
- efecto porcentual o fijo por unidad y mayor umbral alcanzado;
- compra X/Y para el mismo grupo de productos o para grupos X e Y separados;
- múltiples aplicaciones, límite opcional y recompensa más barata con desempate estable;
- motivo visible, contexto, vigencia, moneda, prioridad, estado y versión;
- cotización y checkout servidor, aplicación única por pedido y backup/restore;
- devolución y edición proporcionales mediante precio unitario congelado.

## Cómo se explica X/Y

El motor identifica las unidades Y premiadas y calcula su beneficio teórico.
Después lo prorratea entre las líneas participantes con el menor porcentaje que
cumple la promesa al redondear a céntimos. Si no existe división exacta, el
residuo beneficia al comprador. Quote y pedido guardan aplicaciones, unidades
seleccionadas, beneficio teórico, porcentaje proporcional y descuento real.

## Límites actuales

- no se apilan código, automático y cantidad/X-Y;
- no existen topes agregados ni clases de combinabilidad hasta R4.5;
- una edición mantiene el precio histórico y no vuelve a evaluar la campaña;
- no hay editor visual, segmentación B2B ni mínimos/múltiplos de catálogo;
- la demo pública no activa compras ni mutaciones.

## Operación

La configuración se gestiona por `/api/admin/quantity-offers`, con versión
esperada, auditoría y modo demo de solo lectura. El procedimiento de rollout,
reconciliación y rollback está en
[`OPERACION_OFERTAS_CANTIDAD.md`](../OPERACION_OFERTAS_CANTIDAD.md).
