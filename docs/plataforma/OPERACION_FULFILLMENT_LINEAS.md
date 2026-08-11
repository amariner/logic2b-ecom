# Operación del fulfillment por líneas R2.11

Este runbook coordina la migración aditiva `0012_fulfillment_lines.sql`, el
backfill del envío total legacy y el corte reversible del lector. No autoriza
por sí solo una migración remota ni un despliegue.

## Invariantes de corte

- la base de origen tiene `0011_payment_ledger` aplicado y cero errores FK;
- todo pedido `shipped|delivered` tiene líneas, tracking y su evento temporal;
- existe exactamente un grupo por pedido enviado durante R2.11;
- cada línea queda asignada por su cantidad completa y nunca se asocia a otro
  pedido;
- el replay conserva el mismo hash canónico;
- `orders.status` y `orders.tracking_*` siguen siendo el espejo de rollback.

## Ensayo aislado

```bash
wrangler d1 export ecom-demo --local --output /ruta/aislada/baseline.sql -y
pnpm db:rehearse:fulfillment -- \
  --baseline /ruta/aislada/baseline.sql \
  --output-dir /ruta/aislada
```

El script restaura el export en una SQLite nueva, ejecuta el preflight, aplica
`0012`, genera y ejecuta el backfill, repite el backfill, hace dump/restore y
compara los hashes legacy y canónico. Solo imprime recuentos y hashes, nunca
pedidos ni números de tracking.

## Aplicación coordinada

1. congelar mutaciones administrativas del proyecto objetivo;
2. exportar una copia fresca y completar el ensayo anterior;
3. aplicar `0012_fulfillment_lines.sql` en el entorno autorizado;
4. ejecutar el `backfill.sql` emitido por el rehearsal;
5. comprobar `PRAGMA foreign_key_check`, integridad, recuentos y proyección;
6. desplegar el binario de doble escritura;
7. probar `paid → shipped → delivered`, replay y backup;
8. reabrir las mutaciones solo tras reconciliación a cero.

La demo pública conserva `DEMO_MODE=true`: sus APIs de mutación responden 403 y
el panel solo lee fixtures. R2.11 no crea un formulario adicional; “Marcar
enviado” asigna todas las cantidades pendientes a un único grupo.

## Rollback

Antes del despliegue del binario, `0012` puede permanecer sin lectores y no
altera filas legacy. Después del despliegue, volver al binario anterior es
seguro mientras el espejo `orders.*` continúe reconciliado. No se borran tablas
ni grupos. Si aparece una divergencia, se congelan mutaciones, se conserva la
evidencia canónica y se corrige mediante una apertura nueva; nunca se reescribe
el histórico ni se satura una cantidad.

La eliminación del espejo queda prohibida hasta R2.14.
