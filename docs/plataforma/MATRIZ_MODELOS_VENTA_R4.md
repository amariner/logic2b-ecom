# Matriz de modelos de venta R4

Esta matriz consolida R4.1–R4.11. La fuente ejecutable es
[`r4-model-matrix.ts`](../../src/shared-kernel/r4-model-matrix.ts): enumera 11
modelos, 14 capacidades, sus tablas de evidencia y las 66 parejas posibles sin
fallback implícito.

## Modelos y evidencia

| Bloque | Modelo | Capacidad | Estado | Autoridad monetaria | Evidencia durable |
|---|---|---|---|---|---|
| R4.1 | Regla de precio | `PRC-003` | actual | servidor | snapshot de `order_items` |
| R4.2 | Código promocional | `PRC-004` | actual | servidor | `promotion_code_usages` |
| R4.3 | Descuento automático | `PRC-005` | actual | servidor | `automatic_discount_applications` |
| R4.4 | Cantidad / X-Y | `PRC-006/007` | actual | servidor | `quantity_offer_applications` |
| R4.5 | Combinabilidad | `PRC-008` | actual | servidor | `discount_combination_applications` |
| R4.6 | Lista de precios | `PRC-009` | actual | servidor | `price_list_applications` |
| R4.7 | Bundle | `PRC-012` | actual | servidor | aplicación y componentes congelados |
| R4.8 | Valor almacenado | `PRC-010/011` | actual | servidor | aplicación y ledger |
| R4.9 | Preventa/backorder | `PRC-014` | actual | servidor | compromiso y eventos |
| R4.10 | Suscripción | `PRC-013` | instalado | hecho de proveedor verificado | eventos y ciclos |
| R4.11 | Presupuesto/depósito | `ORD-008/CHK-011` | instalado | hecho de proveedor verificado | eventos y pagos |

## Relaciones exhaustivas

La función `r4ModelInteraction(left, right)` es simétrica y devuelve siempre
una de estas reglas:

- `foundation_only`: R4.1 es la primitiva de cálculo; no se persiste como una
  segunda campaña junto a las fuentes R4.2–R4.4.
- `price_origin_before_effects`: la lista resuelve el precio base antes de
  promociones, bundle, disponibilidad o medio de pago.
- `combination_policy_required`: código, automático y cantidad son exclusivos
  entre sí salvo política R4.5 activa y explícita.
- `combination_policy_governs`: R4.5 decide fuentes/clases y tope; no añade un
  descuento oculto propio.
- `compatible_snapshots`: ambos modelos pueden coexistir conservando evidencia
  independiente.
- `tender_after_total`: valor almacenado se autoriza después de fijar el total
  y se devuelve primero al mismo medio.
- `incompatible_same_line`: una carcasa bundle no puede ser a la vez una línea
  diferida de preventa.
- `separate_lifecycle`: suscripción y presupuesto no se mezclan implícitamente
  con el checkout ordinario; crean su propia proyección/transición.

La diagonal es `same_model`. El test de consolidación recorre las 66 parejas,
comprueba simetría, capacidad/estado y que cada evidencia forme parte del backup
esquema 29.

## Propiedades monetarias

El corpus determinista R4.12 cubre:

- precio simple: `subtotal + descuento = base`;
- precio combinado: el descuento no supera el tope en basis points;
- X/Y: el prorrateo entero cubre el premio sin exceder el subtotal;
- reembolso: valor almacenado + medio externo = importe reembolsado;
- presupuesto: depósito + saldo = total y cada hecho incrementa versión;
- todos los importes son enteros seguros, nunca floats del navegador.

Los tests usan 12.000 combinaciones de precio, 500 recorridos X/Y/reembolso y
1.000 recorridos de depósito/saldo. Son reproducibles y no dependen de red,
reloj, proveedor o aleatoriedad externa.
