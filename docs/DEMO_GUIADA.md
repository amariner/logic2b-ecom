# Asistente de las demos

La guía de Logic2B Ecommerce acompaña al visitante por las demos públicas.
Sigue el patrón de tarjeta flotante de `camp.logic2b.com`, con explicaciones
propias de ecommerce. Es una guía editorial, sin llamadas a modelos ni servicios.

## Entrada y navegación

- «Ver demo» en la cabecera y «Ver una tienda demo» en la portada abren
  `/demo/tiendas/traza?tour=1`. La guía también aparece en la primera entrada
  directa a una demo en esa pestaña.
- El parámetro `tour=1` reabre la guía explícitamente y se consume sin alterar
  filtros ni el resto de la URL. Recargar no deshace un cierre posterior.
- Explica diez pasos: tienda, ficha, cesta, compra simulada, confirmación,
  pedidos, detalle, envíos, emails y productos.
- «Añadir y ver carrito» prepara una unidad del producto mostrado, sin
  aumentar su cantidad al volver atrás. Conserva los demás artículos.
  Si se salta directamente a cesta o checkout desde la guía, prepara una
  muestra solo si la cesta está vacía. Usa el CP 12001 cuando no hay uno elegido.
- «Simular compra de ejemplo» completa los campos vacíos con datos ficticios
  y ejecuta el mismo formulario de simulación local. Los datos ya escritos
  por el visitante se conservan; el envío y el total se calculan como antes.
- «Entrar al gestor» abre una sesión firmada de demo desde
  `/demo/admin/login?tour=1&next=…`, sin introducir contraseña. Solo funciona
  con `DEMO_MODE=true`, por GET y con un destino permitido dentro del panel.
  El login manual sigue disponible; el acceso automático no se activa al salir
  de sesión, con un aviso de rate limit ni en una tienda con `DEMO_MODE=false`.
- «Ir directamente al gestor» permite continuar desde las pantallas de compra
  incluso si no se quiere simular el checkout o el navegador no admite la cesta.
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
la previsualización. El acceso directo solo emite la cookie firmada existente;
las APIs siguen exigiendo sesión y todas las mutaciones de demo siguen
bloqueadas en servidor. No cambia permisos ni datos del motor.

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
`pnpm test:e2e:guide` para recorrer las diez pantallas a 1440/375 px desde una
pestaña vacía, usando solo botones visibles de la guía, sin escribir datos ni
contraseña. Verifica que volver atrás no duplica la muestra, que se confirma
la compra local, que el gestor conserva campos desactivados y que no hay
excepciones JS ni llamadas a APIs operativas. Solo requiere Chrome (o
`CHROME_BIN`) y Node con WebSocket nativo; no añade dependencias.
`BASE_URL=https://ecom.logic2b.com pnpm test:e2e:guide` comprueba la publicación.

Ejecutar las auditorías de navegador de forma secuencial y después del build,
porque comparten perfil y necesitan los assets estables:
`node scripts/a11y-audit.mjs --only=traza`, `--only=admin`.
La revisión manual debe incluir entrada desde la portada, una compra simulada,
el acceso al gestor, cierre y recarga, cambio de tema, reinicio, teclado,
375/1440 px, oscuro y el iframe de `/temas/traza`.
