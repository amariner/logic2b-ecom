# Tema COTA — ficha de entrega

Decimoquinto tema de la cola visual, cerrado el 2026-08-13. El nombre se adoptó
durante el Goal continuo para relacionar arquitectura, nivel y paisaje; no se
registra como confirmación explícita de Andreu.

- **Referencia:** `public/images/referencias/28-cota.webp`, copia optimizada de
  `nuevos-temas/a0a43d8adc1a5e9263bae105fa4aabc4.jpg`.
- **Colección:** `src/collections/cota.ts` — agua, tierra y ciudad.
- **Catálogo:** 6 residencias ficticias `cot-*`: Cero Lago, Umbral Cañón,
  Patio Sal, Niebla Bosque, Atrio Mar y Luz Altura.
- **Imaginería:** 6 escenas arquitectónicas WebP propias, 2016×1344.

## Traducción visual

La referencia se replica como una publicación inmobiliaria enmarcada en carbón:
cabecera mínima, hero arquitectónico con línea técnica, dos proyectos solapados,
copy microscópico, retícula de tres columnas y cierre panorámico. El marco se
retira en móvil y la retícula pasa a dos columnas sin perder las CTA táctiles.
Filtros, búsqueda, orden, ficha, carrito y checkout usan el motor compartido.

## Generación y coste

`imagegen` integrado falló por red antes de producir un archivo. El fallback
Higgsfield ya autorizado usó **Soul Location**, adecuado para entornos sin
personajes, en siete prompts individuales 3:2. Cada prompt fijó emplazamiento,
material, luz, geometría, paleta, cámara y prohibición de texto, marcas y
señalética. Se descartó y regeneró Atrio Mar porque apareció una figura humana.

- Saldo: 45,24 → 44,40; coste neto **0,84 créditos**.
- Resultado: 6 assets finales inspeccionados; sin texto, logos ni marcas de
  agua; optimizados a WebP.
- Dependencias nuevas: ninguna.

## Alcance técnico

- Ficheros propios: colección, seed, tres componentes Astro, seis imágenes y
  esta ficha.
- Registros compartidos previstos: portada, catálogo de temas, capturas,
  auditoría a11y y prueba de catálogo.
- ¿Hizo falta rozar el motor?: **no**. Pricing, envíos, pedidos, D1 y APIs no
  cambian; los importes son valores ficticios de presentación.

## Verificación

- `pnpm check`: 487 archivos Astro sin diagnósticos, 78 suites/469 tests y
  build en verde.
- E2E global: aislamiento de demos y panel verificado.
- Navegación real a 1440×900 y 375×812: composición, imágenes, selección y cero
  overflow comprobados.
- Auditoría específica: catálogo, ficha, carrito, checkout, móvil y movimiento
  reducido; **0 errores y 0 avisos en 8 superficies**.
- Capturas: escritorio 114 KB, móvil 30 KB y ficha 28 KB; derivados 900/560 px
  revisados y dentro de presupuesto.
- Despliegue: Worker `70c0d815-e549-4318-99f6-4947149ffd79`; smoke 200 en
  portada, `/temas`, tienda y hero. Lighthouse remoto (mediana de tres): portada
  99/100/100/100 móvil y 100/100/100/100 escritorio; `/temas` 100/100/100/100
  en ambos perfiles. LCP máximo 1,8 s, CLS 0 y TBT 0 ms.
