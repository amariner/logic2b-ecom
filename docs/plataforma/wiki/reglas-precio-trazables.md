# Reglas de precio trazables

> Borrador interno R4.1. No tiene ruta pública ni entra en el sitemap. La
> publicación requiere R8.4 y revisión editorial.

## Qué resuelve hoy

Logic2B puede evaluar una lista de candidatas de descuento con el mismo contrato
en carrito y checkout. Cada candidata declara versión, prioridad, vigencia,
moneda, mercados, canales y una reducción porcentual o fija. El servidor decide
un ganador exclusivo o, con `PRC-008`, un conjunto autorizado y devuelve
también por qué descartó las demás.

El pedido conserva el precio base, el efectivo y el desglose completo por
línea. Por eso una compra se puede explicar aunque más adelante cambie o deje de
existir la configuración que originó el precio.

## Cómo toma la decisión

Primero excluye moneda, mercado, canal y ventana temporal incompatibles. Entre
las restantes gana la prioridad numérica menor; ante empate, el ID estable. El
descuento se calcula en céntimos enteros, se redondea hacia abajo y nunca supera
el precio base.

Sin política PRC-008 se aplica como máximo una regla. Con política, cada par de
fuentes y clases debe estar autorizado y la suma sobre base respeta un tope.

## Fuentes y límites actuales

- códigos `PRC-004`, automáticos `PRC-005` y cantidad/X-Y `PRC-006/007` son
  fuentes persistidas; ninguna
  tiene todavía editor visual;
- sin política se conserva precedencia global del código y una única campaña;
- `PRC-008` aporta matrices, exclusiones, tope y explicación combinada;
- no hay listas de precios, segmentos, descuentos reales de envío ni bundles;
- la demo pública no activa cobros ni promociones reales.

La capacidad actual es el motor determinista y su evidencia, no un sistema de
campañas completo. El runbook técnico es
[`OPERACION_REGLAS_PRECIO.md`](../OPERACION_REGLAS_PRECIO.md).
