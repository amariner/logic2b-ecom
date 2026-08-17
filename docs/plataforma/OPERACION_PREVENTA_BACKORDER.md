# Operación R4.9 — preventa y backorder

## Alcance

`PRC-014` permite cobrar ahora una línea cuya disponibilidad es total o
parcialmente diferida. El stock físico nunca baja de cero. Cada pedido congela
política, mensaje y ventana de disponibilidad; esa ventana no es una fecha de
envío.

R4.9 no activa `charge_on_allocation`, no guarda tarjetas y no inventa plazos.
La demo pública conserva todos los efectos deshabilitados.

## Rollout

1. Obtener backup y bookmark de Time Travel.
2. Ejecutar `pnpm db:rehearse:preorders -- --baseline <dump-0032.sql>
   --output-dir <directorio>` y conservar el hash/artefacto.
3. Aplicar `0033_preorders_backorders.sql`; comprobar
   `PRAGMA foreign_key_check` e integridad.
4. Desplegar el Worker compatible manteniendo `PRC-014` sin efectos.
5. Crear políticas inicialmente `paused`, revisar cupo, ventana, texto público
   y política `charge_now`; activar después de la validación comercial.

La migración es expand-only y no crea compromisos para pedidos anteriores. El
Worker anterior ignora las tablas nuevas.

## Reconciliación diaria

- Comparar `preorder_policies.committed_deferred_quantity` con la suma de
  diferido todavía pendiente/asignado no repuesto de sus compromisos.
- Revisar compromisos pagados en `awaiting_stock`, `partially_allocated` o
  `partially_cancelled`, siempre ordenados por `paid_at, created_at, id`.
- Toda asignación debe tener evento, movimiento global, movimiento de ubicación
  principal y fila en `preorder_allocations` con la misma cantidad.
- Un compromiso completo debe tener un email «Stock asignado» en la bandeja; un
  replay de la misma clave no crea otro.
- Antes de fulfillment, verificar que lo enviado no supera
  `immediate + allocated - restored`.

## Incidencias

- **Cupo agotado:** pausar la política; no ampliar sin decisión comercial.
- **Carrera de cupo o asignación:** recargar y reintentar con una clave nueva
  solo si la operación anterior no aparece persistida.
- **Stock insuficiente:** no editar balances. Registrar la entrada física y
  volver a invocar la asignación FIFO.
- **Promesa cambia:** no modificar snapshots. Pausar altas, auditar el motivo y
  comunicar a los pedidos afectados mediante un flujo específico posterior.
- **Reembolso sin reposición:** R4.9 lo rechaza en pedidos con compromiso para
  evitar una proyección ambigua; resolver con reposición o revisión manual.

## Rollback

Pausar todas las políticas y retirar `PRC-014` de efectos/rutas. Los compromisos
pagados siguen operándose con el último Worker compatible hasta asignarse o
cancelarse. No borrar ni contraer las cuatro tablas sin otra autorización.
