# ADR-0017 — Índice de pedidos con cursor estable y FTS

- Estado: **aceptado**
- Fecha: 2026-08-12
- Mandato: R3.1

## Contexto

El listado administrativo usaba `LIMIT/OFFSET`, estado y un `LIKE %texto%` en
tres columnas. El coste de `OFFSET` crece con la profundidad, una escritura
entre páginas puede duplicar u omitir filas y el comodín inicial impide usar un
índice B-tree para buscar. R3.1 exige URLs compartibles y una consulta que siga
siendo predecible con muchos pedidos.

## Decisión

1. La aplicación pagina mediante una clave compuesta `(valor_de_orden, id)`.
   `id` desempata siempre fecha o importe; no existe un orden parcial.
2. El cursor opaco y versionado contiene dirección, orden, clave, id y huella
   exacta de filtros. Un cursor malformado o reutilizado con otra consulta no
   causa error ni mezcla resultados: vuelve a la primera página y avisa.
3. Hay cuatro órdenes explícitos: fecha ascendente/descendente e importe
   ascendente/descendente. El servidor limita cada página a 100 filas; la UI
   usa 25.
4. Estado, texto, rango de fechas e importe mínimo/máximo son acumulables. El
   dinero entra como euros en el formulario, pero se convierte una vez a
   céntimos enteros antes del puerto de lectura.
5. `0014_order_list_indexes.sql` añade índices compuestos para estado/fecha y
   estado/importe, más `orders_search` FTS5. Tres triggers mantienen número,
   cliente y email sincronizados tras insert/update/delete. El texto se
   normaliza a términos Unicode, se escapa y se limita antes de `MATCH`.
6. El cursor no es autorización ni secreto. La protección del panel continúa
   en middleware; el lector usa bindings D1 para todos los valores.

## Compatibilidad y coste

La migración solo añade índices, tabla virtual derivada y triggers. No cambia
la forma de `orders`, no toca dinero/stock ni añade dependencia o servicio. El
CSV logístico y el detalle de pedido conservan sus contratos. FTS5 está
incluido en el conjunto SQL documentado por Cloudflare D1.

## Rollout y rollback

1. exportar D1 y restaurar la copia de ensayo;
2. comprobar recuento `orders`, duplicados de `order_number` y FKs;
3. aplicar `0014` y exigir `orders = orders_search`;
4. probar insert/update/delete y planes de fecha/importe;
5. aplicar `0014` en producción antes del Worker R3.1;
6. para volver al Worker anterior, conservar `0014`: sus objetos son aditivos
   y el listado OFFSET anterior ignora todos ellos.

Eliminar índices/FTS/triggers es una contracción destructiva separada y no
forma parte del rollback operativo.

## Criterio de terminado

- navegación adelante/atrás sin duplicados ni omisiones, incluidos empates;
- cursor ligado a filtros y orden, límite servidor y entrada hostil segura;
- búsqueda, estado, fechas e importes combinables en URL;
- `EXPLAIN QUERY PLAN` demuestra los índices compuestos;
- reset, backup/restore, E2E y a11y 1440/375 en verde.
