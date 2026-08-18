# ADR-0042 — Autenticación passwordless opaca, rotatoria y revocable

- Estado: aceptado; persistencia local implementada, proveedor y superficies pendientes
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
3. Los métodos iniciales son `email_magic_link` y `webauthn`, detrás de un
   `PasswordlessProofProvider`. El dominio no recibe dependencias de SDK ni
   decide proveedor.
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
   Esos permisos pertenecen a R5.5 y exigen ownership probado.
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
| Token en logs/referrer | Proof se consume en frontera; no entra en logs, métricas, URLs posteriores ni D1. |
| Open redirect | Continuación relativa desde allowlist; el proveedor no decide destino libre. |
| Session fixation | `session_id` y token nuevos al autenticar y en cada rotación. |
| Robo de cookie | `HttpOnly`, `Secure`, host-only, `SameSite`, CSP/CSRF y revocación servidor en el bloque de superficie. |
| Sesión eterna | Ventana ≤7 días, corte absoluto ≤30 días y rotación sin extenderlo. |
| WebAuthn de otro sitio | Adapter verifica RP ID, origin, challenge, presencia/verificación y contador cuando aplique. |
| Cuenta ≠ ownership | Scopes mínimos; R5.5 prueba asociación antes de cada recurso. |
| Perfil fusionado/revocado | Resolver explícitamente la identidad y revocar familia; nunca reasignar en silencio. |

## Contrato instalado

`src/modules/customers/domain/passwordless-auth.ts` aporta:

- identidad autenticable distinta del perfil;
- challenge de un solo uso con consumo/retry, revocación y expiración;
- emisión de sesión únicamente desde challenge consumido;
- rotación con token anterior inactivo, generación y corte absoluto;
- revocación idempotente y decisión por identidad/scope/tiempo;
- acknowledgement público anti-enumeración.

Los puertos de aplicación separan persistencia transaccional y proveedor de
proof. `CUS-003` queda `installed` en advanced, sin flags, rutas, navegación,
jobs ni efectos.

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
auditoría sin PII, recuperación y runbook. WebAuthn exige pruebas de RP/origin y
contadores; email exige entrega real, URL canónica y protección del token.

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
emisión. Cuando existan sesiones, el rollback será de
comportamiento: bloquear emisión, revocar familias y conservar evidencia mínima
según la política aprobada; nunca reactivar tokens antiguos.
