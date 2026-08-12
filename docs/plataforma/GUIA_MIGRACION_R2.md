# Guía de migración y downgrade del núcleo R2

Esta guía consolida R2.2–R2.14 para despliegues aislados de Logic2B Ecommerce.
El estado objetivo es D1 con migraciones `0001`–`0013`, backup esquema 7 y un
Worker compatible con variantes, inventario, reservas, pagos, fulfillment y
cancelación/reembolso parcial.

No contiene una migración `0014`: R2.14 verifica el conjunto y documenta su
operación. Los espejos legacy siguen vivos para permitir downgrade. Retirarlos
sería una contracción destructiva y necesita ADR, migración y autorización
expresa independientes después de observar una versión estable completa.

## Mapa de cambios

| Migración | Bloque | Expansión canónica | Espejo conservado |
|---|---|---|---|
| `0007_product_variants` | R2.2 | variantes, opciones y snapshots de línea | precio/stock/imagen del producto |
| `0008_product_media_attributes` | R2.5 | media y atributos tipados | imagen/specs del producto |
| `0009_inventory_ledger` | R2.7 | balances y movimientos por variante | `products.stock` para variante default |
| `0010_inventory_reservations` | R2.8 | holds versionados y expiración | ninguno nuevo |
| `0011_payment_ledger` | R2.9–R2.10 | pagos, asientos y refunds | referencias Stripe del pedido |
| `0012_fulfillment_lines` | R2.11–R2.12 | grupos, líneas y tracking canónico | estado/tracking del pedido |
| `0013_partial_refund_guards` | R2.13 | tipo de operación y reserva de cantidades | flujo total R2.10 compatible por default |

Todas son aditivas. Deben aplicarse en orden; nunca se salta una porque el
Worker más reciente espere solo la última.

## Preflight obligatorio

1. Congelar mutaciones administrativas del despliegue objetivo.
2. Confirmar `pnpm check` en el commit exacto que se va a servir.
3. Exportar D1 sin imprimir filas ni PII:

   ```bash
   wrangler d1 export <database> --remote --output /ruta/aislada/baseline.sql -y
   ```

4. Guardar el hash y tamaño del export en la evidencia privada de operación.
5. Ejecutar los rehearsals correspondientes al punto de partida, siempre sobre
   una carpeta temporal aislada:

   ```bash
   pnpm db:rehearse:inventory -- --baseline /ruta/aislada/baseline.sql --output-dir /ruta/aislada
   pnpm db:rehearse:reservations -- --baseline /ruta/aislada/baseline.sql --output-dir /ruta/aislada
   pnpm db:rehearse:payments -- --baseline /ruta/aislada/baseline.sql --output-dir /ruta/aislada
   pnpm db:rehearse:fulfillment -- --baseline /ruta/aislada/baseline.sql --output-dir /ruta/aislada
   pnpm db:rehearse:partial-refunds -- --baseline /ruta/aislada/baseline.sql --output-dir /ruta/aislada
   ```

Cada script indica su baseline admitida. Si el origen ya contiene una migración,
se empieza en el rehearsal siguiente; no se vuelve a aplicar DDL sobre la copia.
Un hash divergente, una FK rota o una cantidad saturada detienen el corte.

## Corte expand-first

1. Listar pendientes con `wrangler d1 migrations list <database> --remote`.
2. Aplicar solo las migraciones revisadas:

   ```bash
   wrangler d1 migrations apply <database> --remote
   ```

3. Ejecutar `PRAGMA foreign_key_check` y las reconciliaciones del rehearsal.
4. Desplegar el Worker compatible inmediatamente después del esquema.
5. Ejecutar el E2E, la auditoría del panel y un smoke de backup.
6. Reabrir mutaciones solo con D1, Worker y evidencia coherentes.

La demo pública permanece `DEMO_MODE=true`; su E2E debe comprobar 403 antes de
validar JSON o tocar D1. En una tienda real se usa un pedido de prueba y un PSP
de test. No se provoca un cargo real como smoke.

## Configuración que forma parte del corte

- `CATALOG_READ_MODE`: `shadow` durante observación, `variant` tras reconciliar;
  `legacy` es el fallback de lectura mientras existan espejos.
- `INV-004`: reservas apagadas salvo que el despliegue las necesite y haya
  validado TTL/job.
- `shop.config.ts#refunds.partialShippingPolicy`: `merchandise-only` por
  defecto o `full-on-final-cancellation` por decisión del propietario.
- capacidades `FUL-004` y `ORD-007`: rutas y efectos deben cambiar juntos en
  perfiles cliente; la demo conserva efectos apagados.

La política de envío se decide por despliegue, no por operación. Cambiarla no
reescribe refunds históricos: cada intención ya congela subtotal y envío.

## Verificación consolidada R2.14

```bash
pnpm exec vitest run tests/r2-consolidation-runtime.test.ts
pnpm check
pnpm db:reset
BASE_URL=http://127.0.0.1:8787 pnpm test:e2e
BASE_URL=http://127.0.0.1:8787 node scripts/a11y-audit.mjs --only=admin:pedido-pagado
```

El journey crea un producto con dos variantes y verifica la variante default
vendida, reserva/consumo, captura, dos fulfillments, cancelación parcial de lo
pendiente, entrega global, stock, pago, eventos, auditoría, emails y
backup/restore. La carga repite 16 carreras refund/fulfillment simultáneas: en
cada una existe un solo ganador, una unidad comprometida y cero errores FK.

## Downgrade sin pérdida

El downgrade normal es de binario, no de esquema:

1. congelar mutaciones;
2. exportar D1 ya expandida;
3. comprobar que los espejos relevantes están reconciliados;
4. volver al Worker anterior compatible con las columnas aditivas;
5. ejecutar su smoke de lectura y mantener las tablas R2 intactas.

| Vuelta de binario | Condición adicional |
|---|---|
| R2.13 → R2.12 | no iniciar parciales nuevos; `operation_type` queda con default compatible |
| R2.12 → R2.10 | un solo tracking representable por pedido y espejos `orders.*` reconciliados |
| R2.10 → R2.8 | referencias/estado de pago legacy reconciliados; no borrar asientos |
| lector `variant` → `shadow|legacy` | precio, stock e imagen default idénticos a su espejo |

Una operación R2 ya confirmada no se deshace editando tablas. Se conserva como
hecho canónico y se usa un flujo compensatorio. Las intenciones de refund
`pending|processing|failed|requires_review` no se borran: siguen reservando
cantidades hasta reconciliación o transición explícita a `cancelled`.

## Restauración

El backup administrativo esquema 7 requiere D1 con `0013` aplicada. Primero se
crea una base vacía, se aplican migraciones, y solo entonces se ejecuta el SQL:

```bash
wrangler d1 migrations apply <database-restaurada> --remote
wrangler d1 execute <database-restaurada> --remote --file backup.sql
```

Después se comprueban FKs, recuentos por tabla, saldos de inventario/pago,
cantidades `ordered = fulfilled + cancelled + pending` y hashes de los espejos.
`audit_log` y `contact_requests` no forman parte del backup administrativo por
seguridad; se restauran únicamente desde la copia operativa autorizada.

## Puerta futura de contracción

No eliminar `products.price_cents|stock|image`, referencias Stripe ni
`orders.tracking_*` durante R2.14. Una futura contracción exige, como mínimo:

- una versión completa estable observada sin divergencias de shadow-read;
- inventario de todo reader/writer y procedimiento de downgrade alternativo;
- export/restore ensayado sin las columnas;
- migración propuesta, aprobación expresa y ventana coordinada;
- evidencia de que ningún Worker anterior sigue sirviendo tráfico.

Hasta superar esa puerta, el coste pequeño de los espejos compra un rollback
seguro y es preferible a una eliminación irreversible.
