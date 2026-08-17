# Preventa y backorder explícitos

Logic2B Ecommerce separa una venta diferida del inventario físico. `preorder`
difiere toda la línea; `backorder` sirve primero lo existente y difiere solo el
exceso. En ambos casos checkout muestra el mensaje y la ventana configurados por
la tienda antes del cobro.

El pedido conserva tres magnitudes operativas: unidades inmediatas, diferidas y
asignadas. Solo las inmediatas se reservan al crear el pedido. Las diferidas
ocupan un cupo versionado y, después del pago, esperan stock real en una cola
FIFO. La asignación consume los ledgers global y de ubicación y habilita el
fulfillment de esas unidades.

La confirmación de pago identifica la parte diferida y recalca que la ventana
es de disponibilidad, no de envío. Cuando todo el diferido de una línea queda
asignado se genera otro aviso. Cancelaciones y reembolsos cancelan primero cupo
pendiente; solo reponen unidades inmediatas o ya asignadas.

Límites actuales:

- solo `charge_now` mediante el checkout alojado;
- política sobre la variante principal que representa hoy la línea del storefront;
- asignación manual e idempotente desde stock de la ubicación principal;
- sin compra automática a proveedor ni promesa de transporte;
- sin edición de cantidad/promesa una vez creado el compromiso;
- fechas, cupos y mensajes son decisiones del comercio de cada despliegue.

Contrato técnico: `PRC-014`, ADR-0036, migración `0033` y backup esquema 27.
