# Asistente de las demos

La guía de Logic2B Ecommerce acompaña al visitante por las demos públicas.
Sigue el patrón de tarjeta flotante de `camp.logic2b.com`, con explicaciones
propias de ecommerce. Es una guía editorial, sin llamadas a modelos ni servicios.

## Entrada y navegación

- «Ver demo» en la cabecera y «Ver una tienda demo» en la portada abren
  `/demo/tiendas/arce?tour=1`. La guía también aparece en la primera entrada
  directa a una demo en esa pestaña.
- El parámetro `tour=1` reabre la guía explícitamente y se consume sin alterar
  filtros ni el resto de la URL. Recargar no deshace un cierre posterior.
- Explica tienda, ficha, cesta, compra simulada, pedidos, detalle, envíos,
  emails y productos. La confirmación tiene su propia explicación. El acceso
  al gestor pide al visitante la contraseña pública «demo»; la guía nunca la
  introduce ni envía.
- La explicación sigue la página realmente visitada. «Elegir un paso» permite
  saltar entre pantallas; el detalle del pedido usa un enlace real del panel.
- Minimizar, cerrar y terminar se conservan en `sessionStorage` de la pestaña.
  El botón «Guía de la demo» permite reabrirla. «Reiniciar» vuelve al catálogo
  de la tienda actual; no borra el carrito ni cambia datos del panel.
- Sin almacenamiento disponible, la guía funciona en memoria durante la página.
  Sin JavaScript, las pantallas mantienen su comportamiento anterior.

## Límites de la demostración

La compra solo modifica el carrito y la confirmación de este navegador. No
crea pedidos, descuenta stock, cobra ni envía emails. Los pedidos del gestor
son ejemplos independientes: la guía lo explica antes de entrar al panel.

El componente solo se renderiza con `DEMO_MODE=true` en los layouts públicos
de tienda, admin y login. No se añade a propuestas privadas ni a la portada.
Dentro de los iframes de las fichas de tema permanece oculto para no interrumpir
la previsualización. No cambia autenticación, APIs, permisos ni datos.

## Interfaz y mantenimiento

`src/components/store/DemoAssistant.astro` contiene la tarjeta y sus estilos.
Los textos, la resolución de la pantalla y el estado de sesión viven en
`src/modules/demo-support/presentation/guide/`, separados del motor.
El componente recibe las rutas registradas de la colección y un producto real
de sus fixtures. El estado recuperado valida los destinos de navegación.

Es una región complementaria, no modal: permite interactuar con la demo.
Escape minimiza, los controles tienen foco visible y al cerrarla el foco
vuelve al botón de apertura. «Ver en pantalla» señala la zona relevante y,
en móvil, minimiza la tarjeta para dejarla visible. El final de la página
reserva espacio para alcanzar controles bajo la tarjeta. Usa los tokens
neutros comunes, responde a `.dark` y respeta movimiento reducido.

Para verificar: `pnpm check`, `pnpm preview` y `pnpm test:e2e`. Ejecutar
las auditorías de navegador de forma secuencial, porque comparten perfil:
`node scripts/a11y-audit.mjs --only=arce`, `--only=forma`, `--only=admin`.
La revisión manual debe incluir entrada desde la portada, una compra simulada,
el acceso al gestor, cierre y recarga, cambio de tema, reinicio, teclado,
375/1440 px, oscuro y el iframe de `/temas/arce`.
