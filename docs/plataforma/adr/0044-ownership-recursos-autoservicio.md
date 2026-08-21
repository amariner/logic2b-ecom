# ADR-0044 — Ownership por recurso y permisos mínimos de autoservicio

- Estado: aceptado; vertical de lectura de pedidos instalada e inactiva
- Fecha: 2026-08-21
- Bloque: R5.5a
- Capacidades: `CUS-004`, `CUS-005`, `CUS-006`
- Continúa: ADR-0039, ADR-0042 y ADR-0043

## Contexto

R5.4 autentica una identidad vinculada a un perfil activo y emite una sesión
inicial con el único scope `customer:self`. Esa sesión prueba quién es el sujeto
para el servidor, pero no prueba que un pedido, una dirección o una devolución
le pertenezcan. Confundir autenticación con ownership convertiría cualquier
referencia adivinable en un IDOR y daría acceso global a una sesión válida.

El modelo previo conserva pedidos guest con `customer_profile_id = NULL`,
direcciones versionadas por perfil y RMA enlazados a pedidos. Email, nombre,
dirección y número de pedido aparecen en comunicaciones o documentos y por
tanto no son secretos. Tampoco se puede reclamar historia automáticamente al
crear una cuenta: una coincidencia de email no demuestra que la sesión sea
propietaria de compras pasadas.

Este corte debe fijar el límite antes de añadir DDL, repositorios, rutas o UI.
La demo pública conserva `CUS-003 installed`, no obtiene navegación de cuenta y
no ejecuta mutaciones.

## Decisión

### Autenticación, permiso y ownership son tres gates distintos

Toda decisión de autoservicio exige, en este orden:

1. sesión, identidad y perfil activos y coherentes, unidos por los mismos ids;
2. scope base `customer:self`, que solo identifica al sujeto;
3. capacidad concreta activa y permiso mínimo concedido por policy server-side;
4. recurso resuelto por una referencia pública opaca;
5. asociación canónica del recurso al mismo perfil activo.

Fallar cualquier gate deniega. `customer:self` nunca concede por sí mismo leer
pedidos, direcciones o RMA. `customer:sessions:revoke` no participa en este
contrato y sigue sin concederse a la sesión inicial.

Los permisos de recurso quedan separados por capacidad:

| Capacidad | Permisos mínimos | Ownership canónico |
|---|---|---|
| `CUS-004` | `customer:orders:read` | `orders.customer_profile_id` exacto y no nulo |
| `CUS-005` | `customer:returns:read`, `customer:returns:create` | lectura: RMA→pedido→perfil; creación: pedido→perfil, revalidado al escribir |
| `CUS-006` | `customer:addresses:read`, `customer:addresses:write` | revisión de dirección→perfil activo |

Seguir tracking usa el permiso de lectura de pedidos: no abre otro conjunto de
datos. Crear una devolución no recibe ownership de un RMA inexistente; prueba
primero el pedido y la transacción futura vuelve a comprobar la misma
asociación antes de insertar. Ningún permiso de una capacidad implica otro.

### Referencias y respuestas públicas

Las superficies futuras recibirán referencias aleatorias opacas con prefijo de
tipo y al menos 128 bits de entropía. Los ids enteros, el número comercial del
pedido, email, teléfono, dirección, tracking o return number no son selectores
públicos válidos ni pruebas de propiedad. La opacidad solo reduce enumeración:
el servidor comprueba ownership en todos los casos.

Ausencia, referencia inválida, recurso guest, owner ajeno, perfil fusionado,
identidad revocada, capability apagada y scope ausente convergen externamente en
`404 customer.resource.not_found`. La causa detallada solo puede llegar a
auditoría tipada o métricas agregadas; nunca al body, redirect, log libre o
analytics del navegador.

### Perfil fusionado, historia guest y cambio de contacto

- Un perfil `merged` se deniega y no hereda acceso del destino. El destino
  activo tampoco hereda silenciosamente recursos que aún apunten al origen.
- Un pedido con owner nulo sigue siendo guest. No se reclama por email, nombre,
  dirección, magic link posterior ni coincidencia HMAC.
- Cambiar o vincular email no reasigna pedidos, direcciones o devoluciones. La
  asociación es con el id opaco del perfil, no con el contacto mutable.
- Una cuenta compartida comparte de forma explícita el conjunto del perfil:
  este contrato no inventa ownership por persona o dispositivo. Un proyecto
  que necesite roles domésticos/empresa requiere un modelo posterior.
- Revocar sesión, identidad o perfil corta toda decisión nueva. Una lectura ya
  emitida no se usa como autorización para una mutación posterior.

### Carreras y mutaciones

Leer ownership y escribir en dos operaciones separadas queda prohibido. Las
mutaciones futuras reciben una precondición con capacidad, permiso, recurso,
owner esperado y versión observada. El repositorio específico debe comparar esa
precondición y aplicar la escritura en una única transacción. Si la asociación
cambió, devuelve `ownership_changed` sin efecto; el caller responde con la misma
forma pública de denegación.

Los comandos de mutación serán idempotentes. La auditoría solo admite ids
opacos, acción tipada, decisión, correlación e instante; no recibe email,
dirección, token, cookie, proof, HMAC de contacto ni texto libre.

## Contrato instalado

`src/modules/customers/domain/resource-ownership.ts` aporta:

- vocabulario cerrado de capacidades, acciones, recursos y permisos;
- referencias públicas opacas por tipo;
- decisión pura que separa sujeto, policy y owner;
- una única forma pública anti-enumeración;
- precondición CAS para las futuras escrituras.

`src/modules/customers/application/resource-ownership-ports.ts` propone:

- reader server-side de ownership canónico;
- writer genérico que revalida ownership y muta atómicamente;
- auditoría tipada sin PII;
- authorizer de composición para sesión, gates y repositorio.

R5.5b añade `migrations/0041_customer_order_access.sql` y el adaptador
`d1-customer-resource-ownership-reader.ts`. Cada pedido obtiene una referencia
`ord_` seguida de 128 bits aleatorios y una versión de ownership. El backfill
solo crea esa referencia: no toca `orders.customer_profile_id`, por lo que la
historia guest continúa guest. Altas nuevas y cambios de owner actualizan la
evidencia dentro de la misma transacción; borrar una orden elimina su referencia
dependiente.

El reader acepta exclusivamente una referencia opaca de pedido, resuelve el
owner canónico y clasifica guest, owner activo o estado incoherente sin leer
email, número de pedido, dirección ni tracking. R5.5c compone sobre él el
authorizer y `GET /api/customer/orders/:ord_ref`: sesión, capability, scope y
owner son gates separados; la carga final compara owner y versión para cerrar
la carrera autorización→lectura. No existe todavía writer de RMA/direcciones;
un writer que haga `resolve` seguido de `UPDATE/INSERT` sigue sin cumplir el
contrato.

El detalle solo selecciona referencia pública, número comercial, estado,
importe/divisa, fechas y tracking. No devuelve contacto, dirección, referencias
de pago ni ids internos. Fallos de sesión y ownership comparten 404 y headers;
la clave de rate limit y las métricas no contienen la referencia ni PII.

R5.5d añade `GET /api/customer/orders` y `/cuenta/pedidos`. El índice deriva el
perfil exclusivamente de la sesión, filtra owner activo en SQL y pagina diez
filas con cursor que solo contiene instante y referencia pública. Rechaza owner,
email, número comercial y cualquier parámetro alternativo. Las páginas SSR no
añaden JavaScript y comparten los mismos gates, cache privada y límite por IP;
la sesión solo enlaza el historial cuando `CUS-004` tiene rutas activas.

`CUS-004` queda instalado solo en el preset avanzado y API/páginas están
declaradas en el registro, pero sin flag activa ni efecto por defecto. El
backup sube a esquema 34 e incluye referencias y versiones exactas. El rehearsal
aislado sobre el baseline `0040` conserva 294
productos, 296 variantes, 296 balances, 8 pedidos, 8 pagos y los 8 pedidos
guest, con `foreign_key_check` limpio y dump/restore equivalente.

## Retención, auditoría y gates por capacidad

- `CUS-004` hereda retención y excepciones fiscales del pedido; no duplica
  snapshots en una tabla de portal.
- `CUS-005` hereda el lifecycle del RMA y del pedido. Solicitar una devolución
  será una mutación auditada e idempotente, con elegibilidad de FUL-010 aún
  pendiente.
- `CUS-006` conserva revisiones append-only del perfil. Borrar/anonimizar se
  coordina con la política R5.3; no reescribe snapshots históricos del pedido.

La duración concreta, base legal y excepciones dependen de la política aprobada
por proyecto. Este ADR no las inventa. Cada capacidad necesita manifest/gate,
persistencia, pruebas, rollout y superficie propios; activar cuenta no las
activa en bloque.

## Threat model y pruebas obligatorias

| Amenaza | Control contractual |
|---|---|
| Sesión válida enumera recursos | Referencia opaca + ownership exacto + respuesta 404 uniforme. |
| Cuenta compartida | Acceso explícitamente a nivel de perfil; sin falsa identidad individual. |
| Cambio de email | Contacto no forma parte de la decisión ni reasigna owners. |
| Merge de perfiles | Origen fusionado y asociaciones incoherentes se deniegan. |
| Sesión/identidad revocada | Estado activo y coherencia completa en cada decisión. |
| Recurso de otro perfil | Comparación owner→perfil exacta, sin fallback por PII. |
| Pedido guest histórico | Owner nulo se deniega; no hay claim automático. |
| Carrera owner→mutación | CAS de owner/versión dentro de la misma transacción. |
| Scope confundido | Matriz cerrada por CUS-004/005/006; no hay implicación transversal. |
| Enumeración por errores | Misma forma pública para ausencia y denegación. |

Las pruebas cubren las amenazas contractuales, concurrencia de persistencia,
formas/headers HTTP equivalentes, rate limit, cambio de owner entre autorización
y lectura y ausencia de PII en DTO/métricas. CSRF y CAS de escritura permanecen
como gates de las futuras mutaciones.

## Fronteras de R5.5a

- Sin DDL, migración, backfill, repositorio D1 ni referencia pública persistida.
- Sin rutas, UI, navegación, cookie nueva, email, job, proveedor o deploy.
- Sin reclamar pedidos históricos ni convertir token guest en cuenta.
- Sin elevar sesiones, step-up, WebAuthn, cross-device o revoke-all público.
- Sin activar `CUS-004`, `CUS-005`, `CUS-006` ni `customer:sessions:revoke`.
- Sin fijar retención, base legal o promesa comercial universal.

## Siguiente gate

R5.5e debe materializar referencias `addr_` y ownership versionado para las
direcciones R5.1 antes de abrir `CUS-006`. El `address_id` estable conserva la
identidad del recurso y la revisión vigente aporta owner y CAS. El corte exige
backfill/generación atómicos, reader D1, backup/rehearsal y cero PII duplicada;
HTTP/UI y activación permanecen fuera.

## Rollback

Mientras `CUS-004` permanezca instalado e inactivo, retirar su composición deja
checkout guest y `CUS-003` sin cambios. La tabla de referencias es expand-only y
se conserva durante rollback de código para no rotar selectores; solo se elimina
después de backup verificado y de demostrar que ninguna superficie los emitió.
