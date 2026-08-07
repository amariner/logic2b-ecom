# Auditoría de operaciones ecommerce sin exponer datos sensibles

> Borrador interno. No indexar ni publicar todavía.

## Estado verificable

El motor registra cambios efectivos de pedidos, pagos, productos y tarifas con
actor técnico, acción, entidad, correlación y diff. La evidencia se confirma en
la misma transacción que el negocio y una carrera perdedora no crea una segunda
fila.

El registro no guarda email, dirección, teléfono, NIF, empresa, sesión, token,
secreto, tarjeta ni identificadores del proveedor de pago. Los campos sensibles
se sustituyen por `[REDACTED]` y el diff queda limitado a 4 KB.

## Lo que deliberadamente no hace

No registra visitas, lecturas, logins fallidos ni peticiones rechazadas. Tampoco
ofrece una URL de consulta o exportación: la demo tiene credenciales públicas y
una descarga convertiría evidencia interna en superficie de ataque. La revisión
operativa se realiza sobre la D1 aislada del cliente mediante el control plane
autorizado.

## Evidencia técnica

- `migrations/0005_audit_log.sql`: constraints e índices acotados.
- `src/shared-kernel/audit.ts`: allowlist, redacción y límites.
- `src/platform/operations/infrastructure/d1-audit-log.ts`: batches guardadas.
- `tests/audit-contract.test.ts` y `tests/audit-admin.test.ts`: PII, esquema,
  demo inerte, concurrencia y atomicidad.

## Condición para publicar

Mantenerla como borrador hasta que exista una experiencia operativa definida
para consultar evidencia sin abrir una ruta en la demo pública. La ausencia de
export HTTP es una propiedad de seguridad, no una funcionalidad pendiente que
deba resolverse con un endpoint improvisado.
