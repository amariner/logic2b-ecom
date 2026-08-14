# Descuentos automáticos trazables

> Borrador interno R4.3, sin ruta pública ni sitemap. La publicación requiere
> R8.4 y revisión editorial.

## Qué puede hacer

Un despliegue cliente puede activar una campaña porcentual o fija por unidad,
limitarla por subtotal y productos y dirigirla a moneda, mercados, canales y
ventana temporal. El servidor elige una única campaña para el carrito y muestra
el motivo público que también queda congelado en el pedido.

## Qué ocurre con un código

Un código elegible tiene precedencia global: no se mezcla con el automático y
la quote explica `promotion_code_precedence`. Si el código no es válido, el
automático elegible sigue visible, pero checkout rechaza el código solicitado
en vez de ignorarlo silenciosamente.

## Qué se conserva

Cada pedido con campaña guarda ID, versión, importe y snapshot de decisión. Las
líneas conservan precio base, efectivo, contexto, efecto y motivo. El trigger D1
verifica que sólo haya una fuente y que el descuento cuadre con esas líneas.

## Límites expresos

- una única campaña gana para todo el carrito;
- una segunda campaña no rellena productos fuera del scope de la ganadora;
- no hay tramos, X/Y, descuentos de cesta/envío ni apilado antes de R4.4–R4.5;
- no existe editor visual; la gestión actual es la API admin auditada;
- la demo pública no siembra campañas ni crea pedidos reales.

La operación técnica está en
[`OPERACION_DESCUENTOS_AUTOMATICOS.md`](../OPERACION_DESCUENTOS_AUTOMATICOS.md).
