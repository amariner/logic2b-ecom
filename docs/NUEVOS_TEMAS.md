# Línea paralela de nuevos temas

Esta línea vive en `codex/new-themes`. Su entrada es la carpeta interna
`nuevos-temas/`; su orden y estado están en `nuevos-temas/cola.json`.

## Orden de ejecución

Cuando el usuario diga **«créame un nuevo tema»**:

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

## Integración con el desarrollo principal

La integración se hace al terminar la cola, no tema a tema:

1. Actualizar `codex/new-themes` con la rama principal vigente mediante rebase o
   merge no destructivo, preservando cualquier cambio paralelo del motor.
2. Resolver conflictos manteniendo la regla de un único backend.
3. Ejecutar `pnpm check` y la verificación visual de todos los temas afectados.
4. Fusionar la rama completa en el desarrollo principal solo cuando la cola y
   las fichas estén cerradas. No borrar la rama antes de confirmar la fusión.
