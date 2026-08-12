# Operación del fulfillment por líneas R2.11–R2.12

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
el panel solo lee fixtures. En una composición avanzada R2.12 usa
`POST /api/admin/fulfillments` para crear un grupo parcial o total y
`PATCH /api/admin/fulfillments/:id` para confirmar su entrega.

## Operación parcial tras el corte

- una cantidad nunca puede superar el pendiente de su línea;
- repetir la misma clave devuelve el grupo existente y no reenvía el email;
- claves distintas compiten por el pendiente: solo la batch compatible gana;
- mientras quede alguna unidad, el pedido permanece `paid`;
- la última asignación proyecta `shipped`; la última entrega activa proyecta
  `delivered`;
- con varios grupos, el tracking se consulta en `fulfillments` y el espejo del
  pedido queda nulo;
- un reembolso total se rechaza antes de llamar al PSP si existe cualquier
  grupo activo. R2.13 permite cancelar y reembolsar únicamente cantidades aún
  pendientes; las cantidades enviadas requieren el futuro flujo RMA.

Para diagnosticar una incidencia, congelar las mutaciones del pedido y revisar
grupo, asignaciones, outbox, auditoría y timeline por `event_id`. No se corrigen
cantidades editando filas históricas: se conserva la evidencia y se aplica el
flujo compensatorio definido por la ola que corresponda.

## Rollback

Antes del despliegue del binario, `0012` puede permanecer sin lectores y no
altera filas legacy. Después del despliegue, volver al binario anterior es
seguro mientras el espejo `orders.*` continúe reconciliado. No se borran tablas
ni grupos. Si aparece una divergencia, se congelan mutaciones, se conserva la
evidencia canónica y se corrige mediante una apertura nueva; nunca se reescribe
el histórico ni se satura una cantidad.

R2.14 conserva el espejo para downgrade. Su eliminación sigue prohibida hasta
una puerta destructiva futura con ADR, migración y autorización propios.

## Corte productivo del 2026-08-11

El preflight sobre un export remoto de 469.172 bytes produjo 4 grupos y 7
asignaciones con replay/restore coherentes. Se aplicó `0012`, se ejecutó el
backfill y la lectura posterior confirmó los mismos recuentos y cero errores FK.
El Worker `6663a123-012f-4507-b120-384750876809` quedó servido en
`ecom.logic2b.com`; E2E remoto pasó 42/42 y las seis superficies de pedido
pasaron la auditoría a11y. `0013` se materializó y ensayó localmente el
2026-08-12; su corte remoto requiere el binario R2.13 compatible.
