# ADR-0009 — Observabilidad segura sobre Workers Logs

- Estado: **accepted — sin servicio ni superficie pública nueva**
- Fecha: 2026-08-07
- Mandato: R1.9

## Contexto

Checkout, webhook, outbox y email necesitan señales operativas correlacionables.
La demo pública puede recibir tráfico hostil o voluminoso: registrar cada visita,
rechazo o firma inválida convertiría al atacante en quien decide el coste de
logs o escrituras. Un exportador HTTP también ampliaría la superficie de ataque.

## Decisión

Usar el `console` estructurado que Cloudflare Workers ya captura. Cada señal es
una línea JSON con esquema versionado, nivel, nombre acotado, duración limitada
y como máximo tres identificadores técnicos validados: operación interna,
correlación de negocio y causación del proveedor.

El contrato solo admite métricas tipadas de checkout, webhook, outbox y email,
y códigos de error enumerados. No acepta mapas de campos arbitrarios ni
serializa `Error.message`, causa, stack, URL, IP, cabeceras, body, email,
dirección, sesión o referencia de pago.

Solo se emiten señales por:

- checkout completado o fallo interno después de validar el payload;
- webhook procesado o fallo interno después de verificar su firma;
- tandas de outbox o email que reclaman trabajo, y sus fallos;
- nunca por demo, validación rechazada, firma inválida o barrido vacío.

La respuesta legítima expone `x-operation-id` para el soporte. No se crea tabla,
endpoint, página, exportador, dependencia, beacon ni servicio externo.

## Consecuencias

- El runbook puede buscar una operación sin usar PII.
- El volumen depende de trabajo legítimo ya aceptado, no del tráfico anónimo.
- Un fallo del sink se absorbe y nunca rompe checkout, webhook u outbox.
- Workers Logs aplica la retención/configuración de la cuenta existente; no es
  un almacén de auditoría y no sustituye `audit_log`.
- Alertas y SLO siguen pendientes de R11.5; SEC-008 pasa a `parcial`, no a
  `actual`.

## Alternativas rechazadas

- Escribir métricas o errores en D1: amplificación de escritura y retención
  propia innecesaria.
- Publicar `/metrics`, `/logs` o export CSV/JSON: enumeración y coste controlable
  desde Internet.
- Registrar cada 4xx o firma inválida: hace que el atacante genere telemetría.
- Añadir un proveedor SaaS: coste, dependencia y transferencia de datos sin una
  necesidad aprobada.
