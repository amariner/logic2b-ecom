# Revisión integral y plan de continuación — 2026-08-03

> Fuente de verdad operativa creada tras sincronizar `main` con GitHub en el
> commit `005595c`. Esta revisión manda sobre cualquier estado anterior que dé
> la Fase 9B por cerrada. Cuando Andreu diga **«continúa desarrollando el
> proyecto»**, empezar por el primer bloque pendiente de este documento.

## 1. Estado comprobado

- Rama `main` sincronizada con `origin/main` en `005595c`.
- `pnpm check`: 0 errores, 0 avisos, **158/158 tests** y build Cloudflare verde.
- Auditor de accesibilidad ejecutado sobre los cuatro temas nuevos:
  - Forma: 8/8 superficies, 0 errores y 0 avisos.
  - Noddo: 8/8 superficies, 0 errores y 0 avisos.
  - Sitēga: 8/8 superficies, 0 errores y 0 avisos.
  - Stretch: 8/8 superficies, 0 errores y 0 avisos.
- Revisión visual realizada sobre las capturas versionadas de catálogo y ficha.
- No se modificó código de producto durante la revisión.

## 2. Hallazgo crítico: cuatro tiendas fuera del motor

Forma, Noddo, Sitēga y Stretch son visualmente buenas, pero su recorrido de
compra no utiliza el motor compartido. Cada una implementa:

- un carrito propio en `localStorage` (`<tema>-demo-cart`);
- precios formateados como texto y enviados desde el cliente;
- suma del total en JavaScript del navegador;
- checkout visual que no llama a `/api/cart/quote` ni a
  `/api/checkout/session`;
- confirmación que borra el carrito y redirige a `gracias`;
- lógica duplicada en cuatro conjuntos de rutas.

Esto contradice las invariantes del proyecto: **un motor**, precios
revalidados en servidor, recorrido demostrable de extremo a extremo y temas
que solo cambian presentación. Mientras siga así, estas cuatro experiencias
son conceptos visuales, no tiendas funcionales equivalentes a las anteriores.

Ficheros de entrada del problema:

- `src/pages/demo/tiendas/{forma,noddo,sitega,stretch}/[slug].astro`
- `src/pages/demo/tiendas/{forma,noddo,sitega,stretch}/carrito.astro`
- `src/pages/demo/tiendas/{forma,noddo,sitega,stretch}/checkout.astro`
- `src/pages/demo/tiendas/{forma,noddo,sitega,stretch}/gracias.astro`
- `src/collections/{forma,noddo,sitega,stretch}-products.ts`

## 3. Próximos bloques — orden obligatorio

### C14.1 — Diseñar la unificación funcional — ✅ cerrado 2026-08-04

Objetivo: definir y dejar testeado el contrato que permite que los cuatro temas
usen el mismo carrito, quote, checkout, pedido y gracias que el resto, sin
perder su diseño.

Trabajo:

1. Inventariar qué componentes compartidos ya soportan personalización:
   `ProductPage`, `CartPage`, `CheckoutPage`, `ThanksPage`, `cart-client` y
   `storePaths`.
2. Elegir una única representación de producto: D1/seed y precios en céntimos.
   Los mapas `*-products.ts` no pueden seguir siendo una segunda fuente de
   verdad para el cobro.
3. Definir la frontera de tema para ficha, carrito, checkout y gracias. Debe
   ser presentación/slots/variantes; nunca lógica de precios o pedidos.
4. Añadir tests que fallen mientras cualquiera de esas rutas:
   - use una clave `*-demo-cart`;
   - calcule importes a partir de texto con `replace()`;
   - omita las API compartidas en checkout;
   - duplique el submit simulado.
5. Documentar la decisión en `docs/ROADMAP.md` y, si cambia el contrato de
   temas, en `docs/TEMAS.md` y `docs/CHECKLIST_TEMA.md`.

Criterios de cierre:

- arquitectura acordada en el código mediante tipos/tests, no solo descrita;
- sin nuevas dependencias;
- `pnpm check` verde;
- roadmap actualizado indicando qué tienda migra primero.

Resultado: `src/lib/storefront-contract.ts` fija por tipos las cuatro
superficies, sus hooks/slots de presentación y las fuentes inmutables del motor
(D1/`price_cents`, `cart-client`, quote, checkout y pedido por sesión). Los
componentes compartidos exponen el contrato sin cambiar su UI. La nueva suite
`tests/storefront-contract.test.ts` verifica las rutas canónicas y acota las
cinco señales de bifurcación a una lista cerrada de cuatro temas; cualquier
quinta excepción rompe el check. Documentación de temas corregida: ya no se
aceptan carcasas con producto/checkout paralelo. Verificado con `pnpm check`
(172/172 tests, tipos y build) y E2E completo de 27 pasos contra el Worker
local; demo local reseteada al terminar.

### C14.2 — Migrar una tienda verticalmente

**Es el bloque de la próxima sesión.**

Migrar **Forma** primero: ficha → añadir al carrito compartido → quote de
envío → checkout simulado/Stripe según entorno → pedido → gracias. Forma es la
mejor referencia porque su implementación es sencilla y expone claramente la
diferencia entre capa visual y motor.

Criterios de cierre:

- una sola fuente de producto/precio en D1;
- el navegador no decide precios;
- se conserva la dirección visual en catálogo, ficha, carrito y checkout;
- E2E completo, auditor a11y de Forma y `pnpm check` verdes;
- capturas 1440/375 revisadas.

### C14.3 — Migrar Noddo, Sitēga y Stretch

Aplicar el patrón de Forma sin copiar lógica. Si una necesidad visual obliga a
tocar negocio, parar: es una carencia del contrato del tema, no permiso para
bifurcar el motor.

Criterios de cierre:

- desaparecen todas las claves `noddo-demo-cart`, `sitega-demo-cart`,
  `forma-demo-cart` y `stretch-demo-cart`;
- desaparecen los cuatro checkouts simulados independientes;
- E2E de compra y 32/32 superficies a11y verdes;
- `pnpm check` verde.

### C14.4 — Reconciliar producto, documentación y producción

1. Cambiar cualquier copy que aún distinga implícitamente tiendas funcionales
   y conceptos visuales, una vez que todas sean funcionales.
2. Actualizar README y PRODUCCION:
   - 158 tests o, preferiblemente, no fijar un número que quede obsoleto;
   - recuento real de tiendas y superficies;
   - URL canónica `/temas` en vez de `/estilos` donde no sea historia;
   - retirar «no queda desarrollo pendiente» mientras haya cola de motor.
3. Resolver los TODO de tokens de Noddo y Forma antes de mantener `ready`.
4. Reordenar el roadmap: estado actual al principio; historia en un archivo de
   decisiones/changelog o debajo de una sección histórica.
5. Deploy, reset, Lighthouse y smoke test de producción.

## 4. Backlog posterior a C14

Orden recomendado una vez restaurada la promesa «un motor»:

1. Cerrar el deploy pendiente de F12.2/F12.3 tras el OK de Andreu al copy.
2. F12.4: documento y página indexable para agencias/marca blanca.
3. Observabilidad comercial: visita a demo, CTA, apertura y envío de formulario,
   añadir al carrito y llegada a checkout. Definir consentimiento antes.
4. Leads: aviso fiable, estado operativo y exportación; evitar que D1 sea la
   única bandeja silenciosa si falla Resend.
5. Devoluciones/reembolsos y reposición de stock: flujo mínimo documentado y
   soportado en panel.
6. Feed Google Merchant compatible con Meta y pantalla de integraciones.
7. SEO de negocio: páginas sectoriales y casos de estudio reales, evitando
   páginas programáticas sin valor.
8. Presupuestos automáticos de peso de imagen, JS y LCP en CI.
9. Tests moderados con comercios reales: entender propuesta, elegir tema,
   recorrer tienda y completar contacto.
10. Complementar periódicamente el auditor propio con axe/Lighthouse.

## 5. Diseño, UX, SEO y producto: observaciones conservadas

### Diseño y UX

- La dirección visual es fuerte; Forma y Sitēga son especialmente refinadas.
- No hacen falta más temas ahora: hay variedad suficiente para vender.
- Los temas inmersivos deben conservar orientación y navegación en ficha,
  carrito, checkout y error, aunque su chrome sea propio.
- Evitar enlaces o secciones que parezcan funcionales (`Historias`, `Taller`,
  `Journal`, newsletter) si no tienen destino real.
- Incorporar señales comerciales útiles: stock, variantes, entrega, devolución
  y CTA clara; una campaña editorial no sustituye todo el catálogo.
- Revisar si «Otros temas» añade demasiada fricción frente al antiguo
  conmutador directo para comparar tiendas.

### SEO

- La base técnica es buena: canonical, sitemap, robots, JSON-LD y Lighthouse.
- Priorizar `/agencias`, páginas sectoriales útiles y casos de estudio con
  problema, solución, rendimiento y resultado.
- Convertir `/temas` en guía de elección: sector, tamaño de catálogo, peso de
  fotografía/datos y caso relacionado.
- Preparar Search Console, Bing Webmaster Tools, Merchant Center y medición de
  conversiones para proyectos reales. Lighthouse 100 no equivale a demanda.

### Rendimiento

- Varias imágenes nuevas pesan aproximadamente 500–930 KB.
- Añadir variantes responsive y política AVIF/WebP con presupuesto por página.
- Mantener `width`/`height`, lazy loading bajo el hero y controlar el LCP.

### Producto

- La principal prueba comercial debe ser que diseños radicalmente distintos
  comparten una operación real, no solo que las capturas sean atractivas.
- Explicar el alcance inicial de 50–100 productos y cuándo se incorporan
  búsqueda avanzada, paginación, facetas o integraciones.
- El panel mínimo es una ventaja, pero debe cubrir o explicar cancelaciones,
  incidencias, devoluciones y reembolsos.

## 6. Regla para futuras sesiones

Al recibir **«continúa desarrollando el proyecto»**:

1. sincronizar Git y comprobar que este documento sigue vigente;
2. leer `CLAUDE.md`, `docs/CONTINUAR.md`, la sección «Próxima sesión» del
   roadmap y este documento;
3. ejecutar solo el primer bloque C14 pendiente (ahora C14.2);
4. verificar según el protocolo;
5. actualizar este archivo y el roadmap antes de commit/push;
6. no declarar Fase 9B cerrada hasta completar C14.3.
