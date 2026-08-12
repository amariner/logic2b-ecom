# Operación de notas, etiquetas y timeline R3.2

## Contrato servido

La capacidad `ORD-004` añade cuatro superficies administrativas protegidas:

| Ruta | Operación |
|---|---|
| `POST /api/admin/order-notes` | crea nota y revisión 1 |
| `PATCH /api/admin/order-notes/:id` | edita con `expected_version` |
| `POST /api/admin/order-tags` | crea etiqueta por slug normalizado |
| `POST /api/admin/order-tags/assignments` | asigna o retira idempotentemente |

`/demo/admin?etiqueta=<slug>` combina la etiqueta con todos los filtros R3.1 y
la incluye en la huella del cursor. En `DEMO_MODE` las rutas devuelven `403` y
el detalle solo presenta fixtures.

## Preflight y ensayo de `0015`

Antes de aplicar sobre la base objetivo:

```sql
SELECT count(*) AS orders_count FROM orders;
SELECT order_number, count(*) AS n
FROM orders GROUP BY order_number HAVING n > 1;
PRAGMA foreign_key_check;
```

Después de aplicar:

```sql
SELECT name FROM sqlite_master
WHERE type = 'table' AND name IN (
  'order_notes', 'order_note_revisions', 'order_tags',
  'order_tag_assignments', 'order_tag_events'
);
SELECT name FROM sqlite_master
WHERE type = 'index' AND name LIKE 'idx_order_%';
PRAGMA foreign_key_check;
```

El gate funcional crea una nota, ejecuta dos ediciones desde la misma versión y
exige un ganador; después asigna/retira una etiqueta dos veces y exige un único
cambio por acción. `audit_log` debe tener una evidencia por mutación aplicada y
ningún `diff_json` debe contener el cuerpo de la nota.

## Backup y restore

El backup administrativo es esquema 9 y requiere `0015`. Exporta
`order_tags` antes de pedidos/asignaciones, y `order_notes` antes de revisiones.
El restore borra en orden inverso y termina con:

```sql
PRAGMA foreign_key_check;
SELECT count(*) FROM order_notes;
SELECT count(*) FROM order_note_revisions;
SELECT count(*) FROM order_tag_assignments;
SELECT count(*) FROM order_tag_events;
```

Los recuentos deben coincidir con el origen y las FKs quedar vacías.

## Rollback compatible

Si el Worker nuevo falla, desplegar de nuevo R3.1 dejando `0015` instalado. Las
tablas son aditivas y ningún runtime anterior las consulta. No borrar tablas ni
filas durante un rollback operativo; una contracción futura necesita migración
separada, copia previa y autorización explícita.
