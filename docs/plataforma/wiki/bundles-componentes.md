# Bundles y componentes

Un bundle es una unidad comercial con precio propio y una composición de
inventario resuelta por servidor. Puede ser fijo o configurable por grupos. El
cliente solo selecciona slugs; productos, cantidades, precio y stock se vuelven
a leer desde D1.

## Recorrido

1. quote elige defaults o valida opciones y calcula el componente limitante;
2. checkout cobra el precio de la carcasa y congela selección/composición;
3. reserva y pago consumen las variantes default de los componentes;
4. fulfillment mueve unidades comerciales sin perder la relación de piezas;
5. cancelación y RMA expanden unidades a componentes y registran cada movimiento.

Las definiciones son inmutables y sus estados usan versión optimista. Desactivar
un bundle afecta cotizaciones nuevas, nunca pedidos existentes. Una línea bundle
no admite edición de cantidad o composición.

## Límites actuales

- precio de carcasa, no suma ni suplementos por opción;
- componentes sobre variante default;
- una opción/producto no puede repetirse entre grupos;
- un pedido no puede incluir dos composiciones distintas del mismo slug;
- fulfillment se expresa en unidades bundle; no hay picking UI por componente;
- sin editor visual ni publicación automática.

Operación: [`../OPERACION_BUNDLES.md`](../OPERACION_BUNDLES.md).
Decisión: [`../adr/0034-bundles-composicion-congelada.md`](../adr/0034-bundles-composicion-congelada.md).
