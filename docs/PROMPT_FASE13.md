# PROMPT DE INICIO — Fase 13, bloque R1.1

> Pega desde la línea horizontal hasta el final como primer mensaje de una
> sesión nueva abierta en la raíz del repositorio.

---

Continúa el desarrollo de **Logic2B Ecommerce** en el bloque **R1.1 — ADR de
arquitectura modular**. Ejecuta el bloque completo; no te limites a proponer un
plan y no avances a R1.2 en esta sesión.

## 1. Antes de modificar nada

1. Ejecuta `pwd`, `git status --short`, `git branch --show-current` y
   `git fetch`. Compara la rama con `origin/main` sin hacer reset, checkout,
   stash, rebase ni ninguna operación que pueda perder cambios locales.
2. El repositorio puede contener trabajo sin confirmar de otra sesión.
   Inventaría el diff antes de actuar, conserva todos los cambios ajenos y no
   reformatees ni edites archivos no necesarios.
3. Lee completos, en este orden:
   - `CLAUDE.md`, especialmente §2, §14, §16 y §17;
   - `.claude/skills/equipo/SKILL.md`;
   - `.claude/skills/equipo/roles/arquitecto.md`;
   - `.claude/skills/equipo/roles/fullstack.md`;
   - `.claude/skills/equipo/roles/backend.md`;
   - `.claude/skills/equipo/roles/product.md`;
   - `docs/CONTINUAR.md`;
   - `docs/ROADMAP.md`, incluida «Próxima sesión»;
   - `docs/plataforma/README.md`;
   - `docs/plataforma/MATRIZ_CAPACIDADES.md`;
   - `docs/plataforma/ROADMAP.md`, especialmente R1 y R1.1;
   - `docs/plataforma/WIKI_SEO.md`.
4. Ejecuta `pnpm check` para obtener una línea base. Si falla antes de tus
   cambios, diagnostica si es preexistente y no escondas el fallo.
5. Anuncia brevemente qué vas a inspeccionar, qué producirás y qué queda
   expresamente fuera del bloque.

## 2. Contexto que no debes reabrir

- Logic2B Ecommerce **no es un SaaS multiinquilino**. Cada cliente tiene
  despliegue, base, secretos, dominio y observabilidad aislados.
- La plataforma compartida es un **monolito modular**. No propongas
  microservicios, contenedores, una base central de clientes ni infraestructura
  con cuota fija.
- La web pública sigue siendo una demo aislada: escaparates con recorrido local
  y panel de fixtures de solo lectura. No conectes la demo a pagos, emails,
  pedidos o stock reales.
- La paridad se alcanza mediante núcleo nativo, módulo activable, conector o
  servicio gestionado. El panel de cada comercio solo muestra capacidades
  activas.
- Dinero en céntimos, precio revalidado en servidor, stock descontado tras pago,
  webhook idempotente y tarjeta fuera de nuestros servidores son invariantes.
- La matriz de 226 capacidades es el horizonte autorizado, pero el orden del
  roadmap manda. En esta sesión solo toca R1.1.

## 3. Objetivo de R1.1

Convertir la arquitectura modular deseada en decisiones precisas y checks
ejecutables suficientes para que R1.2 pueda implementar el capability manifest
sin volver a decidir fronteras.

Este bloque es de **arquitectura comprobable**, no de funcionalidad comercial.
No debe cambiar ninguna respuesta HTTP, tabla, ruta, pantalla ni recorrido de
compra.

## 4. Trabajo obligatorio

### A. Inventario de arquitectura real

Inspecciona el repositorio completo con `rg`/`rg --files` y documenta:

- puntos de entrada: Worker, middleware, páginas servidor, APIs y cron;
- módulos de negocio actuales en `src/lib/`;
- acceso a D1 y lugares donde SQL está embebido en páginas/endpoints;
- dependencias entre carrito, quote, checkout, pago, pedido, stock, email y
  administración;
- frontera entre demo pública, motor clonable, colecciones y temas;
- configuración, seed, migraciones, tests y scripts;
- SDKs o detalles de infraestructura que hoy se filtran al dominio;
- ciclos, imports invertidos, duplicaciones y acoplamientos que dificulten el
  manifest de R1.2.

No describas una arquitectura ideal como si ya existiera. Separa claramente:
`actual`, `deuda aceptada` y `objetivo`.

### B. Mapa de módulos objetivo

Fija nombres, responsabilidad, datos poseídos, API pública y dependencias
permitidas para, como mínimo:

- `platform/configuration`;
- `catalog`;
- `pricing`;
- `inventory`;
- `cart`;
- `checkout`;
- `payments`;
- `orders`;
- `fulfillment`;
- `customers`;
- `notifications`;
- `integrations`;
- `shared-kernel`, reducido a primitivas realmente compartidas;
- capas `application`, `domain`, `infrastructure` y `presentation` cuando sean
  útiles, sin crear carpetas ceremoniales vacías.

Define una dirección de dependencias inequívoca. Como principio:

```text
presentation -> application -> domain
infrastructure -> ports definidos por application/domain
composition root -> módulos + adaptadores
domain -X-> Astro, D1, Stripe, Resend o rutas HTTP
```

Si el código actual obliga a matizar este esquema, documenta la razón y la ruta
de salida; no inventes excepciones silenciosas.

### C. ADRs obligatorios

Crea una carpeta de ADRs si no existe y registra al menos estas decisiones:

1. monolito modular y aislamiento por despliegue;
2. límites de dominio y dirección de dependencias;
3. puertos/adaptadores y composition root;
4. ciclo de vida de capacidades: ausente, instalada, desactivada, activa,
   degradada y retirada;
5. estrategia de transición desde la estructura actual sin big-bang.

Cada ADR debe contener: contexto, decisión, alternativas consideradas,
consecuencias, invariantes, deuda conocida y señal que obligaría a revisarlo.
Usa estado `accepted` únicamente para decisiones ya mandatadas; no finjas que
una propuesta abierta está aprobada.

### D. Checks arquitectónicos ejecutables

Añade tests Vitest o un script comprobable, **sin dependencias nuevas**, que
proteja las reglas que ya pueden exigirse hoy. Debe cubrir como mínimo:

- imports prohibidos desde dominio hacia Astro/Cloudflare/Stripe/Resend;
- dependencias entre módulos contrarias al mapa aprobado;
- ciclos dentro del alcance que pueda analizarse de forma fiable;
- nuevas excepciones no documentadas.

Si existen infracciones actuales que no pueden corregirse sin ampliar R1.1,
usa una allowlist explícita y mínima con:

- archivo exacto;
- regla infringida;
- motivo;
- bloque futuro que la elimina.

La allowlist solo puede mantenerse o reducirse. Prohíbe comodines amplios,
carpetas enteras y tests que siempre pasen. Las infracciones nuevas deben romper
`pnpm check`.

### E. Plan de transición

Deja una secuencia incremental desde el código actual al mapa objetivo:

- qué se mueve en R1.2–R1.5;
- qué permanece temporalmente y por qué;
- dónde vivirá el composition root;
- cómo se evita una reescritura masiva;
- cómo se preservan demo, clonabilidad y contratos HTTP;
- cómo se medirá que el acoplamiento disminuye.

No implementes todavía el manifest, registro de módulos, eventos ni outbox.

### F. Documentación y wiki

- Actualiza `docs/plataforma/MATRIZ_CAPACIDADES.md` solo si R1.1 cambia el estado
  real de una capacidad; no marques R1.2 como hecha.
- Marca R1.1 cerrado en ambos roadmaps, con fecha y evidencia, únicamente si
  cumple todos los criterios.
- Cambia «Siguiente bloque» a **R1.2 — Capability manifest tipado**.
- Crea un borrador interno de la futura página
  `/funcionalidades/arquitectura-modular-ecommerce/`. Debe seguir
  `docs/plataforma/WIKI_SEO.md`, estar fuera de rutas públicas y diferenciar
  claramente lo disponible de lo diseñado.
- Actualiza índices de documentación si añades nuevas carpetas o fuentes de
  verdad.

## 5. Fuera de alcance — prohibido en R1.1

- migraciones o cambios de esquema D1;
- dependencias npm nuevas;
- capability manifest o feature flags funcionales;
- mover masivamente archivos solo para que el árbol «parezca modular»;
- modificar APIs, rutas, middleware, checkout, webhook, precios, stock o emails;
- cambiar la UI, landing, demo, SEO público o navegación;
- desplegar a producción;
- comenzar R1.2;
- publicar páginas de wiki indexables;
- cambiar precios, plazos o promesas comerciales.

Si aparece una necesidad real de cualquiera de estos puntos, documenta el veto
y detente antes de ejecutarlo.

## 6. Verificación obligatoria

Ejecuta, como mínimo:

```bash
pnpm check
git diff --check
```

Ejecuta primero el test arquitectónico de forma aislada mientras lo desarrollas.
Como no debe cambiar el comportamiento de compra ni la UI, E2E, auditoría a11y,
Lighthouse y deploy no son necesarios; si acabas tocando una superficie que los
requiera, significa que el alcance se ha desviado y debes justificarlo o revertir
tu cambio, sin borrar trabajo ajeno.

Revisa manualmente que:

- cada regla escrita en ADR tenga reflejo en un check o una deuda explícita;
- cada excepción tenga propietario y bloque de salida;
- los diagramas y ejemplos coincidan con imports reales;
- R1.2 pueda empezar sin ambigüedad arquitectónica;
- la demo y el runtime no hayan cambiado.

## 7. Git y cierre

- No descartes, sobrescribas ni incluyas por accidente cambios preexistentes.
- Antes de preparar un commit, compara el diff final con el inventario inicial.
- Si el árbol ya estaba sucio, stagea únicamente archivos atribuibles a R1.1.
  Si un archivo necesario mezcla cambios ajenos imposibles de separar con
  seguridad, no lo stages: informa del motivo.
- Solo crea commit/push si lo permite el protocolo vigente y todas las pruebas
  están verdes. Nunca uses `--force`.

Entrega al cerrar:

1. resultado alcanzado, no una narración cronológica;
2. mapa de módulos y decisiones principales;
3. deuda/allowlist exacta y bloque que la elimina;
4. archivos creados o modificados;
5. comandos de verificación y resultados;
6. confirmación de que no hubo migración, dependencia, cambio runtime ni deploy;
7. siguiente bloque canónico: R1.2;
8. sign-off del consejo:
   `arquitecto · fullstack · backend · product`, con ✓ o ⚠ y destino de cada
   advertencia.

No termines la sesión dejando R1.1 «en progreso» si todavía puedes completar
trabajo seguro dentro de su alcance. Si un veto real impide cerrarlo, documenta
exactamente el bloqueo y no marques el bloque como terminado.
