# Operación passwordless (`CUS-003`)

## Estado del contrato

R5.4b materializa ADR-0042 mediante la migración expand-only `0039`, el
repositorio D1 interno y backup esquema 33. R5.4c acepta ADR-0043 y cierra el
contrato de la futura superficie: magic link por Resend directo, orden
`prepare → persist → deliver`, origen exacto, secretos separados, cookie/CSRF/
CSP, rate limit por capas y recuperación sin bypass. También corrige el puerto,
endurece dominio/repositorio/replay y restore, y añade el contrato tipado y
fail-closed de manifest para `CUS-003`.

`CUS-003` permanece `installed` e inerte: R5.4c no añade DDL, valores de env,
proveedor operativo, email/WebAuthn, cookie real, endpoint, UI, navegación ni
permiso para leer pedidos, direcciones o derechos de datos. La demo pública no
cambia y producción continúa sin esta capacidad.

El manifest rechaza campos extra y solo acepta `email_magic_link`, proveedor
`resend`, origin HTTPS exacto, challenge de 600 segundos, idle ≤7 días, corte
absoluto ≤30 días e idle ≤ corte. Exige en orden los secret refs
`CUSTOMER_PROFILE_HMAC_SECRET`, `CUSTOMER_AUTH_CSRF_SECRET` y `RESEND_API_KEY`,
además de `rateLimit.enforcement=edge-durable`, `failClosed=true` y una
`attestationRef` válida. También exige `tracking.click=false`,
`tracking.open=false` y su atestación operativa: Resend no puede reescribir el
enlace de acceso mediante tracking. `CUS-003` depende de `INT-002` y solo puede
estar operativo como `active`, con `routes=true`, `sideEffects=true` y
`navigation/jobs=false`; `degraded` se rechaza. `INT-002` debe usar
`delivery=send` y `sideEffects=true`, nunca `capture` ni un transporte inerte.
Ningún preset activa aún la capacidad.

Las cuatro tablas separan identidad autenticable, familia, sesión y challenge.
D1 solo conserva HMAC/digests SHA-256 y referencias opacas; no guarda email,
proof/token crudo, IP, user-agent, passkey, URL de acceso ni clave privada. Los
scopes del modelo son explícitos: `customer:self` es inherente a toda sesión y
`customer:sessions:revoke` se representa mediante una columna booleana, pero
R5.4c solo permite emitir sign-in con el primero. Conceder el segundo exige el
step-up/transición atómica diferidos.

Producción continúa en `0032`. `0033`–`0039` requieren un rollout remoto
autorizado y ordenado. La D1 local sirve `0039` con cero identidades,
challenges, familias y sesiones inventadas.

## Preflight y rehearsal

1. Confirmar backup y Time Travel del D1 objetivo.
2. Aplicar y validar primero `0033`–`0038`.
3. Obtener una baseline exacta en `0038`. Si Wrangler rechaza FTS5, crear una
   copia consistente con `.backup` y volcar esa copia con `sqlite3 .dump`.
4. Ejecutar:

   ```bash
   pnpm db:rehearse:passwordless-auth -- \
     --baseline /ruta/baseline-0038.sql \
     --output-dir /ruta/aislada
   ```

5. Exigir el mismo hash antes, después y tras restore para catálogo,
   inventario, pedidos, pagos, perfiles, consentimientos y derechos de datos.
6. Comprobar las cuatro tablas nuevas vacías, triggers/índices presentes y
   `foreign_key_check`/`integrity_check` limpios.

El rehearsal local del 2026-08-18 conservó 294 productos, 296 variantes y
balances, 8 pedidos, 13 líneas y 8 pagos, con hash
`72ba73e985b69b4430a7e10e08a28859661bcd8eb406530945846c213082dffe`.
El dump restaurable final ocupa 658.708 bytes; no inventó perfiles,
consentimientos, solicitudes de derechos ni credenciales.

## Escritura y concurrencia

- Crear identidad o challenge es idempotente y compara el registro completo;
  reutilizar id/clave con otro contenido produce un conflicto estable.
- Consumir un challenge inserta familia y sesión y marca el challenge consumido
  en una sola `D1.batch`. Dos sesiones concurrentes dejan un único ganador.
- Rotar inserta la generación nueva antes de invalidar la anterior dentro de la
  misma batch. Familia, identidad, perfil, corte absoluto y scopes no cambian.
- La revocación individual y familiar es durable e idempotente. Revocar una
  familia afecta solo sesiones activas; nunca reactiva generaciones rotadas.
- Triggers bloquean cambios de identidad, saltos de generación, elevación de
  scopes, ampliación de TTL, familias revocadas y transiciones repetidas.
- El repositorio compara todos los campos inmutables antes de escribir: un
  payload manipulado no puede aplicar una transición parcial.
- Solo un challenge consumido con propósito `sign_in` puede emitir sesión. Una
  lectura por token devuelve sesión únicamente si familia, identidad y perfil
  siguen activos, el instante cae dentro de la sesión y si ids, corte absoluto
  y HMAC de contacto son coherentes. La emisión inicial exige exactamente el
  scope `customer:self`.
- Un replay de revocación solo se acepta si coinciden clave, motivo, instante y
  versión esperada; una coincidencia parcial falla en cerrado.
- R5.4c deniega un contexto cuyo perfil resulte fusionado, revocado o
  incoherente, pero aún no revoca durablemente esa familia. Tampoco sustituye
  atómicamente challenges pendientes ni ofrece revoke-all por identidad/perfil;
  esas operaciones son gates de persistencia de R5.4d.

## Contrato de entrega R5.4c

El primer método es exclusivamente `email_magic_link`. WebAuthn no comparte un
fallback implícito: queda diferido hasta disponer de ADR, RP ID/origins y
persistencia de credenciales/contadores propios.

El adaptador Resend de R5.4d no reutilizará `emails_outbox`, porque el cuerpo
persistido y respaldado revelaría el proof. La aplicación preparará en memoria
un proof de 256 bits y su digest, persistirá primero un challenge con TTL de 10
minutos y referencia determinista, y solo entonces entregará el enlace mediante
`fetch` directo con una clave de idempotencia derivada del challenge. Un fallo
de entrega revoca el challenge y nunca modifica el acknowledgement `202`.
El dominio emisor debe acreditar `click_tracking=false` y
`open_tracking=false` en preflight; el click tracking reescribe cada enlace a
un redirect del proveedor y es incompatible con el bearer secret.

El origen único será el HTTPS exacto de `shopConfig.baseUrl`, validado contra
`astro.config.site`; no se deriva de cabeceras de petición ni admite comodines.
El enlace usa exclusivamente
`/cuenta/acceso/confirmar#challenge=<id-codificado>&proof=<base64url>`: nunca
query ni path. El fragmento no llega al servidor, por lo que el GET muestra una
página genérica y no consume ni valida nada.

Esa página carga un módulo JS externo first-party. El módulo lee ambos valores,
valida su forma, limpia inmediatamente la barra con `history.replaceState` y
solo los conserva en memoria. La cookie HttpOnly de intento ya se emitió en el
POST inicial `/cuenta/acceso`, ligada al challenge real o a una referencia
dummy indistinguible cuando no existe identidad o se suprime la entrega. El GET
de confirmación nunca la crea ni la reemplaza; puede entregar un CSRF efímero
ligado a la cookie previa o un valor dummy.

Tras una confirmación humana explícita, el módulo hace un único POST
same-origin `consume` con challenge, proof y CSRF. Solo consume si origin,
cookie previa, vínculo y CSRF coinciden; después elimina la cookie y redirige
303 a una ruta limpia de la allowlist. El enlace debe abrirse en el mismo
navegador que inició la solicitud; un flujo cross-device necesita otro
contrato. No hay token en query, storage, analytics, access logs, métricas ni
errores, y un GET de scanner nunca crea el vínculo de navegador.

## Secretos, cookie y frontera de navegador

| Elemento | Decisión contractual |
|---|---|
| Identidad | `CUSTOMER_PROFILE_HMAC_SECRET`, común a CUS-002/003 por despliegue. |
| CSRF | `CUSTOMER_AUTH_CSRF_SECRET`, nuevo y separado de admin/Stripe/Resend. |
| Entrega | `RESEND_API_KEY`, usada solo para la API del proveedor. |
| Challenge/sesión | 256 bits aleatorios; D1 guarda solo SHA-256. |
| Cookie | `__Host-l2b-customer-session`; `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`, sin `Domain`. |
| Cookie de intento | `__Host-l2b-customer-auth-attempt`; emitida real/dummy por el POST inicial, firmada con `CUSTOMER_AUTH_CSRF_SECRET`, ligada a challenge/navegador, `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`, sin `Domain`, TTL ≤ challenge. |

El `Max-Age` de cookie de sesión es el menor entre siete días, idle/
`expires_at` restante y corte absoluto restante. Una lectura no prolonga
sesión. Sign-in crea token y `session_id` nuevos con scope exacto
`customer:self`; rotar o elevar mediante step-up, revocar todas las sesiones y
definir qué familia sustituye un nuevo magic link quedan diferidos hasta un
comando atómico propio. Toda mutación valida origin exacto, incluso con JSON, y
el flujo de intento y las mutaciones autenticadas exigen un CSRF HMAC ligado a
intento/challenge o a sesión/generación, respectivamente.

Las páginas de cuenta usan layout sin analytics ni terceros, `no-store`,
`no-referrer`, `nosniff` y CSP estricta con `default-src 'none'`, scripts
externos solo propios mediante `script-src 'self'`, sin inline, y estilos/fonts/
imágenes/conexiones solo propios, `form-action 'self'`, `frame-ancestors 'none'`,
`base-uri 'none'` y `object-src 'none'`.

## Rate limit y observabilidad

R5.4d debe componer tres capas antes de abrir la ruta:

1. regla de borde para autenticación;
2. binding Worker con 10 inicios/minuto por IP y 10 verificaciones/minuto por IP;
3. contador durable por HMAC de contacto: 3/15 minutos y 10/24 horas, más cinco
   verificaciones fallidas por challenge.

La capa durable aún no existe: DDL, retención máxima de 24 horas, exclusión del
backup y rehearsal pertenecen a R5.4d y conservan su puerta de migración. El
limitador actual por isolate es solo fallback local. Un límite global por IP
puede responder `429`; el límite por contacto cuenta presencia y ausencia por
igual, suprime entrega y devuelve el mismo `202`. No se guardan IP/email crudos,
no hay sleeps y las métricas solo contienen etapa/resultado agregados.

Antes de activar, las transiciones exitosas de sesión emitida, rotada o
revocada, logout, familia revocada y cambio de capacidad deben escribir un hecho
de seguridad durable en la misma transición D1. Actor y entidad son referencias
opacas, nunca email, HMAC, proof, token o challenge. Fallos públicos, proveedor
y rate limits producen solo métricas agregadas para no crear PII ni una outbox
controlable por un atacante.

## Recuperación, rotación e incidentes

- Recuperación autoservicio significa pedir otro magic link. Cambiar/vincular
  contacto y `link_contact` siguen cerrados.
- Soporte no emite sesiones ni acepta datos de pedido como prueba suficiente.
  Perder el buzón requiere una política posterior por proyecto; guest checkout
  permanece disponible.
- Una caída de Resend revoca el challenge fallido y genera alerta agregada; la
  persona puede iniciar otro intento.
- Ante compromiso se bloquea emisión y nunca se reactiva un token. Antes de
  poder prometer revocación total, R5.4d debe añadir una operación transaccional
  e idempotente `revokeAllSessionFamilies` por identidad/perfil, con auditoría y
  pruebas de carreras/rotaciones. Después se rotan secreto CSRF y credencial de
  entrega si aplica.
- `0039` hace inmutable y no versiona el HMAC de identidad. Rotarlo requiere
  migración y rehash controlado; R5.4c no promete rotación en caliente.

## Activación pendiente — R5.4d

Endurecer núcleo y manifest no autoriza a exponer autenticación. R5.4d debe
ampliar el puerto con sustitución atómica de pending challenges, revocación de
familia incoherente y revoke-all; implementar Resend directo con tracking
deshabilitado y el transporte POST inicial/cookie previa → fragmento → JS
externo → `consume`; materializar env, cookies, origin, CSRF/CSP, auditoría y
rate limit; ensayar cualquier migración; y cubrir replay, carreras, respuestas
uniformes, mismo navegador, E2E y a11y. Step-up, elevación y acceso R5.5 siguen
diferidos.

Hasta entonces no se registra ninguna ruta o navegación y `CUS-003` no pasa a
`active`. R5.5 tampoco concede acceso por el mero hecho de existir una sesión:
cada recurso exigirá ownership y scopes propios.

## Backup, reconciliación y rollback

El backup esquema 33 inserta identidades y reconstruye familias/sesiones primero
en su estado inicial activo. Después reproduce en orden las transiciones finales
de sesión y familia antes de insertar challenges. Así respeta los triggers y,
con `PRAGMA defer_foreign_keys`, conserva las referencias entre sesión anterior/
siguiente y challenge consumido. Restaurar exige una base con `0039` aplicada.

La reconciliación comprueba FKs, una generación por familia, un digest por
token/challenge, TTL, sesión activa única, enlace de rotación bidireccional y
challenges consumidos por una sesión de la misma identidad. Los informes son
agregados y nunca imprimen hashes, ids de sujeto o claves de idempotencia.

El rollback seguro es de comportamiento: mantener `CUS-003` sin flags y
bloquear emisión. Si alguna vez se activa, la operación auditada de revocación
total exigida a R5.4d debe ejecutarse antes de volver a `installed`. No contraer
tablas ni reactivar tokens antiguos; retirar datos o rotar el HMAC de identidad
exige política, migración y rehearsal propios.
