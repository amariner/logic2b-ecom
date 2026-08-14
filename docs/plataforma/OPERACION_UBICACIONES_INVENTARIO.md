# Operación de ubicaciones de inventario R3.6

## Rehearsal y rollout

```bash
pnpm db:rehearse:inventory-locations -- \
  --baseline /tmp/ecom-before-0019.sql \
  --output-dir /tmp/logic2b-r3-6-rehearsal
```

El ensayo exige baseline `0018`, hash idéntico del inventario global, una única
principal, espejo completo de balances/movimientos, FKs e integridad tras
dump/restore. En remoto: crear primero un bookmark Time Travel, aplicar `0019`,
comprobar que global y principal coinciden y solo entonces desplegar el Worker.

## Operación

- La principal recibe automáticamente todas las escrituras globales.
- Una secundaria nueva nace con cero variantes y cero unidades.
- No cambiar/desactivar la principal ni editar stock por SQL.
- Las transferencias quedan cerradas hasta R3.7; cualquier reparto manual rompe
  el contrato de compatibilidad.
- Conflicto `409` en edición significa versión obsoleta: recargar y revisar.

## Recuperación

Desactivar `INV-005` retira navegación, rutas y efectos. El ledger global sigue
siendo compatible con el Worker anterior y los triggers conservan el espejo.
Investigar cualquier divergencia y corregirla mediante una migración auditada;
no borrar tablas ni reescribir movimientos.
