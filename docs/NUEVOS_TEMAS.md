# Carril visual de nuevos temas

Este carril forma parte de
[`RUTA_DESARROLLO_CONTINUO.md`](RUTA_DESARROLLO_CONTINUO.md). Su entrada es la
carpeta interna `nuevos-temas/`; su orden y estado están en
`nuevos-temas/cola.json`.

Cuando existe otro chat desarrollando el motor, vive en `codex/new-themes`
dentro de un worktree separado. Cuando un único `/goal` ejecuta ambos carriles,
puede trabajar secuencialmente sobre su rama activa, siempre después de cerrar
el bloque anterior y sincronizar la base. Dos chats nunca editan el mismo
checkout ni los mismos archivos a la vez.

## Orden de ejecución

Cuando el usuario diga **«créame un nuevo tema»** o el `/goal` continuo
seleccione el siguiente bloque visual:

1. Leer `nuevos-temas/cola.json`.
2. Continuar primero cualquier elemento `en_progreso` o bloqueado. Solo si no
   existe, tomar el primer `pendiente` por `posicion`.
3. Abrir la imagen completa y separar el screen real de la web de fondos,
   marcos, dispositivos o composiciones promocionales que no pertenezcan a la
   interfaz.
4. Crear el kit con `pnpm new:theme <id>` y mantener toda la lógica comercial
   compartida. Un tema solo cambia presentación, colección y assets.
5. Replicar estructura, proporciones, jerarquía, densidad, navegación,
   responsive y detalles interactivos. No convertir la referencia en una
   variación genérica de colores.
6. Guardar una copia WebP de la referencia en
   `public/images/referencias/<numero>-<id>.webp`; es material interno.
7. Generar imaginería propia con la herramienta integrada `imagegen` de
   Codex/OpenAI por defecto. Solo cambiar de proveedor o a CLI/API cuando el
   usuario lo autorice expresamente; documentar la excepción en la ficha.
8. Generar con una sola llamada activa cada vez. Guardar, optimizar e inspeccionar
   el resultado y esperar al menos ocho segundos antes de iniciar la siguiente.
   Cada producto o escena usa su propio prompt; no se simulan assets distintos
   con variantes de una llamada.
9. Copiar los resultados finales a `public/images/collections/<id>/`, convertir
   a WebP y comprobar encuadre, fidelidad visual, texto, anatomía y ausencia de
   marcas de agua. Los assets que consume el proyecto nunca se dejan solo en
   `$CODEX_HOME/generated_images`.
10. Pasar `pnpm check`, verificar escritorio y móvil, actualizar la ficha de
    `docs/temas/<id>.md` y marcar el elemento `completado`.

Un fallo del generador no hace avanzar la cola. Se reanuda el mismo tema antes
de comenzar el siguiente.

## Lotes de ARGENT

La referencia inicial necesita ocho assets finales:

| Lote | Archivo | Contenido |
|---|---|---|
| 1 | `hero-car-mirror.webp` | Modelo reflejada en retrovisor, hero 16:9 |
| 1 | `campaign-creators.webp` | Espalda con sudadera gráfica, campaña vertical |
| 2 | `campaign-uniform.webp` | Dos modelos con prendas negras bajo cielo azul |
| 2 | `product-checked-sarong-skirt.webp` | Falda larga de cuadros vino/negro |
| 3 | `product-black-sleeveless-top.webp` | Top negro sin mangas |
| 3 | `product-grey-flannel-hood.webp` | Sobrecamisa gris de cuadros con capucha |
| 4 | `product-denim-utility-shirt.webp` | Camisa vaquera azul con bolsillos |
| 4 | `product-denim-sarong-skirt.webp` | Falda vaquera clara asimétrica |

Los productos se generan aislados, centrados y con fondo blanco uniforme. Las
campañas conservan el encuadre y lenguaje fotográfico de la referencia, pero
usan personas ficticias y no incorporan logos ajenos.

**Resultado de la prueba:** los ocho WebP se generaron con Higgsfield por
petición expresa del usuario. Hero: Soul Cinematic 2K. Campañas y prendas:
Product Photoshoot sobre GPT Image 2. Se recortó cada región de la referencia
antes de enviarla para impedir que el modelo confundiera el asset con la web
completa. El primer intento de hero, que sí incluyó una web compuesta, se
descartó y no forma parte del proyecto.

## Selección dentro del Goal continuo

1. R2.5 se integra antes de incorporar nuevos cambios de colección o seed.
2. Con un chat visual paralelo, continuar las posiciones pendientes mientras el
   carril principal ejecuta Admin V2 en otro worktree.
3. Con un solo Goal, intercalar un tema únicamente después de cerrar un bloque
   principal y cuando no haya migración, deploy o refactor de storefront abierto.
4. Si el tema necesita ampliar el motor, registrar la necesidad en el ROADMAP y
   resolverla para todos en el bloque arquitectónico correspondiente; el tema no
   recibe una excepción privada.
5. Durante R8, migrar todos los temas terminados al contrato de secciones. Los
   temas creados después de R8.3 nacen directamente sobre ese contrato.

## Integración con el desarrollo principal

Si se usa la rama paralela, la integración se hace al terminar el lote activo de
la cola, no con un tema incompleto:

1. Actualizar `codex/new-themes` con la rama principal vigente mediante rebase o
   merge no destructivo, preservando cualquier cambio paralelo del motor.
2. Resolver conflictos manteniendo la regla de un único backend.
3. Ejecutar `pnpm check` y la verificación visual de todos los temas afectados.
4. Fusionar la rama completa en el desarrollo principal solo cuando el lote y
   sus fichas estén cerrados. No borrar la rama antes de confirmar la fusión.

Si el Goal secuencial trabaja en una sola rama, cada tema puede integrarse como
un bloque atómico independiente, pero solo con ficha, cola, capturas y todas las
verificaciones cerradas.
