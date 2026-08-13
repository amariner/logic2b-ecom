# Operación de incidencias y bloqueos de pedidos R3.4

## Contrato servido

`ORD-010` mantiene el estado operativo separado de `orders.status`. Un pedido
puede tener varias incidencias simultáneas y no puede crear un nuevo envío hasta
que todas estén resueltas.

| Ruta | Operación |
|---|---|
| `POST /api/admin/order-holds` | abre un hold manual idempotente |
| `PATCH /api/admin/order-holds/:id` | reasigna o resuelve con `expected_version` |
| `/demo/admin?incidencia=active` | filtra pedidos con holds activos |
| `/demo/admin?incidencia=breached` | filtra pedidos con SLA vencido |

Los productores automáticos usan el mismo puerto de composición con
`source=automatic`. Motivo, responsable y `due_at` quedan en la proyección; las
notas libres siguen en `ORD-004`. Los sobres y la auditoría no copian nombres,
email, teléfono, dirección ni el responsable. En `DEMO_MODE` las mutaciones
responden `403` antes de leer el cuerpo y el panel solo muestra fixtures.

## Preflight y rehearsal de `0017`

Obtener un backup administrativo fresco de la base todavía en `0016` y ejecutar
el ensayo aislado:

```bash
pnpm db:rehearse:order-holds -- \
  --baseline <backup-0016.sql> \
  --output-dir .wrangler/rehearsals
```

El ensayo restaura la base, comprueba integridad y FKs, aplica
`0017_order_holds.sql`, exige cero filas nuevas, compara un hash de las tablas
legacy y repite las comprobaciones tras dump/restore.

Preflight remoto sin PII:

```sql
SELECT count(*) FROM pragma_foreign_key_check;
SELECT count(*) FROM pragma_integrity_check WHERE integrity_check <> 'ok';
SELECT count(*) FROM orders;
SELECT count(*) FROM order_amendments;
```

Después de la migración:

```sql
SELECT count(*) FROM order_holds;
SELECT count(*) FROM order_hold_events;
SELECT count(*) FROM pragma_foreign_key_check;
```

Las dos primeras consultas deben devolver cero antes de cargar fixtures o abrir
incidencias reales.

## Rollout coordinado

1. Conservar backup y artefactos del rehearsal fuera del repositorio.
2. Aplicar `0017` a D1 antes de desplegar el Worker.
3. Verificar migración listada, integridad, FKs y cero holds creados por DDL.
4. Desplegar el Worker y ejecutar E2E/a11y del índice y del detalle.
5. En la demo, cargar fixtures por el canal administrativo y confirmar `403` en
   alta, reasignación y resolución.

El preset avanzado activa ruta y efectos; la demo activa la lectura pero sus
guardas globales mantienen los efectos deshabilitados.

## Operación y recuperación

- `active`: no preparar un nuevo envío. Revisar motivo, responsable y SLA.
- `breached`: reasignar o escalar; vencer el SLA nunca libera el pedido.
- `conflict`: recargar. Otra asignación o resolución ganó la versión.
- `resolved`: conservar histórico; no reabrir la fila, crear otra incidencia si
  aparece un hecho nuevo.
- varias activas: resolver una no habilita preparación mientras quede otra.

La carrera alta-vs-envío se resuelve dentro de la batch D1: solo puede
materializarse el evento cuyo guard observa el estado compatible. La entrega de
un paquete ya enviado no se bloquea, porque el hold evita nueva preparación y
no borra el histórico logístico.

## Backup y rollback

El backup administrativo es esquema 11 e incluye `order_holds` antes de
`order_hold_events`. Tras restaurar:

```sql
PRAGMA foreign_key_check;
SELECT count(*) FROM order_holds;
SELECT count(*) FROM order_hold_events;
SELECT count(*) FROM order_hold_events e
WHERE NOT EXISTS (
  SELECT 1 FROM order_holds h
  WHERE h.id=e.hold_id AND h.order_id=e.order_id
);
```

El rollback operativo desactiva `ORD-010` y redespliega el Worker anterior. La
migración es expand-only: no borrar tablas ni filas. Resolver holds activos
antes de volver a un Worker que no aplica el guard; cualquier contracción exige
otra migración, copia previa y autorización destructiva expresa.
