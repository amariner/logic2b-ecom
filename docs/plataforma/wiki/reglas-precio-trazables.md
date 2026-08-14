# Reglas de precio trazables

> Borrador interno R4.1. No tiene ruta pública ni entra en el sitemap. La
> publicación requiere R8.4 y revisión editorial.

## Qué resuelve hoy

Logic2B puede evaluar una lista de candidatas de descuento con el mismo contrato
en carrito y checkout. Cada candidata declara versión, prioridad, vigencia,
moneda, mercados, canales y una reducción porcentual o fija. El servidor decide
un único ganador y devuelve también por qué descartó las demás.

El pedido conserva el precio base, el efectivo y el desglose completo por
línea. Por eso una compra se puede explicar aunque más adelante cambie o deje de
existir la configuración que originó el precio.

## Cómo toma la decisión

Primero excluye moneda, mercado, canal y ventana temporal incompatibles. Entre
las restantes gana la prioridad numérica menor; ante empate, el ID estable. El
descuento se calcula en céntimos enteros, se redondea hacia abajo y nunca supera
el precio base.

R4.1 aplica como máximo una regla. Esta restricción deliberada evita combinar
descuentos por accidente antes de que exista la matriz explícita de `PRC-008`.

## Fuentes y límites actuales

- códigos `PRC-004` y automáticos `PRC-005` ya son fuentes persistidas; ninguna
  tiene todavía editor visual;
- R4.3 fija precedencia global del código y una única campaña automática, sin apilado;
- no hay tramos por cantidad, X/Y, listas de precios ni bundles;
- no hay apilado, exclusiones entre campañas ni descuento fijo de cesta que
  necesite reparto entre líneas;
- la demo pública no activa cobros ni promociones reales.

La capacidad actual es el motor determinista y su evidencia, no un sistema de
campañas completo. El runbook técnico es
[`OPERACION_REGLAS_PRECIO.md`](../OPERACION_REGLAS_PRECIO.md).
