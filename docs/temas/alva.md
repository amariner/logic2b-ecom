# Tema ALVA — ficha de entrega

- **Referencia:** `public/images/referencias/21-alva.webp` — se replica la hoja
  editorial estrecha de la web; se excluye el fondo promocional exterior.
- **Colección:** `src/collections/alva.ts` — **ALVA**, marroquinería y calzado
  escandinavo de autor.
- **Catálogo:** 8 productos · 4 bolsos + 4 sandalias · slugs `alv-*`.
- **Dirección:** fondo exterior negro, lienzo marfil, cabecera tipográfica,
  hero partido, retícula de cuatro columnas, díptico de atelier y wordmark de
  gran escala en el pie.
- **Imaginería:** 12 assets finales (4 campañas/editorial + 8 productos), WebP,
  1,0 MB total. La herramienta integrada de OpenAI falló por red antes de
  generar; se aplicó el fallback de Higgsfield ya autorizado para la cola.
  Product Photoshoot generó una pieza por llamada, inspeccionada antes de
  integrarse. Consumo: **120,68 créditos**; saldo al cierre: **789,68**.

## Receta visual de los assets

- Campaña: fotografía editorial escandinava contenida, paleta marfil, negro,
  cacao y piedra; luz difusa, piel y materiales reales; personas ficticias.
- Producto: una sola pieza, fondo blanco cálido continuo, vista tres cuartos,
  sombra suave y ausencia de logos, texto, marcas de agua o props.
- Díptico: sandalia negra suspendida sobre yeso marfil + paso exterior con
  falda cacao y sandalias negras frente a piedra cálida.

## Coste del tema

- **Ficheros tocados:** kit `src/components/themes/alva/`; colección y seed
  `alva`; registros de colección, tema, catálogo y filtros; 12 assets;
  referencia, capturas, cola, `docs/TEMAS.md`, ROADMAP y esta ficha.
- **¿Hizo falta rozar el motor?:** **NO**. Solo se añadieron las entradas
  previstas en registros y herramientas de presentación; precios, envío,
  checkout, pedidos, D1 y APIs permanecen intactos.
- **Dependencias nuevas:** ninguna. Higgsfield CLI se instaló en el prefijo de
  usuario para ejecutar el fallback; no forma parte del proyecto.
- **Tiempo de sesión:** ~55 min, dominado por la espera secuencial del generador.

## Verificación

- ✅ `astro check`: 392 archivos, 0 errores, 0 avisos, 0 hints.
- ✅ Vitest: 53 suites y **350/350 tests**.
- ✅ Catálogo y ficha servidos en local; capturas a 1440 y 390×844.
- ✅ Ficha, carrito vacío/activo y checkout bajo el recorrido compartido.
- ✅ Reduced motion y auditoría propia: **0 errores · 0 avisos · 9 superficies**.
- ✅ Capturas WebP dentro de presupuesto: catálogo 116 KB, móvil 35 KB,
  miniaturas 28/74 KB y ficha 33 KB.
- ✅ Contraste del copy sobre fotografía corregido con plancha sólida oscura.
