# ADR-0039 — Perfil deduplicable con identidad opaca y guest checkout intacto

- Estado: aceptado e implementado localmente; rollout remoto pendiente
- Fecha: 2026-08-17
- Bloque: R5.1
- Capacidades: `CUS-001`, `CUS-002`

## Contexto

El motor ya compra como invitado y congela email, nombre y dirección en cada
pedido. R5.1 debe poder relacionar compras y direcciones recurrentes sin
convertir el perfil en una cuenta, sin exigir registro y sin reescribir la
historia comercial. El email es el único identificador disponible en checkout,
pero un hash SHA-256 directo sería enumerable y dos altas concurrentes podrían
crear perfiles duplicados si la deduplicación fuera `SELECT` seguido de
`INSERT`.

Consentimiento, autenticación passwordless, acceso al historial, derechos de
datos y plazos de conservación pertenecen a R5.2–R5.5. No deben aparecer como
defaults legales o promesas implícitas de este bloque.

## Decisión

1. `CUS-001` continúa activo y suficiente para comprar. `CUS-002` queda
   `installed`, sin rutas, navegación, jobs ni efectos hasta un rollout por
   proyecto posterior a R5.2. Un pedido puede conservar
   `customer_profile_id = NULL` para siempre.
2. El perfil usa un identificador interno opaco, no email ni número secuencial
   público. El email se normaliza con NFKC, trim y lowercase para construir su
   identidad canónica.
3. El índice deduplicable es HMAC-SHA-256 con namespace y un secreto aleatorio
   propio de cada despliegue. El secreto no vive en D1, logs, backup, eventos ni
   navegador. Un SHA-256 sin secreto o una búsqueda pública por email quedan
   prohibidos.
4. La implementación D1 resuelve alta/reutilización en una única transacción,
   con `UNIQUE(email_identity_hash)`. Ante una carrera, el perdedor relee la
   fila ganadora; nunca crea una segunda identidad ni devuelve diferencias que
   permitan enumerar si un email existe.
5. Una coincidencia única y activa puede reutilizarse. Duplicados heredados,
   perfiles fusionados o señales con identidades distintas quedan
   `requires_review`; no existe merge automático por similitud de nombre,
   teléfono o dirección.
6. Fusionar exige operador/revisión explícitos y versiones optimistas de origen
   y destino. El contrato inicial solo permite fusionar la misma identidad
   HMAC. Relacionar identidades distintas espera un flujo que verifique su
   propiedad, previsto con cuentas opcionales en R5.4.
7. Las direcciones guardadas son revisiones append-only. Editar genera una
   versión nueva y cierra la anterior; no cambia `orders.address_json`,
   documentos, fulfillments ni presupuestos ya emitidos.
8. El vínculo pedido→perfil es nullable y solo añade procedencia. No copia de
   vuelta el email o dirección del perfil ni usa estos datos para recalcular un
   pedido. Los snapshots del pedido continúan siendo la autoridad histórica.
9. El perfil no equivale a autenticación, sesión, marketing consentido, portal
   de pedidos, saldo, empresa B2B ni derecho a ver información. Esos módulos
   requieren sus propias capacidades y pruebas.
10. PII e identidad HMAC no se incluyen en eventos de dominio genéricos,
    observabilidad o mensajes de error. Las futuras APIs deben responder de
    forma indistinguible a alta/reutilización y aplicar rate limit.

## Contrato previo al esquema

`src/modules/customers/` contiene:

- normalización y HMAC Web Crypto sin dependencia Node;
- agregado de perfil activo/fusionado con versión optimista;
- resolución `create`, `link_existing` o `requires_review`;
- revisiones inmutables de dirección;
- asociación guest/perfil que no admite snapshots de pedido;
- puerto de repositorio que exige resolución atómica, append de dirección,
  asociación opcional y merge revisado.

## Gate D1 implementado

La migración expand-only `0036_customer_profiles.sql` materializa:

- `customer_profiles` con id opaco, email normalizado, HMAC único, estado,
  destino de merge y versión;
- `customer_address_revisions` con identidad/revisión compuesta, vigencia y
  datos de entrega;
- `customer_profile_merges` append-only con actor, versiones e idempotencia;
- columna nullable `orders.customer_profile_id` con FK e índice;
- triggers/checks de estado, versión, unicidad, append de dirección y merge;
- inclusión en backup/restore y rehearsal sin imprimir PII.

No hay backfill automático desde `orders.email`: compartir texto no demuestra
que dos pedidos deban pertenecer al mismo perfil. El eventual enlace histórico
requerirá una política y verificación separadas.

## Fronteras

- No se crea contraseña, magic link, sesión ni token de acceso.
- No se captura ni infiere consentimiento.
- No se fija retención, base legal, borrado o excepción fiscal.
- No se expone búsqueda de email, existencia de perfil ni hash de identidad.
- Checkout solo compone la asociación cuando un manifest activa explícitamente
  `CUS-002.sideEffects` y el despliegue aporta el secreto; en otro caso sigue
  siendo guest. No se añaden UI, rutas, cuentas ni autoservicio.

## Verificación

- canonicalización equivalente y rechazo de controles/valores inválidos;
- HMAC determinista para el despliegue y distinto entre secretos;
- alta, coincidencia, carrera/duplicado y conflicto explícitos;
- guest checkout representado por asociación nula;
- revisión de dirección sin mutar la versión previa;
- merge con revisión, hash coincidente y control optimista;
- repositorio D1 y checkout opcional convergen bajo carrera sin enumeración;
- backup esquema 30 y rehearsal/restore conservan los datos legacy;
- presets/registro mantienen `CUS-002` instalado y sin superficies.

## Rollback

Desactivar `CUS-002.sideEffects` impide nuevas asociaciones
sin borrar perfiles, revisiones o vínculos necesarios para privacidad y
trazabilidad.
