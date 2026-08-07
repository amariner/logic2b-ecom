# Crear un módulo y un job sin romper el motor

> Guía operativa cerrada en R1.12. Un módulo no es una carpeta: es una
> capacidad con propietario, límites, composición y evidencias verificables.

## 1. Antes de escribir código

1. Localizar o crear el identificador `DOM-NNN` en
   `MATRIZ_CAPACIDADES.md`, con vía y estado reales.
2. Confirmar que el resultado pertenece a un módulo existente. Crear un módulo
   nuevo solo si posee datos, reglas o ciclo de vida propios.
3. Dibujar dependencias hacia APIs públicas. Una dependencia circular se
   rediseña con composición o eventos; no se añade a una allowlist.
4. Si exige migración, dependencia, servicio con coste, cambio PCI o promesa
   comercial, detenerse en la puerta de decisión correspondiente.

## 2. Declarar la capacidad

1. Añadir la definición y dependencias en
   `src/platform/configuration/capability-definitions.ts`.
2. Si admite configuración, tiparla en `CapabilityConfigById` y validarla de
   forma cerrada en `manifest.ts`. No se admiten campos arbitrarios ni secretos.
3. Incorporarla únicamente a los presets técnicos que realmente la soportan.
   Los presets son fixtures de clonabilidad, no planes comerciales.
4. Mantenerla ausente o con todos los flags apagados en la demo pública si
   produce jobs, mutaciones o efectos comerciales.

## 3. Implementar el módulo

El árbol mínimo es el que el caso de uso necesita:

```text
src/modules/<module>/
  domain/           # reglas puras, sin Astro, D1, HTTP ni SDK
  application/      # casos de uso y puertos
  infrastructure/   # D1, proveedor, reloj o transporte
  presentation/     # adaptador HTTP/UI cuando exista
  index.ts           # única API importable por otros módulos
```

- `domain` solo importa su módulo y `shared-kernel`.
- Un módulo ajeno se importa únicamente por su `index.ts`.
- Infraestructura implementa puertos; no decide negocio.
- `src/composition/` es el único lugar que elige adaptadores o une módulos.
- SQL no entra en `src/pages/`; un seed de demo se conecta desde composición,
  nunca se importa desde el módulo de runtime.

Después, registrar un descriptor semver en `module-registry.ts`: propietario de
capacidades, dependencias, permisos, eventos, suscripciones, jobs,
healthchecks, wiki, navegación y rutas. El validador exige propietario único,
detecta ciclos y rechaza superficies duplicadas o ajenas.

## 4. Añadir un job cuando sea necesario

Un trabajo recurrente o único usa siempre `src/platform/jobs/`; no crea su
propia tabla, lock o retry.

1. Declarar su id `<module-id>.<job-id>` en `jobs` del descriptor de módulo.
2. Añadir el descriptor ejecutable en `src/platform/jobs/registry.ts`:
   propietario, scope, capacidad requerida, modo, trigger, timeout, intentos y
   un backoff por reintento.
3. Conectar el handler en `src/composition/job-runner.ts`. El handler recibe
   `AbortSignal`, debe ser idempotente y no debe guardar payload, PII o secretos
   en `platform_job_runs`.
4. Para un job de capacidad, exigir `requiredCapabilityId` de su mismo módulo y
   `jobs=true`. Para mantenimiento de despliegue, limitar explícitamente los
   modos permitidos.
5. Reutilizar `executeJob`: proporciona deduplicación, claim D1, lease, timeout,
   retry, dead-letter, replay y retención. La garantía es at-least-once; la
   idempotencia del efecto sigue perteneciendo al caso de uso.

## 5. Evidencia mínima

- Manifest: estado, flags, configuración inválida y dependencia ausente.
- Registro: propietario único, duplicados, ciclo y API pública.
- Presets: `minimal`, `standard`, `advanced` y demo pública.
- Fallos: timeout, excepción segura y fallback/degradación cuando aplique.
- Concurrencia: dos claims, duplicado del proveedor o carrera de escritura.
- Clonabilidad: dos deployment ids producen composición aislada sin secretos.
- Job: mismo tick deduplicado, lease vencida, retry/dead-letter y replay.
- Arquitectura: allowlist permanece vacía, cero ciclos y cero SQL en páginas.
- Cierre: `pnpm check`, matriz, wiki y ambos roadmaps actualizados.

## 6. Qué no hacer

- Añadir un condicional por cliente o tema en el motor.
- Importar infraestructura o archivos privados de otro módulo.
- Activar un módulo creando navegación sin capacidad/ruta operativa.
- Guardar secretos en manifest, D1, logs o snapshots.
- Inventar un cron sin registro, lock y política de recuperación.
- Marcar una capacidad `actual` solo porque existe su descriptor.
