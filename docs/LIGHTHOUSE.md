# Lighthouse — páginas indexables

> Medido el **2026-07-26** con Lighthouse 12.8.2 contra <https://ecom.logic2b.com>.
> Se reproduce con `pnpm audit:lh -- --runs=3 --write`
> ([`scripts/lighthouse.mjs`](../scripts/lighthouse.mjs)).

## Tabla citable — mediana de 3 pasadas

| Página | Dispositivo | Rendimiento | Accesibilidad | Buenas prácticas | SEO | LCP | CLS | TBT |
|---|---|---|---|---|---|---|---|---|
| Landing | Móvil | 100 * | 100 | 100 | 100 | 1,2 s | 0,00 | 0 ms |
| Landing | Escritorio | 100 | 100 | 100 | 100 | 0,5 s | 0,00 | 0 ms |
| Arquitectura | Móvil | 100 | 100 | 100 | 100 | 1,3 s | 0,00 | 0 ms |
| Arquitectura | Escritorio | 100 | 100 | 100 | 100 | 0,3 s | 0,00 | 0 ms |
| Estilos | Móvil | 100 | 100 | 100 | 100 | 1,2 s | 0,00 | 0 ms |
| Estilos | Escritorio | 100 | 100 | 100 | 100 | 0,5 s | 0,00 | 0 ms |
| Dossier | Móvil | 100 | 100 | 100 | 100 | 1,2 s | 0,00 | 0 ms |
| Dossier | Escritorio | 100 | 100 | 100 | 100 | 0,3 s | 0,00 | 0 ms |

Móvil es el perfil por defecto de Lighthouse (Moto G Power emulado, 4G lenta y
CPU 4× más lenta); escritorio usa el preset `desktop`. La emulación móvil es
deliberadamente pesimista: es el suelo, no la media.

**\* La landing en móvil está medida sobre UNA pasada, no sobre la mediana.**
Las siete filas restantes son mediana de tres. Cuando se optimizó la landing
(entrada F11.8c del ROADMAP: animación del H1, `srcset` de 560 y galería sin
`lazy`) la red de la máquina que medía se degradó —documentos de 8 a 24 s— y
Lighthouse achaca eso a la página: pasadas de 90 que no dicen nada del sitio. La
única pasada de esa tanda con red sana dio **100/100/100/100, LCP 1,2 s,
SI 2,3 s, 309 KiB**. Antes de las tres optimizaciones la mediana era **97**, con
LCP 1,9 s y 448 KiB.

**Cerrar esto = repetir `pnpm audit:lh -- --runs=3 --write` con red estable.**
El script descarta y repite sola cualquier pasada en la que el HTML tarde más de
3 s en llegar, y nunca descarta por nota baja; con una conexión decente la tabla
sale sin intervención.

## Qué mirar cuando una nota baje

- **Rendimiento móvil**: casi siempre es Speed Index, la métrica ruidosa del
  lote. Antes de tocar código, comprobar en el informe (`.lighthouse/*.html`)
  que el documento y la fuente llegaron en tiempos normales.
- **LCP de la landing**: el elemento es el H1 del héroe. Cualquier animación de
  entrada que se le ponga se le suma al LCP casi entera.
- **Imágenes**: las tarjetas del héroe se sirven con `srcset` en 560 y 900. Si
  se añade una tienda hay que generar sus dos variantes
  (`node scripts/capture-screens.mjs`).
