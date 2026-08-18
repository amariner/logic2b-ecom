# Operación de persistencia passwordless (`CUS-003`)

## Estado del contrato

R5.4b materializa ADR-0042 mediante la migración expand-only `0039`, el
repositorio D1 interno y backup esquema 33. `CUS-003` permanece `installed` e
inerte: no hay proveedor, secreto, email/WebAuthn, cookie, endpoint, UI,
navegación ni permiso para leer pedidos, direcciones o derechos de datos.

Las cuatro tablas separan identidad autenticable, familia, sesión y challenge.
D1 solo conserva HMAC/digests SHA-256 y referencias opacas; no guarda email,
proof/token crudo, IP, user-agent, passkey, URL de acceso ni clave privada. Los
scopes instalados son explícitos: `customer:self` es inherente a toda sesión y
`customer:sessions:revoke` se representa mediante una columna booleana.

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

## Activación y gates restantes

Persistir autenticación no autoriza a exponerla. R5.4c requiere una decisión
explícita del propietario antes de elegir y configurar:

1. proveedor email magic link y/o WebAuthn, dominio canónico, RP ID y origins;
2. secreto HMAC/token por despliegue y política de rotación;
3. cookie host-only `HttpOnly`/`Secure`/`SameSite`, CSRF y CSP;
4. rate limit, trabajo comparable y observabilidad agregada anti-enumeración;
5. recuperación, cambio de contacto, step-up, alertas y runbook;
6. copy, consentimiento/privacidad y entrega real de email si aplica.

Hasta resolver esos gates no se registra ninguna ruta o navegación y
`CUS-003` no pasa a `active`. R5.5 tampoco concede acceso por el mero hecho de
existir una sesión: cada recurso exigirá ownership y scopes propios.

## Backup, reconciliación y rollback

El backup esquema 33 inserta identidades, familias, sesiones por generación y
challenges al final. `PRAGMA defer_foreign_keys` conserva las referencias entre
sesión anterior/siguiente y challenge consumido. Restaurar exige una base con
`0039` aplicada.

La reconciliación comprueba FKs, una generación por familia, un digest por
token/challenge, TTL, sesión activa única, enlace de rotación bidireccional y
challenges consumidos por una sesión de la misma identidad. Los informes son
agregados y nunca imprimen hashes, ids de sujeto o claves de idempotencia.

El rollback seguro es de comportamiento: mantener `CUS-003` sin flags, bloquear
emisión y revocar familias si alguna vez se activa. No contraer tablas ni
reactivar tokens antiguos; retirar datos exige política y migración propias.
