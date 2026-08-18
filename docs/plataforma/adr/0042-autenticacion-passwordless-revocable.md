# ADR-0042 — Autenticación passwordless opaca, rotatoria y revocable

- Estado: aceptado; persistencia local implementada y superficie decidida en ADR-0043, implementación pendiente
- Fecha: 2026-08-18
- Bloque: R5.4a
- Capacidad: `CUS-003`

## Contexto

Guest checkout sigue siendo la base del producto. Algunos proyectos necesitan
que una persona vuelva, administre sesiones y, en R5.5, acceda a operaciones de
autoservicio. Un perfil deduplicado no es una cuenta: relacionar pedidos por una
identidad HMAC no prueba que quien controla el navegador sea el sujeto.

Una cuenta passwordless añade riesgos propios: enumerar emails, robar o repetir
magic links, fijar sesiones, ampliar indefinidamente su vida, confundir una
cuenta fusionada con autorización, aceptar un WebAuthn assertion de otro origen
o reutilizar el login simple del admin. Un JWT sin estado tampoco permite
revocar inmediatamente una sesión comprometida.

## Decisión

1. `CUS-003` es opcional. Activarla nunca vuelve obligatoria una cuenta para
   comprar ni modifica el guest checkout.
2. `customer_auth_identity` será una identidad autenticable separada de
   `customer_profiles`. Mantiene una referencia opaca al perfil y una identidad
   de contacto HMAC; no almacena email en challenges o sesiones. Crear perfil,
   comprar o consentir marketing no crea credenciales.
3. El dominio reconoce `email_magic_link` y `webauthn` detrás de un
   `PasswordlessProofProvider`, sin recibir dependencias de SDK ni decidir
   proveedor. ADR-0043 supersede la elección de superficie: solo
   `email_magic_link` es inicial y WebAuthn queda diferido.
4. Un challenge contiene solo referencias y digest, nunca proof/token crudo.
   Es de un solo uso, versionado, revocable y con TTL máximo de 15 minutos. Un
   consumo idéntico se reproduce; otro consumo, proof o sesión falla con una
   respuesta estable.
5. La respuesta pública al inicio es idéntica exista o no identidad y acepte o
   no el proveedor. Rate limit, trabajo comparable y observabilidad agregada son
   obligatorios; no se inventa un `sleep` fijo como defensa de timing.
6. Una sesión usa un token aleatorio opaco. D1 solo guardará su digest. No es un
   JWT autocontenido: debe poder rotarse, revocarse por sesión o familia y
   comprobarse contra estado servidor.
7. La rotación crea un token y `session_id` nuevos, invalida el anterior en la
   misma transacción, conserva la familia, incrementa generación y nunca eleva
   scopes. Máximo: 7 días por ventana y 30 días absolutos desde la emisión de la
   familia; cada proyecto puede acortarlos, no ampliarlos.
8. R5.4a solo reconoce `customer:self` y `customer:sessions:revoke`. El primero
   vincula la sesión a su propia identidad, no concede por sí mismo leer
   pedidos, direcciones, devoluciones, consentimientos o derechos de datos.
   R5.4c limita la sesión inicial exactamente a `customer:self`; el segundo
   scope no se concede hasta que un bloque posterior diseñe step-up y una
   transición atómica propia. Los permisos de recurso pertenecen a R5.5 y
   exigen ownership probado.
9. Cambiar/vincular contacto, actuar sobre derechos, exportar datos y revocar
   todas las sesiones requieren step-up y políticas posteriores. Un merge de
   perfiles no transfiere ni fusiona sesiones silenciosamente.
10. Admin y cliente usan dominios, cookies y secretos separados. Nunca se
    reutiliza `admin_session` ni `ADMIN_COOKIE_SECRET`.

## Threat model y controles obligatorios

| Amenaza | Control contractual |
|---|---|
| Enumeración de email/cuenta | Respuesta, código y forma uniformes; rate limit por señales no enumerables. |
| Robo/replay de magic link | Entropía alta, digest durable, TTL ≤15 min, un uso y host/path fijo. |
| Token en logs/referrer | El transporte lleva proof+id de challenge solo en el fragmento inicial y lo limpia antes de cualquier POST; no entra en query, logs, métricas ni URLs posteriores. D1 conserva el challenge y solo el digest del proof. |
| Open redirect | Continuación relativa desde allowlist; el proveedor no decide destino libre. |
| Session fixation | `session_id` y token nuevos al autenticar y en cada rotación. |
| Robo de cookie | `HttpOnly`, `Secure`, host-only, `SameSite`, CSP/CSRF y revocación servidor en el bloque de superficie. |
| Sesión eterna | Ventana ≤7 días, corte absoluto ≤30 días y rotación sin extenderlo. |
| WebAuthn de otro sitio | Adapter verifica RP ID, origin, challenge, presencia/verificación y contador cuando aplique. |
| Cuenta ≠ ownership | Scopes mínimos; R5.5 prueba asociación antes de cada recurso. |
| Perfil fusionado/revocado | Denegar siempre y nunca reasignar en silencio; antes de abrir HTTP, añadir revocación familiar durable y atómica. |

## Contrato instalado

`src/modules/customers/domain/passwordless-auth.ts` aporta:

- identidad autenticable distinta del perfil;
- challenge de un solo uso con consumo/retry, revocación y expiración;
- emisión de sesión únicamente desde challenge consumido;
- rotación con token anterior inactivo, generación y corte absoluto;
- revocación idempotente y decisión por identidad/scope/tiempo;
- acknowledgement público anti-enumeración.

Los puertos de aplicación separan persistencia transaccional y proveedor de
proof. R5.4c corrige el proveedor a `prepare`/`deliver` alrededor de la
persistencia, restringe emisión a challenges `sign_in`, exige contexto activo y
coherente para resolver sesiones, valida replay exacto y hace restaurable el
estado final bajo los triggers. `CUS-003` queda `installed`, sin flags, rutas,
navegación, jobs ni efectos externos.

El corte instalado deniega el contexto si perfil/identidad/familia dejan de ser
coherentes, pero no ejecuta todavía la revocación durable al detectarlo. El
repositorio tampoco sustituye pending challenges ni revoca todas las familias
por identidad/perfil. ADR-0043 convierte esas operaciones, el step-up y la
elevación de scope en gates explícitos del bloque de superficie.

## Fronteras de R5.4a

- No hay DDL, repositorio D1, cookie, endpoint, formulario o email real.
- No se elige Resend, proveedor WebAuthn, dominio, RP ID o copy legal.
- No se almacena proof, email, user-agent, IP, passkey o clave privada.
- No se habilita recuperación de cuenta, cambio de email o vinculación.
- No se concede acceso a pedidos, direcciones, RMA o datos personales.
- No se modifica el login administrativo ni Cloudflare Access.

## Persistencia autorizada

Andreu autorizó expresamente R5.4b el 2026-08-18. `0039` separa identidades,
challenges y familias/sesiones; consumo+sesión y rotación anterior+nueva son
atómicos, solo se indexan hashes/referencias opacas y el backup esquema 33 se
ensaya sin secrets ni proofs. La D1 local sirve el corte; producción no cambia.

## Gates posteriores

Abrir una superficie requiere además proveedor elegido, secreto por despliegue,
origin/host allowlist, cookie segura, CSRF, rate limit, respuestas uniformes,
auditoría durable y atómica sin PII, recuperación y runbook. También requiere
las operaciones transaccionales de sustitución de pending challenges,
revocación de familia incoherente y revoke-all. WebAuthn exige pruebas de RP/
origin y contadores; email exige entrega real, URL canónica y protección del
token.

R5.4c resuelve esas decisiones en
[ADR-0043](0043-superficie-passwordless-email-segura.md): el primer método será
magic link por Resend directo con orden `prepare → persist → deliver`, origen
exacto, sesión/cookie propia, CSRF/CSP, rate limit por capas y recuperación sin
bypass. También instala el contrato de manifest tipado/fail-closed y los
endurecimientos internos anteriores. Esto no abre todavía HTTP/UI, no configura
env ni activa `CUS-003`; proveedor, transporte y cualquier DDL adicional
pertenecen a R5.4d. WebAuthn continúa diferido.

## Verificación

- challenge TTL acotado, consumo único y retry idéntico;
- proof incorrecto/caducado indistinguible externamente;
- sesión imposible sin challenge consumido de la misma identidad;
- rotación invalida el token anterior, conserva scopes y respeta corte absoluto;
- revocación idempotente y decisiones por sujeto/scope;
- presencia/ausencia de identidad devuelve el mismo acknowledgement;
- `CUS-003` instalada sin ninguna superficie o efecto.

## Rollback

Mientras no existan superficies, mantener `CUS-003` sin flags bloquea toda
emisión. Cuando existan sesiones, el rollback será de comportamiento: bloquear
emisión, ejecutar la operación auditada de revocación total que deberá añadir
el bloque de superficie y conservar evidencia mínima según la política
aprobada; nunca reactivar tokens antiguos.
