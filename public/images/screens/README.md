# Capturas de la landing (F11.1)

Capturas reales de las **6 tiendas**, del **panel** y del **flujo de compra**,
para la landing V2 (dirección C «Ocho tiendas, un motor»). **Caducan con cada
rediseño de tema**: si tocas una tienda o el panel, vuelve a capturar la
superficie afectada.

Todo lo genera un solo comando reproducible, sin dependencias npm nuevas:
Chrome del sistema conducido por CDP (`WebSocket` global de Node ≥21) + `cwebp`.
El motor es [`scripts/capture-screens.mjs`](../../../scripts/capture-screens.mjs).

## Receta de re-captura

```bash
# 1. Fixtures prístinas + build para wrangler dev
pnpm db:reset && pnpm build

# 2. Servidor local (deja esta terminal abierta)
npx wrangler dev --port 8799 --local

# 3. En otra terminal: todas las capturas → public/images/screens/*.webp
node scripts/capture-screens.mjs

#    Subconjunto por substring del nombre, y depuración:
node scripts/capture-screens.mjs --only=panel-      # solo el panel
node scripts/capture-screens.mjs --only=store-iris  # solo Iris
node scripts/capture-screens.mjs --keep-png         # conserva el PNG intermedio
```

Variables opcionales: `BASE_URL` (por defecto `http://127.0.0.1:8799`),
`CHROME_BIN` (ruta a Chrome si no es la de macOS).

### Vídeo de Iris (una vez; no lo hace el script)

Iris es tienda de **vídeo-scrub**: la captura estática solo vale de póster del
hero. El clip de la landing se deriva del vídeo fuente ya versionado
(`public/images/collections/iris/hero.mp4`, 1920×1080, 6 s):

```bash
SRC=public/images/collections/iris/hero.mp4; OUT=public/images/screens
ffmpeg -y -i "$SRC" -vf "scale=1280:720:flags=lanczos" -c:v libx264 -crf 27 \
  -preset slow -profile:v high -pix_fmt yuv420p -an -movflags +faststart "$OUT/iris-scrub.mp4"
ffmpeg -y -ss 0.4 -i "$SRC" -frames:v 1 -vf "scale=1280:720:flags=lanczos" /tmp/f.png
cwebp -q 74 /tmp/f.png -o "$OUT/iris-scrub-poster.webp"
```

## Parámetros fijos

- **Escritorio** 1440×900, `deviceScaleFactor` 2 → salida WebP a 1440 px de ancho.
- **Móvil** 390×844, `deviceScaleFactor` 2 → salida WebP a 780 px de ancho.
- Tema **claro** (la dirección C no usa oscuro en el hero).
- El **banner de demo** (tienda y panel) y el **conmutador flotante de tiendas**
  se ocultan siempre por inyección de CSS antes de capturar (no tocan el código).
- Objetivo de peso: escritorio ≤150 KB, móvil ≤60 KB (WebP). La página completa
  de tiendas con mucho catálogo se **capa en altura** (`maxH`) para no pesar.

## Inventario

Tiendas (`store-<id>-…`), id ∈ `launch·minimal·editorial·guide·iris·demo`:

| Sufijo | Qué | Nota |
|---|---|---|
| `-catalog` / `-catalog-m` | Escaparate (escritorio página completa / móvil viewport) | Iris = viewport (póster del vídeo) |
| `-product` | Ficha del producto firma de la tienda | |
| `-cart` | Carrito con líneas reales (quote del servidor) | solo `launch` y `demo` |

Panel (`panel-…`, con cookie de sesión):

| Nombre | Qué |
|---|---|
| `panel-orders` | Listado con los 5 estados y filtros |
| `panel-order-detail` | Detalle con líneas, dirección, tracking y timeline (pedido 3, enviado) |
| `panel-products` | CRUD de productos |
| `panel-shipping` | Tarifas por zona + export CSV |
| `panel-emails` | Bandeja de salida simulada (la pieza estrella) |
| `panel-email-open` | Email de confirmación abierto y renderizado |
| `panel-emails-m` | Bandeja en móvil |

Flujo (`flow-…`):

| Nombre | Qué |
|---|---|
| `flow-checkout` / `-m` | Checkout con portes calculados (CP 12001 → Estándar 24/48h) |
| `flow-gracias` | Confirmación post-pago |

Iris (vídeo): `iris-scrub.mp4` (720p, H.264, sin audio, 6 s) + `iris-scrub-poster.webp`.

## Notas

- `panel-emails-m` queda en ~61 KB (1 KB sobre el objetivo móvil): es una bandeja
  larga de texto, lazy fuera de viewport; el exceso es irrelevante.
- Los slugs y el pedido/`session_id` de referencia dependen del seed de demo. Si
  cambian los fixtures (`seed/demo-orders.ts`), ajusta `FICHAS`, `CARTS` y el
  `session_id` de `flow-gracias` en el script.
