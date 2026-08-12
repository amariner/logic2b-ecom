# Operación del índice de pedidos R3.1

## Contrato servido

`/demo/admin` conserva un formulario GET. Sus parámetros compartibles son:

| Parámetro | Significado |
|---|---|
| `estado` | estado permitido de pedido |
| `q` | número, cliente o email; máximo 120 caracteres |
| `desde` / `hasta` | rango inclusivo de días en formato `YYYY-MM-DD` |
| `min` / `max` | importe total en euros; el servidor lo convierte a céntimos |
| `orden` | `created-desc`, `created-asc`, `total-desc` o `total-asc` |
| `cursor` | posición opaca ligada al resto de la consulta |

Cambiar un filtro genera una consulta nueva sin cursor. Un cursor inválido,
truncado o perteneciente a otros filtros se descarta y muestra la primera
página. La búsqueda es por prefijo de término: permite localizar números de
pedido, nombres y emails sin ejecutar sintaxis FTS aportada por el usuario.

## Preflight de `0014`

Sobre una copia restaurada de la base objetivo:

```sql
SELECT count(*) AS orders_count FROM orders;
SELECT order_number, count(*) AS n
FROM orders GROUP BY order_number HAVING n > 1;
PRAGMA foreign_key_check;
```

Después de aplicar la migración:

```sql
SELECT
  (SELECT count(*) FROM orders) AS orders_count,
  (SELECT count(*) FROM orders_search) AS search_count;

EXPLAIN QUERY PLAN
SELECT id FROM orders
WHERE status = 'paid'
ORDER BY created_at DESC, id DESC LIMIT 25;

EXPLAIN QUERY PLAN
SELECT id FROM orders
WHERE status = 'paid'
ORDER BY total_cents DESC, id DESC LIMIT 25;
```

Los dos recuentos deben coincidir, `foreign_key_check` debe quedar vacío y los
planes deben citar `idx_orders_status_created_id` e
`idx_orders_status_total_id` respectivamente.

## Backup, restore y rollback

El backup administrativo pasa a esquema 8 y requiere `0014`: no exporta
`orders_search` porque es una proyección derivada. Al restaurar `orders`, el
trigger de inserción reconstruye FTS; el gate exige de nuevo igualdad de
recuentos y cero FKs.

El rollback del Worker no revierte DDL. Se vuelve al binario anterior dejando
índices, tabla virtual y triggers instalados. Si un trigger bloquea escrituras,
se pausa el corte, se vuelve al Worker compatible anterior y se restaura la
copia previa; retirar objetos requiere otra autorización de migración.
