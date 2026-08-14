# Códigos promocionales seguros y trazables

> Borrador interno R4.2, sin ruta pública ni sitemap. La publicación requiere
> R8.4 y revisión editorial.

## Qué puede hacer

Un despliegue cliente puede crear un código porcentual o una cantidad fija por
unidad, limitarlo globalmente y por comprador, exigir un subtotal y dirigirlo a
productos, moneda, mercados, canales y una ventana temporal. El checkout vuelve
a leer todo en servidor; el navegador nunca decide el descuento.

El último cupo se reserva junto al pedido pendiente. Si el pago se confirma se
consume; si la sesión caduca se libera. Dos compras simultáneas no pueden gastar
el mismo último uso.

## Qué se conserva

D1 no guarda el código claro, solo un hash de lookup y una pista parcial. Cada
uso enlaza pedido, versión, descuento y un hash no reversible de la identidad
normalizada. Las líneas del pedido congelan precio base, efectivo y regla, por
lo que una devolución de una unidad devuelve su precio efectivo exacto.

## Límites expresos

- una cantidad fija se aplica por unidad elegible, no como descuento de cesta;
- no hay segmentos ni allowlists de clientes antes de R5;
- una compra pagada y después reembolsada sigue contando como uso;
- no se apila con descuentos automáticos: R4.3 y R4.5 deben resolver el conflicto;
- no existe editor visual todavía; la gestión actual es la API administrativa
  autenticada y versionada;
- la demo pública no acepta códigos ni crea pedidos reales.

La operación técnica está en
[`OPERACION_CODIGOS_PROMOCIONALES.md`](../OPERACION_CODIGOS_PROMOCIONALES.md).
