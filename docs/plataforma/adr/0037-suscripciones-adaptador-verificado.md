# ADR-0037 — Suscripciones detrás de un adaptador verificado

- Estado: aceptado; implementado localmente con autorización de Andreu
- Fecha: 2026-08-17
- Bloque: R4.10
- Capacidad: `PRC-013`

## Contexto

Una suscripción mezcla calendario comercial, órdenes remotas, cobros repetidos,
reintentos, cambios y autoservicio. Esos hechos suelen pertenecer a un proveedor,
pero el estado operativo y su trazabilidad no pueden depender de payloads sin
verificar ni de una API concreta. Tampoco se puede asumir proveedor, precio,
cadencia, política de impago o perfil de cliente por defecto.

R4.10 debe crear el límite técnico sin ampliar PCI: el proveedor aloja cobro y
portal; Logic2B solo conserva referencias opacas, snapshot del plan, estados y
hechos verificados. La demo pública sigue siendo de solo lectura y no existe un
webhook simulado público.

## Decisión

1. `PRC-013` pertenece al módulo `subscriptions`. Queda `installed` en todos los
   presets: un proyecto debe activarlo explícitamente después de decidir su
   configuración comercial y su adaptador.
2. `SubscriptionProviderAdapter` es el puerto único. Alta, activación, pausa,
   reanudación, cambio, cancelación y sesión de portal devuelven hechos
   verificados. Un adaptador real también debe autenticar cuerpo y firma antes
   de construir `VerifiedSubscriptionProviderEvent`.
3. R4.10 incluye solo `simulated-subscriptions`, determinista y sin red,
   credenciales ni dinero. Su `verifyWebhook` rechaza siempre; por eso no se
   publica una ruta webhook insegura.
4. Un plan versiona variante, importe en céntimos, moneda, unidad e intervalo,
   pero no hay seed ni valor predeterminado comercial. Cada proyecto aporta
   todos esos campos y la referencia remota opcional.
5. El alta congela el plan. El navegador no puede aportar importe, moneda ni
   referencia de proveedor. La identidad mínima es un email de contacto y dos
   referencias opacas; no se adelantan cuentas o perfiles R5.
6. Los estados son `pending`, `active`, `paused`, `past_due`,
   `cancel_at_period_end` y `cancelled`. Cada transición exige versión esperada,
   hecho remoto único y transición admitida por dominio y trigger D1.
7. Cada hecho conserva solo tipo, referencias, hash SHA-256 e instantes; no se
   persiste el payload remoto. Los eventos de plataforma no contienen email ni
   referencias de cliente.
8. Un fallo incrementa `failed_payment_count`; un cobro posterior lo reinicia.
   Los intentos actualizan la proyección del mismo ciclo solo si aumenta
   `attempt_count`, mientras `subscription_events` conserva todos los hechos.
   Cadencia, número de reintentos y suspensión automática son decisiones del
   proyecto/proveedor, no de R4.10.
9. El portal es alojado: la URL expira, se devuelve con `no-store`, exige un
   retorno del mismo origen y nunca se guarda en D1. R4.10 expone la operación
   administrativa; el autoservicio con autenticación de cliente espera el
   modelo de identidad R5.
10. No se materializan pedidos recurrentes ni movimientos de stock. Esa unión
    requiere un contrato posterior explícito para precio vigente, reserva,
    fulfillment, impuestos y devolución; marcar un ciclo pagado no puede
    inventar por sí solo un pedido.

## Persistencia

La migración expand-only `0034_provider_subscriptions.sql` añade:

- `subscription_plans`: configuración versionada aportada por el proyecto;
- `subscriptions`: proyección y snapshot sin datos de tarjeta;
- `subscription_provider_events`: inbox idempotente verificado y sin payload;
- `subscription_events`: historial de transición y versión;
- `subscription_cycles`: proyección de ciclo, intento y fallo saneado.

Los triggers enlazan snapshot y plan, serializan versiones y exigen que cada
ciclo provenga del hecho de pago correcto. No hay backfill ni filas inventadas.

## Fronteras

- No se elige proveedor, precio, moneda, cadencia, dunning ni promesa comercial.
- No hay webhook público hasta que un adaptador real implemente verificación.
- No hay tarjeta, PAN, CVC, método de pago ni URL de portal persistidos.
- No hay perfil, área privada ni enlace público antes de R5.
- No hay pedido recurrente ni consumo de inventario implícito.
- No se toca la demo, D1 remota ni Worker sin rollout separado.

## Verificación

- Reducer puro de estados y rechazo de hechos ajenos.
- Migración vacía, guards, idempotencia, concurrencia y foreign keys.
- Impago, recuperación, cambio, pausa, reanudación y cancelación.
- Replay por clave del proveedor y ciclo con varios intentos.
- API bloqueada en demo y por flags; portal no persistido.
- Backup esquema 28, rehearsal/restore de `0034` y `pnpm check` completo.

## Rollback

Desactivar `PRC-013` retira rutas y efectos. El proveedor se pausa antes de
retirar un adaptador para no generar hechos no procesables. Las tablas y su
historial se conservan; un Worker anterior las ignora. Borrarlas, cambiar
proveedor o contraer estados requiere migración y autorización independientes.
