# ADR-0043 — Superficie passwordless por email con frontera segura

- Estado: aceptado; hardening interno integrado, proveedor/HTTP pendientes
- Fecha: 2026-08-19
- Bloque: R5.4c
- Capacidad: `CUS-003`
- Continúa: ADR-0042

## Contexto

ADR-0042 y la migración `0039` fijan identidad separada, challenges de un uso y
sesiones opacas revocables, pero deliberadamente no eligen proveedor ni abren
superficies. Antes de conectar un navegador o un correo hay que cerrar el orden
de persistencia/entrega, el origen confiable y las defensas de frontera sin
convertir la demo pública en una tienda real.

El stack del repositorio ya fija Resend para email y dispone de `INT-002`. La
outbox transaccional actual no sirve para magic links: guarda el HTML completo y
forma parte del backup, por lo que persistiría el proof que ADR-0042 prohíbe.
Además, el puerto genérico instalado no recibía el proof ni la URL y devolvía la
referencia del proveedor demasiado tarde para persistir el challenge antes de
enviar. R5.4c corrige esa frontera, endurece núcleo, repositorio, backup y
manifest; R5.4d implementará proveedor y superficie HTTP.

## Decisión

### Método, proveedor y orden de efectos

1. El único método inicial será `email_magic_link`, entregado por Resend mediante
   `fetch` directo y sin SDK ni dependencia nueva. WebAuthn queda diferido: no se
   configura RP ID, origin, credential ID, clave pública ni contador hasta un
   ADR y persistencia propios.
2. Un proof contiene 256 bits aleatorios, se codifica en base64url y caduca a los
   10 minutos. D1 conserva únicamente SHA-256 del proof; el límite contractual
   de 15 minutos de ADR-0042 permanece como techo no ampliable.
3. El puerto ya permite separar el flujo `prepare → persist → deliver`:
   - `prepare` crea proof, digest y la referencia determinista
     `resend_magic:<challengeId>` únicamente en memoria;
   - `persist` permanece en el repositorio y crea o resuelve la identidad y
     guarda el challenge antes de cualquier llamada externa;
   - `deliver` recibe el proof solo después de persistir. El adaptador pendiente
     enviará directamente a Resend fuera del camino de respuesta y usará
     `customer-auth/<challengeId>` como `Idempotency-Key`.
4. `emails_outbox`, event outbox, audit log, métricas y backups nunca reciben la
   URL ni el proof. Si la entrega falla, el challenge se revoca. Antes de abrir
   la superficie, R5.4d debe añadir un comando atómico que cree el nuevo
   challenge y revoque los pendientes anteriores de la misma identidad; el
   puerto instalado todavía no puede prometer esa sustitución bajo carrera.
5. El inicio público devuelve siempre el mismo `202`, cuerpo, cabeceras y forma,
   exista o no perfil, esté limitado el contacto o acepte o no Resend. La llamada
   de red no se espera para construir la respuesta.

### Elegibilidad y guest checkout

- Solo un `customer_profile` activo puede obtener una identidad autenticable.
  Pedir acceso puede crearla de forma idempotente; comprar, deduplicar un perfil
  o consentir nunca crea credenciales por sí solo.
- Cada decisión de sesión vuelve a comprobar identidad y perfil activos. Un
  perfil fusionado, revocado o incoherente invalida la autorización y nunca
  reasigna la sesión al perfil destino. R5.4c garantiza la denegación; la
  revocación durable de la familia detectada requiere una operación atómica
  adicional y es un gate explícito de R5.4d.
- El núcleo solo emite una sesión desde un challenge consumido con propósito
  `sign_in`. El repositorio exige sesión, familia, identidad y perfil activos,
  con ids, corte absoluto y HMAC de contacto coherentes; un replay de revocación
  solo coincide si también coinciden motivo, instante y versión esperada.
- Guest checkout continúa disponible con `CUS-003` activo o inactivo. La sesión
  inicial concede exactamente `customer:self`; `customer:sessions:revoke`,
  step-up, revoke-all y cualquier elevación quedan diferidos hasta diseñar una
  transición atómica propia. R5.5 sigue siendo propietario del acceso a
  pedidos, direcciones y devoluciones.

### Origen, rutas y continuación

- El origen canónico es el origen HTTPS exacto de `shopConfig.baseUrl` y debe
  coincidir con `astro.config.site` en el preflight del despliegue. Nunca se
  construyen enlaces desde `Host`, `X-Forwarded-Host` ni un origin recibido.
- No existen comodines. Alias de host redirigen al canónico antes de entrar en
  autenticación. Desarrollo y tests inyectan origins locales exactos; no hay
  fallback de producción a `localhost`.
- La superficie prevista para R5.4d es `/cuenta/acceso`,
  `/cuenta/acceso/confirmar` y `/cuenta/sesiones`. Cualquier continuación se
  elige de una allowlist de rutas relativas; por defecto termina en
  `/cuenta/sesiones` y nunca acepta una URL aportada por el proveedor.
- El enlace tiene exactamente la forma
  `/cuenta/acceso/confirmar#challenge=<id-codificado>&proof=<base64url>`. Proof y
  challenge viajan juntos en el fragmento, nunca en query, path o cabecera; el
  navegador no envía el fragmento en el GET.
- El GET sirve una página genérica y no consume ni valida el proof. Un módulo JS
  externo y first-party lee ambos valores, valida su forma, ejecuta de inmediato
  `history.replaceState` hacia `/cuenta/acceso/confirmar` y los conserva solo en
  memoria. No usa inline script, storage, analytics ni recursos de terceros.
- El POST inicial a `/cuenta/acceso` emite siempre una cookie de intento
  HttpOnly firmada: queda ligada al challenge real o a una referencia dummy de
  la misma forma cuando el contacto no existe o se suprime la entrega. Así el
  acknowledgement y `Set-Cookie` permanecen indistinguibles y el intento queda
  ligado al navegador que lo solicitó, no al que simplemente recibe el enlace.
- El GET de confirmación nunca crea ni reemplaza esa cookie. Puede entregar un
  CSRF efímero ligado a la cookie previa o un valor dummy indistinguible. Solo
  tras confirmación explícita, el módulo hace un único POST `consume`
  same-origin con challenge, proof y CSRF. El servidor exige origin exacto,
  cookie previa coincidente, vínculo y CSRF; elimina la cookie en éxito o fallo
  terminal y responde 303 hacia una ruta limpia de la allowlist. El flujo
  inicial exige abrir el enlace en el mismo navegador; cross-device queda
  diferido a un contrato separado.
- Query strings, access logs, observabilidad y errores nunca reciben proof,
  challenge, fragmento ni token CSRF. Un scanner que solo haga GET no puede
  consumir el intento ni crear el vínculo previo de navegador.

### Secretos, tokens y rotación

- `CUSTOMER_PROFILE_HMAC_SECRET` sigue siendo la clave canónica por despliegue
  para la identidad normalizada de CUS-002/CUS-003. Duplicarla produciría dos
  identidades incompatibles.
- `CUSTOMER_AUTH_CSRF_SECRET` es la referencia exclusiva para firmar la cookie
  de intento y derivar tokens CSRF ligados a intento/challenge o, una vez
  autenticado, a `session_id` y generación.
- `RESEND_API_KEY` es únicamente la credencial de entrega. Ninguno de estos
  valores reutiliza `ADMIN_COOKIE_SECRET`, secretos de Stripe ni otro dominio.
- Los tokens de challenge y sesión no tienen secreto estático: nacen de
  `crypto.getRandomValues`; D1 solo conserva su digest.
- El manifest ya tipa y valida de forma cerrada método, Resend, origen HTTPS
  exacto, TTL, ventanas de sesión, los tres `secretRefs`, rate limit
  `edge-durable` con atestación y `failClosed: true`, y la atestación operativa
  `tracking.click=false`/`tracking.open=false`. El click tracking de Resend
  [reescribe enlaces](https://resend.com/docs/dashboard/domains/tracking)
  mediante un redirect de su dominio y no es admisible para un bearer secret.
  `CUS-003` solo puede estar operativo en `active`, con flags
  exactos `routes=true`, `sideEffects=true`, `navigation=false` y `jobs=false`;
  `degraded` se rechaza. Además, `INT-002` debe estar en `delivery=send` y con
  `sideEffects=true`. La demo `installed` no activa ni resuelve secretos.
- Resend puede rotarse sustituyendo su credencial. Rotar el secreto CSRF exige
  revocar las sesiones vigentes. `0039` no versiona y hace inmutable el HMAC de
  identidad: su rotación necesita una migración y rehash controlado, por lo que
  no se promete rotación en caliente en R5.4c.

### Cookie, sesión y CSRF

- La cookie será `__Host-l2b-customer-session`, con `HttpOnly`, `Secure`,
  `SameSite=Lax`, `Path=/` y sin `Domain`. Su `Max-Age` es el menor entre siete
  días, el idle/`expires_at` restante y el tiempo restante hasta el corte
  absoluto de la familia.
- La cookie efímera de intento será `__Host-l2b-customer-auth-attempt`,
  `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/` y sin `Domain`; el POST inicial
  la entrega también para un intento dummy y dura como máximo hasta el
  vencimiento del challenge. Está firmada con `CUSTOMER_AUTH_CSRF_SECRET`,
  ligada a un único challenge/navegador, no contiene el proof y se elimina
  tanto al consumir como al fallar de forma terminal.
- El token nunca se expone a JavaScript, `localStorage` o una URL. Toda petición
  autenticada resuelve su digest en D1 y comprueba sesión, familia, identidad,
  perfil, tiempo y scope. Una lectura pasiva no prolonga la sesión.
- El sign-in inicial crea token y `session_id` nuevos con scope exacto
  `customer:self`. El contrato todavía no define cómo un nuevo magic link
  sustituye una familia previa ni cómo step-up rota y eleva una sesión:
  `consumeChallengeAndRotateSession`, `customer:sessions:revoke` y revoke-all
  quedan diferidos hasta disponer de semántica, repositorio y pruebas atómicas.
  Logout y cualquier revocación futura serán POST.
- Toda mutación valida un `Origin` exacto, también si usa JSON; no depende solo
  de `Astro.security.checkOrigin`. Las mutaciones autenticadas exigen además un
  token CSRF HMAC ligado a sesión/generación y comparado en tiempo constante.

### CSP y cabeceras

Las páginas de cuenta usan un layout propio sin analytics, scripts inline ni
recursos de terceros. Solo cargan el módulo JS externo first-party que limpia el
fragmento y arma la confirmación. La política mínima es:

```text
default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:;
font-src 'self'; connect-src 'self'; form-action 'self'; frame-ancestors 'none';
base-uri 'none'; object-src 'none'
```

Se añaden `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff`,
`Cache-Control: private, no-store, max-age=0` y `Vary: Cookie`. Producción puede
añadir `upgrade-insecure-requests`; nunca relaja la política para incluir el
proveedor de correo, que solo se invoca desde el Worker.

### Rate limit y anti-enumeración

La defensa es por capas y usa señales que no se devuelven ni registran:

1. regla de borde sobre las rutas de autenticación;
2. binding de rate limit del Worker: 10 inicios/minuto por IP y 10
   verificaciones/minuto por IP;
3. contador durable por HMAC de contacto: 3 inicios/15 minutos y 10/24 horas;
4. máximo de 5 verificaciones fallidas por challenge.

El límite por IP puede devolver `429` con `Retry-After`. El límite por contacto
cuenta emails existentes y ausentes de la misma forma y conserva el `202`
uniforme. La capa durable, su retención máxima de 24 horas, exclusión del backup
y DDL exacto pertenecen a R5.4d y mantienen una puerta de migración. El
limitador actual por isolate queda solo como fallback local; no demuestra este
contrato. No se persisten IP/email crudos ni se usan sleeps artificiales.

La observabilidad de intentos fallidos, proveedor y rate limit solo admite
contadores agregados por etapa y resultado. No emite URL, email, HMAC, IP,
proof, challenge, sesión ni errores libres del proveedor. Antes de activar,
R5.4d debe añadir hechos de seguridad durables y atómicos con la transición D1
para sesión emitida, rotada o revocada, logout, familia revocada y cambio de
capacidad. Actor y entidad serán referencias opacas; nunca email, HMAC, proof,
token o challenge. Los fallos públicos no se convierten en filas de auditoría
por intento.

### Recuperación e incidentes

- La única recuperación autoservicio inicial es pedir un magic link nuevo.
  `link_contact`, cambio de email y recuperación sin control del buzón siguen
  inaccesibles.
- Soporte nunca emite una sesión ni acepta solo número de pedido, dirección o
  datos públicos como prueba. Perder el buzón requiere una política manual por
  proyecto y un bloque posterior; guest checkout no se bloquea.
- Ante caída de Resend se conserva la respuesta pública, se revoca el challenge
  fallido y se alerta solo de forma agregada.
- Ante sospecha de compromiso se bloquea emisión y no se reactiva ningún token.
  La revocación total requiere en R5.4d una operación transaccional e idempotente
  `revokeAllSessionFamilies` por identidad/perfil, con auditoría y pruebas de
  carrera; el repositorio actual solo revoca una familia conocida. Después se
  rota CSRF/credencial de entrega si aplica. Comprometer el HMAC de identidad
  obliga al procedimiento de migración, no a cambiarlo a ciegas.

## Frontera de R5.4c

R5.4c acepta decisiones y también endurece la base instalada: corrige el puerto
`prepare/deliver` alrededor de la persistencia; limita emisión a `sign_in`;
resuelve contexto activo y coherente; valida replay estricto; restaura sesiones
reproduciendo transiciones compatibles con los triggers; y añade el contrato
tipado/fail-closed de manifest para `CUS-003`.

Ese contexto coherente deniega perfiles inválidos y aplica tiempo en cada
lectura, pero no revoca todavía de forma durable la familia que descubre
incoherente. Tampoco sustituye pending challenges, rota/eleva una sesión ni
revoca todas las familias: son ampliaciones explícitas del puerto de R5.4d, no
garantías atribuidas a este corte.

No añade DDL, valores de env, rutas, cookies reales, emails, adaptador Resend,
UI, navegación, Worker ni cambios de producción. `CUS-003` permanece
`installed` y `parcial`; la demo pública no adquiere una cuenta ni una
integración externa.

## Criterio de cierre de R5.4d

R5.4d implementará este contrato únicamente cuando:

1. la orquestación persista antes de invocar un adaptador Resend idempotente,
   sin outboxes persistentes y con click/open tracking deshabilitados y
   atestados en preflight;
2. el puerto/repositorio añadan sustitución atómica de pending challenges,
   revocación durable de la familia incoherente y revoke-all por identidad/
   perfil; cualquier DDL para ello, versionado de identidad o rate limit durable
   se apruebe, ensaye y restaure antes de aplicarse;
3. el runtime respete el manifest tipado, resuelva origin/secret refs y registre
   rutas y políticas únicamente bajo una configuración activa válida;
4. el POST inicial emita cookie real/dummy indistinguible y el GET nunca la
   cree; `consume` exija la cookie previa del mismo navegador, origin y CSRF;
5. hechos de sesión/capacidad se auditen de forma durable y atómica, mientras
   fallos y límites solo produzcan métricas agregadas;
6. tests cubran presencia/ausencia, proveedor y tracking aceptados/rechazados,
   replay, sustitución y consumo concurrentes, fragmento limpiado, cookie previa
   del mismo navegador, perfil incoherente, revocación, origin/CSRF, TTL de
   cookies, CSP y límites;
7. E2E y a11y verifiquen la superficie local de cliente y la ausencia total de
   rutas/efectos en la demo;
8. no se declare `CUS-003` operativa ni se despliegue hasta probar entrega real
   en un despliegue aislado autorizado.

## Rollback

Mientras R5.4d no exista, rollback significa conservar `CUS-003` sin flags. Una
vez activa, se bloquea emisión, se ejecuta la operación auditada de revocación
total exigida por R5.4d y se vuelve a `installed`; se conservan evidencias
mínimas y nunca se reactivan tokens ni se contrae D1.
