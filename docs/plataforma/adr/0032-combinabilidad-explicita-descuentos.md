# ADR-0032 — combinabilidad explícita de descuentos

- Estado: **aceptado e implementado localmente**
- Fecha: 2026-08-14
- Bloque: R4.5

## Contexto

Código, automático y cantidad/X-Y ya eran fuentes trazables, pero su única
política segura era la exclusividad. Apilarlas con condicionales en checkout
habría permitido cobrar un total distinto del pedido, consumir límites sobre
un importe agregado o aplicar dos veces una campaña al introducir una fuente
nueva. También hacía falta expresar producto, pedido y envío sin fingir que hoy
existe un descuento concreto sobre portes.

## Decisión

`discount_combination_policies` es un contrato versionado y opcional. Declara:

1. contexto, vigencia, moneda y prioridad de la propia política;
2. pares de fuentes permitidos entre código, automático y cantidad/X-Y;
3. pares de clases permitidos entre producto, pedido y envío;
4. tope agregado en puntos básicos sobre el precio base.

Sin política activa, el comportamiento R4.4 permanece intacto: código elegible
primero y, en su ausencia, una sola campaña por prioridad e ID. Con política,
el código solicitado y elegible se selecciona primero; cada fuente posterior
debe estar permitida por ambas matrices contra todas las ya seleccionadas.

Los efectos se calculan sobre el mismo precio base, nunca de forma compuesta.
El tope se reserva por prioridad y el snapshot `schema: 2` conserva efecto
bruto, importe aplicado y truncamiento por regla. `applied_rule` sigue señalando
la primera regla para lectores anteriores; `applied_rules` es la evidencia
completa.

Una combinación se persiste una sola vez en
`discount_combination_applications`. Ese registro es canónico para automáticos
y cantidad/X-Y combinados; no se duplican en sus tablas de aplicación
exclusiva. Si participa un código, su uso se reserva además por su importe
propio para conservar límites globales y por cliente. La guarda D1 contrasta
política, pares, clases, versiones, contexto, reglas de línea, suma y tope.

La clase `shipping` queda modelada en la matriz, pero R4.5 no introduce una
fuente que descuente portes. Una política puede anticipar el par; no produce
efecto hasta que exista una fuente real en un bloque posterior.

## Invariantes

1. ninguna fuente se combina sin una política activa y explícita;
2. todos los pares de un conjunto de tres deben estar permitidos;
3. fuente y clase se validan por separado y cada exclusión se explica;
4. los descuentos se suman sobre precio base y nunca exceden el tope;
5. el precio unitario efectivo y todos los importes permanecen enteros;
6. quote, cobro, pedido y aplicación comparten el mismo snapshot;
7. un código consume solo su porción, no el descuento agregado;
8. automático y cantidad combinados tienen una única aplicación canónica;
9. edición y devolución usan el precio unitario congelado, sin reoptimizar;
10. apagar `PRC-008` restaura exclusividad y no altera pedidos históricos.

## Consecuencias

Los informes de aplicaciones deben unir las tablas exclusivas con
`discount_combination_applications`; sumar ambas produciría doble conteo. El
desglose puede mostrar una regla truncada o con cero céntimos si una regla
anterior agotó el tope, y esa decisión queda explicada. Listas de precios,
segmentos y descuentos reales de envío siguen fuera de R4.5.

## Rollback

Desactivar rutas y efectos de `PRC-008`. No contraer `0029` ni borrar políticas
o aplicaciones. Código, automático y cantidad vuelven a la precedencia
exclusiva; pedidos existentes conservan su `schema: 2` y precio congelado.
