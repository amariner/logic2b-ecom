# Listas de precios contextuales

Una lista de precios cambia la base comercial de un producto por contexto. No
es un cupón: primero se elige catálogo/lista y después se calculan promociones.

## Precedencia y fallback

Para cada producto:

1. listas asignadas a la empresa autenticada por servidor;
2. listas generales;
3. precio de catálogo.

Cada nivel ordena por prioridad e identificador. Que una lista prioritaria no
contenga un producto no bloquea el carrito: se prueba la siguiente. Mercado,
canal, divisa y vigencia siempre deben coincidir.

## Trazabilidad

Quote devuelve `price_origin` con precio de catálogo, precio base efectivo,
lista/versión y profundidad de fallback. El pedido agrega una aplicación por
lista usada. Los descuentos posteriores conservan su propia explicación y no
confunden la diferencia de lista con una campaña.

La razón social escrita durante checkout solo sirve para facturación. Mientras
no exista una identidad empresarial confiable, guest checkout solo puede usar
listas generales.

## Seguridad y ciclo de vida

Las listas se administran por API auditada, con estados/versiones optimistas y
capability `PRC-009`. La demo pública permite lectura cuando la ruta está activa
y bloquea mutaciones. Backup/restore actual usa esquema 25; edición y devolución no
reevalúan precios históricos.

Operación detallada: [`../OPERACION_LISTAS_PRECIOS.md`](../OPERACION_LISTAS_PRECIOS.md).
Decisión: [`../adr/0033-listas-precios-contextuales.md`](../adr/0033-listas-precios-contextuales.md).
