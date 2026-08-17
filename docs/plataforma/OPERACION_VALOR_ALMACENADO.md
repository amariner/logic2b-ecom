# Operación R4.8 — tarjeta regalo y crédito en tienda

## Frontera

El módulo está desactivable. La demo pública no emite ni consume saldos y sus
APIs de escritura responden `403`. En una tienda de cliente se habilita solo
tras documentar moneda, origen del valor, caducidad, transferibilidad, cash-out
y revisión legal. Los códigos claros nunca se guardan ni se vuelven a mostrar.

## Preflight y rehearsal

1. Exportar D1 sin mutar el origen.
2. Confirmar baseline `0031`, `PRAGMA integrity_check` y cero FKs.
3. Ejecutar:

   ```sh
   pnpm db:rehearse:stored-value -- --baseline <export.sql> --output-dir <dir>
   ```

4. Conservar hash de pedidos/pagos/refunds, tamaño del dump y directorio del
   restore. Las cinco tablas nuevas deben estar vacías y todos los pagos previos
   tener `stored_value_expected_cents = 0`.

## Rollout

1. Backup remoto fresco y rehearsal verde.
2. `wrangler d1 migrations apply ecom-demo --remote`.
3. Verificar `_cf_KV`, integridad/FKs, columna nueva, tablas, índices y triggers.
4. Desplegar Worker solo después de D1: el código antiguo tolera la expansión;
   el nuevo necesita `0032`.
5. Smoke: demo sigue inerte; ruta admin autenticada responde y no revela hashes.

## Reconciliación

- `balance_cents >= reserved_cents >= 0` por cuenta.
- Último asiento: saldo, reservado y versión coinciden con la proyección.
- Reserva activa por pedido como máximo una; captura implica aplicación única.
- Pago externo + valor almacenado = total del pedido.
- Reembolsos almacenados por aplicación nunca superan lo aplicado.
- Cero FKs y cero pagos mixtos sin reserva/aplicación correspondiente.

## Incidencias y rollback

La migración es expand-only: ante un fallo se desactivan `PRC-010/011`, se
revierte el Worker y se conservan tablas/asientos para diagnóstico. No borrar ni
editar ledger. Una reserva huérfana se libera mediante una operación idempotente
auditada; cualquier divergencia de saldo pasa a revisión manual antes de volver
a habilitar efectos.
