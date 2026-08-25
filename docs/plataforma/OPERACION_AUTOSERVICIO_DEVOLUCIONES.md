# Operación del autoservicio de devoluciones — R5.5g

## Alcance y frontera

`CUS-005` permite que un perfil autenticado **solicite y consulte** sus propias
devoluciones. No autoriza, recibe, inspecciona, repone ni resuelve mercancía:
esas operaciones continúan en el RMA de backoffice (`FUL-011`). `FUL-010`
conserva para un bloque posterior la superficie HTTP/portal, reglas visibles y
experiencia completa. Este corte no abre rutas, navegación ni activación.

El selector de entrada es siempre `ord_…`. Email, número comercial, nombre,
dirección o cualquier otra PII no prueban ownership. La respuesta usa `ret_…`
y solo contiene estado, motivo, versión, fecha y cantidades por línea.

## Invariantes de escritura

1. El pedido pertenece al perfil activo y no fusionado.
2. `customer_order_access_refs.ownership_version` coincide con el CAS recibido.
3. Pedido y fulfillment están entregados; solo se reclaman unidades entregadas,
   dentro de 30 días y todavía no reclamadas.
4. Owner, CAS, elegibilidad, cabecera, líneas, evento y auditoría se revalidan
   dentro de la misma transacción D1.
5. Toda mutación exige que `Origin` coincida exactamente con el origen canónico
   configurado, además del token CSRF ligado a la sesión.
6. `Idempotency-Key` más la huella SHA-256 del payload permite replay exacto;
   las líneas se ordenan por `orderItemId` antes de calcularla, de modo que dos
   representaciones equivalentes comparten huella. Reutilizar la clave con
   owner o payload distintos produce conflicto.
7. El trigger RMA existente serializa la última unidad disponible. Dos altas
   concurrentes no pueden reclamar la misma cantidad.
8. `requested_by_id`, versión de ownership y huella forman el snapshot mínimo
   e inmutable. No se copia email, número de pedido ni PII.
9. Cambiar el owner, fusionar/revocar el perfil o agotar cantidades cierra la
   operación. No existe claim, merge ni reasignación automática.

## Migración y preflight

`0044_customer_return_requests.sql` es expand-only: añade tres columnas nullable
a `return_requests`, crea `customer_return_access_refs`, backfillea un selector
opaco por RMA y añade guardas inmutables. Los RMA legacy conservan evidencia
nullable; solo una escritura del nuevo contrato aporta ambas columnas.

`customer_contract_version=1` distingue inequívocamente una alta del portal de
los RMA legacy que ya usaban `requested_by_kind='customer'`. Sus triggers
revalidan owner/CAS y la ventana/cantidad dentro de la transacción; omitir o
mezclar la evidencia no convierte un registro legacy en una solicitud owner-only.

Antes de aplicar en un target persistente:

```bash
sqlite3 <copia-0043.sqlite> "PRAGMA foreign_key_check; PRAGMA integrity_check;"
pnpm db:rehearse:customer-return-requests -- \
  --baseline-sqlite <copia-0043.sqlite> --output-dir <directorio-aislado>
```

El ensayo exige baseline exacto `0043`, aplica `0044` sobre una copia, compara
productos, variantes, pedidos, pagos y RMA legacy, prueba selector/evidencia,
genera `.dump`, restaura otra SQLite y repite integridad y prueba funcional.

## Reconciliación posterior

```sql
PRAGMA foreign_key_check;
PRAGMA integrity_check;

SELECT count(*) AS missing_refs
FROM return_requests r
LEFT JOIN customer_return_access_refs access ON access.return_id = r.id
WHERE access.return_id IS NULL;

SELECT count(*) AS partial_customer_evidence
FROM return_requests
WHERE (customer_payload_fingerprint IS NULL)
   <> (customer_ownership_version IS NULL);

SELECT public_ref, count(*) AS duplicates
FROM customer_return_access_refs
GROUP BY public_ref HAVING count(*) > 1;
```

Los tres recuentos deben ser cero. La aplicación concreta requiere bookmark o
backup del target, autorización explícita y ejecución coordinada. R5.5g no la
aplicó a ningún target persistente; R5.5h reconstruyó la D1 local en `0044`,
pero la D1 remota continúa en `0043` a la espera de recuperar OAuth de Wrangler.

## Rollback y recuperación

El rollback de código deja tablas/columnas expandidas y selectores intactos;
el RMA administrativo anterior sigue siendo compatible. No se rotan ni borran
referencias emitidas. Ante una carrera o replay dudoso se consulta por la clave
idempotente y la huella: nunca se crea un segundo expediente ni se reescribe el
primero. Una contracción física solo puede planificarse después de backup y de
probar que ninguna superficie emitió `ret_…`.
