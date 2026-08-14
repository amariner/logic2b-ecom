# ADR-0030 — descuentos automáticos y precedencia de fuente

- Estado: **aceptado e implementado localmente**
- Fecha: 2026-08-14
- Bloque: R4.3

## Contexto

Un descuento automático debe aparecer sin que el comprador conozca un código,
pero no puede convertir quote y checkout en dos calculadoras distintas ni
apilarse accidentalmente con `PRC-004`. La prioridad de R4.1 ordena reglas de
una misma fuente; no expresa por sí sola qué hacer cuando hay código y campaña.

## Decisión

`automatic_discounts` conserva configuración inmutable, estado/version,
vigencia, contexto, mínimo, scope y un motivo público separado del nombre
interno. R4.3 permite porcentaje o cantidad fija por unidad elegible. Una única
campaña gana para todo el carrito por prioridad e ID; las líneas fuera de su
scope mantienen precio base y otra campaña no rellena esos huecos.

La matriz de fuentes es fija y pura:

| Código elegible | Automático elegible | Fuente del pedido |
|---|---|---|
| sí | sí | código; automático suprimido con motivo visible |
| sí | no | código |
| no | sí | automático |
| no | no | precio base |

Un código rechazado no oculta una campaña elegible en la cotización, pero el
checkout continúa rechazando esa solicitud: nunca ignora silenciosamente un
código que el comprador intentó usar. `automatic_discount_applications`
congela una única fuente, versión, importe y snapshot después de insertar las
líneas. El trigger contrasta regla, motivo, efecto, contexto, mínimo, scope y
desglose, e impide que el mismo pedido tenga uso de código.

## Invariantes

1. el cliente nunca aporta descuento automático, precio, regla ni prioridad;
2. quote y checkout leen campañas activas de D1 y usan el mismo instante/contexto;
3. una campaña global gana; no hay apilado ni relleno por otra campaña;
4. un código elegible tiene precedencia sobre cualquier automático del pedido;
5. el motivo público del snapshot coincide con la configuración versionada;
6. pedido y reembolso usan el precio efectivo congelado por línea;
7. configuración y estado cambian mediante API auditada y versión esperada;
8. la demo no siembra campañas ni ejecuta compras reales;
9. cantidad, X/Y y combinabilidad general siguen en R4.4–R4.5.

## Rollback

Desactivar rutas/efectos de `PRC-005` deja de consultar campañas nuevas. No se
eliminan `0027`, aplicaciones ni snapshots históricos. Los pedidos ya creados
siguen explicándose y reembolsándose sin recalcular la regla actual.
