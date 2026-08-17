# Modelos de venta y dinero R4

R4 no es una colección de descuentos intercambiables. Es una tubería ordenada
con evidencia distinta en cada frontera:

```text
catálogo -> lista/base -> descuento(s) -> línea/composición -> disponibilidad
         -> total -> medio de pago -> pedido/compromiso/proyección separada
```

## Índice funcional

- [Reglas de precio trazables](reglas-precio-trazables.md)
- [Códigos promocionales seguros](codigos-promocionales-seguros.md)
- [Descuentos automáticos trazables](descuentos-automaticos-trazables.md)
- [Ofertas por cantidad y X/Y](ofertas-cantidad-x-y.md)
- [Combinación explícita](combinacion-descuentos-explicita.md)
- [Listas de precios contextuales](listas-precios-contextuales.md)
- [Bundles y componentes](bundles-componentes.md)
- [Tarjeta regalo y crédito de tienda](tarjetas-regalo-credito-tienda.md)
- [Preventa y backorder](preventa-backorder-explicita.md)
- [Suscripciones por adaptador](suscripciones-por-adaptador.md)
- [Presupuestos y depósitos](presupuestos-depositos.md)

## Reglas comunes

Precio, descuento, depósito, saldo y devolución se expresan en céntimos
enteros. El navegador nunca decide un importe final. Toda aplicación guarda
versión y snapshot o asiento; cambios posteriores de catálogo/configuración no
reescriben pedidos existentes.

Código, automático y cantidad no se combinan por coincidencia: sin política
R4.5 gana una única fuente. Lista de precios resuelve antes; valor almacenado se
aplica después del total; bundle transforma inventario; preventa transforma
disponibilidad. Suscripción y presupuesto conservan lifecycles separados y
solo aceptan hechos de pago autenticados por su adaptador.

Las capacidades `PRC-013`, `ORD-008` y `CHK-011` siguen instaladas pero apagadas:
no hay proveedor, plazos, porcentajes ni condiciones comerciales universales.
La demo pública tampoco expone sus rutas.

Contrato exhaustivo: [`../MATRIZ_MODELOS_VENTA_R4.md`](../MATRIZ_MODELOS_VENTA_R4.md).
