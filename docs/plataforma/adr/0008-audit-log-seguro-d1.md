# ADR-0008 — Audit log seguro y sin superficie pública

- Estado: **accepted — aprobado por Andreu con prioridad de seguridad/carga**
- Fecha: 2026-08-07
- Mandato: R1.8

## Contexto

Los eventos y el outbox resuelven entrega y reintentos, pero se purgan después
de su ventana operativa. Hace falta evidencia duradera de quién cambió qué sin
convertir la demo, sus credenciales públicas o una nueva ruta de exportación en
una superficie de extracción o denegación de servicio.

## Decisión

Crear `audit_log` mediante una migración aditiva. Cada fila conserva identidad,
instante, actor técnico no personal, acción, entidad, correlación, evento fuente
opcional y un diff JSON. Las mutaciones de pedido/pago se proyectan desde el
evento ya persistido; producto y tarifa usan una guarda optimista sobre el
snapshot completo. Evidencia y negocio se confirman en la misma `D1.batch()`.

El diff acepta un máximo de 50 campos escalares, 256 caracteres por valor y
4 KB serializados. Cada caso de uso usa allowlist y una denylist transversal
redacta email, dirección, teléfono, NIF, empresa, sesión, token, secreto,
password, tarjeta e identificadores de pago. No se registra body, stack ni
payload de petición.

## Superficie y carga

- No existe endpoint, página, navegación ni export HTTP del audit log.
- La demo rechaza mutaciones antes de leer o escribir auditoría; las lecturas,
  logins fallidos, rate limits y demás tráfico público no generan filas.
- Solo una mutación válida que gana su guarda escribe una fila. Un duplicado o
  una carrera perdedora escribe cero.
- Dos índices cubren entidad y correlación; no hay índices o búsquedas de texto
  ni trabajo programado adicional.
- `backup.sql` excluye la tabla porque la demo tiene credenciales públicas. Una
  extracción excepcional se hace desde el control plane de Cloudflare/Wrangler,
  fuera del Worker público y con autorización operativa.

Esta decisión sustituye el «export autenticado» inicialmente descrito en el
roadmap. La instrucción explícita de Andreu prima sobre ese entregable: no se
abre una ruta solo para cumplir una casilla.

## Alternativas rechazadas

- Auditar todas las peticiones o intentos fallidos: convierte tráfico hostil en
  escrituras D1 controladas por el atacante.
- Reutilizar el outbox: mezcla evidencia de largo plazo con entrega y retención.
- Export CSV/JSON desde el panel demo: añade enumeración, coste de consulta y
  riesgo de exfiltración sin aportar valor al visitante.
- Guardar snapshots completos: duplica PII y aumenta crecimiento y exposición.

## Consecuencias

- Pedidos, pagos, transiciones admin, productos y tarifas dejan evidencia
  correlacionable, atómica y redactada.
- La demo no cambia de comportamiento ni añade trabajo proporcional al tráfico.
- No hay dependencia, servicio, coste fijo, JavaScript ni nueva superficie PCI.
- La operación que necesite consultar o extraer evidencia lo hace directamente
  sobre la D1 autorizada hasta que exista un canal fuera del Worker público.
