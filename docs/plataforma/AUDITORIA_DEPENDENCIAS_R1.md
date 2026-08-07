# Auditoría de dependencias al cierre de R1

Fecha: 2026-08-07. Alcance: dependencias directas, imports reales y advisories
del lockfile. No se añadió ni actualizó ninguna dependencia en R1.12.

## Inventario directo

Producción: Astro, adaptador Cloudflare, Tailwind/Vite, Stripe y Zod. Desarrollo:
Astro Check, tipos de Workers, TypeScript, Vitest y Wrangler. Son once paquetes
directos; no hay librería de UI, cola, logger, ORM o cliente HTTP adicional.

Los imports externos observados bajo `src/`, `seed/`, `scripts/` y `tests/`
corresponden a esos paquetes o a módulos nativos de Node. Stripe solo aparece en
su adaptador; los checks arquitectónicos impiden SDKs de proveedor en dominio.

## Comandos reproducibles

```bash
pnpm list --depth 0
pnpm why astro undici ws sharp js-yaml
pnpm audit --prod --audit-level high
pnpm check
```

## Resultado de seguridad

`pnpm audit --prod --audit-level high` informa 31 advisories en el árbol
resuelto: 6 bajos, 15 moderados y 10 altos. Los altos se concentran en:

- Astro 5.18.2: dos advisories cuyo parche publicado requiere Astro 6;
- la copia de Wrangler/Miniflare que arrastra `@astrojs/cloudflare`: versiones
  antiguas de `undici` y `ws`; el Wrangler directo ya resuelve ramas más nuevas;
- `sharp` 0.34.5 heredado por Astro/Miniflare, cuyo parche anunciado es 0.35;
- `js-yaml` 4.3.0 transitivo de Astro, con parche en 4.3.1.

No se aplican overrides transitivos ni una migración mayor a ciegas. Astro 5 y
el adaptador Cloudflare forman parte del stack cerrado del proyecto; saltar a
Astro 6 requiere una sesión de compatibilidad con build Worker, rutas híbridas,
bindings D1, E2E y despliegue. El hallazgo queda visible y no se presenta como
resuelto.

## Decisión y siguiente control

- R1.12 cierra la auditoría, no la remediación: no cambia código servido ni
  introduce una combinación de paquetes no soportada.
- Antes de cualquier siguiente despliegue se debe volver a ejecutar el audit y
  evaluar una actualización coordinada de Astro/adaptador; si los parches siguen
  exigiendo major, la actualización necesita la puerta de decisión técnica.
- Un override solo es aceptable si `pnpm why`, tests, build y runtime Worker
  demuestran compatibilidad. Silenciar el audit o bajar su severidad no lo es.
