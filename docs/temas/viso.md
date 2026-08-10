# Tema VISO — ficha de entrega

- **Cola:** `nuevos-temas/bbaf805fad44a7cffddab95cbaf9a5da.jpg` (posición 6)
- **Referencia interna:** `public/images/referencias/19-viso.webp`
- **Colección:** `src/collections/viso.ts` — identidad adoptada: **VISO**
- **Catálogo:** 6 productos · slugs `vis-*` · pantalla, óptica y rendimiento
- **Ruta:** `/demo/tiendas/viso`
- **Estado:** listo; nueve assets finales únicos y tema incorporado al catálogo

## Lectura de la referencia

Escaparate de óptica futurista sobre un fondo casi negro, con una hoja marfil
centrada, hero partido, navegación técnica diminuta y un wordmark enorme que
cruza la zona de campaña. Debajo, la referencia alterna cuatro fichas de gafas
de distinta anchura y cierra con dos campañas verticales. VISO conserva esa
composición, el contraste de escala y la retícula asimétrica, pero usa marca,
modelos, productos, copy y fotografías propios.

En móvil la hoja mantiene su marco oscuro, la navegación secundaria desaparece,
la campaña se convierte en un plano vertical y el wordmark baja a una sección
de copy legible. La rejilla queda en dos columnas y conserva una pieza doble.
Ficha, carrito y checkout usan el chrome compartido para mantener evidente el
recorrido demo y no duplicar lógica comercial.

## Imaginería y prompts finales

`imagegen` integrado falló por red antes de producir el primer asset. Se activó
el fallback autorizado: Soul 2.0 para la campaña cinética y Product Photoshoot
para los productos, el objeto macro y el retrato. Cada solicitud se ejecutó de
forma individual, se inspeccionó y se convirtió a WebP. Se descartaron una
campaña con letras falsas y dos retratos que añadían una interfaz de pantalla;
ninguno de esos resultados forma parte del proyecto.

- `hero-motion.webp` — modelo ficticio con visor humo y barrido lateral sobre
  un estudio marfil vacío.
- `editorial-object.webp` — macro vertical de una pieza óptica plata sobre
  grafito.
- `editorial-portrait.webp` — retrato limpio con montura plata, lente humo y
  guante negro.
- `vis-spectra-01.webp` — pantalla continua humo con patillas negras finas.
- `vis-arc-smoke.webp` — máscara deportiva grafito de geometría angular.
- `vis-orbit-silver.webp` — óvalo estrecho de titanio satinado.
- `vis-axis-black.webp` — rectángulo arquitectónico negro.
- `vis-veil-amber.webp` — visor transparente con lente ámbar degradada.
- `vis-frame-x.webp` — máscara de rendimiento con espejo plata.

## Coste del tema

- **Kit:** colección, seed, `Catalog`, `ProductGrid`, `Filters`, tokens,
  referencia, ficha, nueve assets y cinco capturas finales.
- **Registros:** colección, seed, catálogo comercial, landing, auditoría y
  motor de capturas.
- **¿Hizo falta rozar el motor de comercio?: NO.**
- **Dependencias, migraciones o servicios nuevos:** NO.

## Verificación

- ☑ Nueve assets WebP únicos, optimizados e inspeccionados
- ☑ Escritorio 1440 px y móvil 390×844 revisados con capturas reales
- ☑ Catálogo, ficha, carrito activo y checkout: 0 errores y 0 avisos en 9
  superficies a11y, incluido movimiento reducido
- ☑ Capturas de catálogo `560/900`, móvil y ficha dentro del objetivo de peso
- ☑ E2E local de aislamiento y panel: 37/37 comprobaciones
- ☑ `pnpm check`: 53 suites, 350 tests, 382 archivos Astro y build en verde
