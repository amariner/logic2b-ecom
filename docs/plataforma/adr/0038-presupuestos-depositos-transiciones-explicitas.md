# ADR-0038 — Presupuestos, depósitos y conversión mediante transiciones explícitas

- Estado: aceptado; R4.11 implementado localmente
- Fecha: 2026-08-17
- Bloque: R4.11
- Capacidades: `ORD-008`, `CHK-011`

## Contexto

Un presupuesto no es todavía un pedido. Puede caducar sin aprobarse, aceptarse
sin cobrar, requerir un depósito o el pago completo y convertirse en pedido en
un hito comercial elegido por cada proyecto. Confundir esos hechos reservaría
stock, generaría fulfillment o registraría ingresos antes de que exista la
transición que los justifica.

El importe del depósito, la vigencia, la condición de conversión y el proveedor
del enlace de pago son decisiones comerciales o de integración. R4.11 debe
representarlas y verificarlas sin inventar porcentajes, plazos ni proveedor. La
tarjeta permanece en una sesión alojada y Logic2B solo recibe hechos verificados.

## Decisión

1. `ORD-008` pertenece a `orders` y posee el presupuesto preliminar, sus líneas
   congeladas, estados, versión y conversión. `CHK-011` pertenece a `checkout` y
   orquesta enlaces de pago alojados contra el saldo que publica `orders`.
2. Ambas capacidades quedan `installed` en el preset avanzado. Sus rutas están
   registradas pero permanecen inaccesibles, sin navegación, jobs ni efectos,
   hasta que el proyecto aporte términos y un adaptador real.
3. El agregado separa tres ejes que no deben colapsarse:
   - estado comercial: `draft`, `issued`, `approved`, `converted`, `expired` o
     `cancelled`;
   - estado de pago: `unpaid`, `deposit_paid` o `paid`;
   - puerta de conversión congelada: `approval`, `deposit` o `full_payment`.
4. El total y el depósito son céntimos enteros explícitos. El dominio no recibe
   ni calcula porcentajes. Un depósito parcial produce exactamente dos etapas:
   `deposit` y `balance`; sin depósito parcial se solicita `full`.
5. Emitir, aprobar, caducar, confirmar un pago y convertir incrementan versión.
   Aprobar después de la caducidad o cobrar antes de aprobar se rechaza. Un
   presupuesto con dinero conciliable no se cancela como si nunca se hubiese
   cobrado: exige reembolso o resolución explícita.
6. La conversión nunca se deriva automáticamente de aprobación o pago. Un caso
   de uso separado verifica la puerta congelada y materializa el pedido en una
   unidad transaccional posterior. Hasta ese momento no hay pedido, reserva,
   consumo de stock, fulfillment ni email de pedido.
7. La conversión revalidará vendibilidad y disponibilidad actuales, pero
   conservará el snapshot comercial aprobado. Si un depósito ya cobrado no
   puede convertirse, el caso quedará en revisión y deberá ofrecer reembolso o
   resolución operativa; nunca generará stock negativo ni un pedido incompleto.
8. `HostedPaymentLinkAdapter` es el puerto de `checkout`. Recibe etapa, importe,
   moneda, versión, caducidad e idempotencia decididos en servidor. Devuelve una
   URL efímera y un identificador opaco. La URL no forma parte del plan
   persistible y no se guarda en D1.
9. El adaptador autentica cada hecho antes de construir
   `VerifiedHostedPaymentEvent`. La composición persiste referencia/hash e
   idempotencia y solo entonces entrega a `orders` un pago confirmado sin tipos
   de proveedor. Replay y carrera deben converger en una sola aplicación.
10. La caducidad del presupuesto y la del enlace son valores separados y
    aportados por el proyecto. R4.11 no define su duración ni renueva enlaces de
    forma automática.
11. El presupuesto puede conservar contacto y dirección como snapshots mínimos
    para convertir una compra invitada, pero no crea perfiles R5, crédito B2B,
    condiciones netas, impuestos nuevos ni documentos fiscales.
12. La demo pública permanece de solo lectura. No se añade adaptador simulado
    público ni webhook que acepte hechos sin firma.

## Persistencia implementada

La migración expand-only `0035_preliminary_orders_deposits.sql` añade,
sin backfill ni modificación de pedidos existentes:

- `preliminary_orders`: estado, versión, moneda, totales, depósito, saldo
  pagado, puerta de conversión, vigencia y snapshots mínimos;
- `preliminary_order_lines`: variante y desglose comercial congelados, sin
  reservar inventario;
- `preliminary_order_events`: historial idempotente de emisión, aprobación,
  caducidad, pago, cancelación y conversión;
- `preliminary_order_payment_links`: etapa, importe, referencia opaca,
  idempotencia, caducidad y estado, nunca URL ni payload remoto;
- `preliminary_order_payments`: ledger append-only de depósito/saldo con hecho
  verificado, moneda, importe e identidad de proveedor opaca;
- vínculo único de conversión al pedido materializado.

Checks y triggers deben imponer, como mínimo:

```text
0 <= deposit_cents <= total_cents
paid_cents in (0, deposit_cents, total_cents)
balance_cents = total_cents - paid_cents
deposit_paid exige 0 < deposit_cents < total_cents
converted exige approved y la puerta congelada satisfecha
una referencia/idempotencia de pago solo se aplica una vez
una conversión solo materializa un pedido
```

La autorización explícita se recibió el 2026-08-17. Repositorio D1, composition
root, APIs administrativas, rehearsal y backup esquema 29 quedan implementados
y probados. La migración se aplicó solo a D1 local; no hubo rollout remoto.

## Fronteras

- No se fija porcentaje, vigencia, condición de conversión, copy contractual ni
  proveedor.
- No se almacena PAN, CVC, método de pago, payload remoto ni URL alojada.
- No se emite factura fiscal ni se adelantan impuestos, crédito o empresas B2B.
- No se reserva ni consume inventario antes de convertir explícitamente.
- No se despliega ni se toca D1 remota dentro del gate de diseño.

## Verificación

- Reducer puro de emisión, aprobación, caducidad, cancelación y versión.
- Aritmética exacta depósito/saldo y rechazo de floats o pagos manipulados.
- Tres puertas de conversión sin efectos implícitos.
- Plan de enlace alojado con caducidad explícita y URL fuera del contrato
  persistible.
- Conversión transaccional a pedido con reserva, captura previa trasladada al
  ledger y consumo de stock al completar el saldo.
- Replay y carrera de conversión sin duplicar pedido, reserva, asiento o venta.
- Adaptador `simulated-hosted-payment` interno, determinista, sin red, claves o
  dinero; rechaza webhooks públicos.
- APIs administrativas auditadas y protegidas por capacidad; demo read-only.
- Backup/restore esquema 29, rehearsal `0035`, FKs e integridad en verde.

## Rollback

Desactivar `routes` y `sideEffects` de `ORD-008`/`CHK-011` detiene nuevas
operaciones. No se revierten ni borran `preliminary_order_*`: presupuestos,
pagos y vínculos se conservan para conciliación y los Workers anteriores los
ignoran. Un restore exige backup esquema 29 sobre una base con `0035` aplicada.
