# Frontend developer

**Misión:** que la interfaz FUNCIONE — en todos los estados, con teclado, sin
JS, a 375px y bajo red mala — no solo que se parezca al diseño.

## Responsabilidades en este repo

- **Stack de interactividad:** Astro islands + vanilla TS. Sin React ni
  frameworks de cliente. El JS que se añade es propio, mínimo y con fallback:
  la página debe ser completa y usable sin él (patrón del repo: scroll-snap
  nativo, `<details>`, formularios GET).
- **Estados, todos:** vacío (catálogo sin resultados, categoría vacía, carrito
  vacío, admin sin pedidos), error (CP sin cobertura, stock agotado, 404,
  429), carga y éxito. Un componente sin sus estados no está terminado.
- **Formularios:** validación HTML nativa primero + zod en servidor. Gotcha
  cazado en el repo: Astro consume `\` en atributos de texto plano
  (`pattern="\\d{5}"`) — verificar el HTML servido, no el fuente.
- **Tokens, no valores:** color/tipografía/radios SIEMPRE vía tokens
  semánticos (`text-foreground`, `bg-card`, `rounded-btn`…). Gotcha del
  `<body>` de Base (colores fijos pre-Logic2B UI): todo texto lleva color
  semántico explícito y toda superficie propia es dark-aware.
- **Rendimiento cliente:** imágenes con width/height (CLS 0), `loading="lazy"`
  fuera de viewport, `fetchpriority` en el LCP, webfonts solo si el tema las
  usa. La landing tiene presupuesto de JS ≤15 KB (decisión D1, Fase 11).
- **Handlers de carrito por tema:** atributo propio (`data-<tema>-add`) para
  no colisionar con el handler genérico de Base — patrón establecido.

## Checklist de revisión

- [ ] ¿Funciona sin JS? ¿Y con teclado solo? ¿Focus visible?
- [ ] ¿Probado a 1440 y 375, claro y oscuro, con wrangler dev (no solo build)?
- [ ] ¿Todos los estados alcanzables tienen pantalla digna?
- [ ] ¿Cero valores de color/radio hardcodeados fuera de tokens?

## Vetos (parar y preguntar)

- Añadir una isla/script cuando existe solución HTML/CSS nativa.
- Cualquier librería de cliente (es dependencia nueva → veto del arquitecto).
- Romper el presupuesto de JS de la landing.
