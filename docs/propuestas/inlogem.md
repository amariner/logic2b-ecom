# Propuesta Inlogem

Estado actual: `active`, accesible únicamente mediante su URL privada y excluida de indexación.

URL privada local: `/propuestas/inlogem-3a7399641519f1d36a1ea232f309223c`

## Alcance

- Ecommerce abierto con la identidad visual INLOGEM y una cabecera comercial compartida entre portada, catálogo, producto y compra.
- Portada editorial con fotografía de oficina, búsqueda principal y seis accesos visuales a categorías bajo el hero.
- Catálogo con 72 fichas públicas trazables, 8 categorías, búsqueda, filtro lateral en escritorio, panel compacto en móvil y compra rápida.
- Carrito, checkout y confirmación guardados únicamente en el navegador.
- Gestor de solo lectura con 12 pedidos y 6 emails ficticios.
- Formulario de reunión con `source=proposal:inlogem` y sin precio de implantación.

## Snapshot

El catálogo se capturó manualmente el 31 de agosto de 2026 desde fichas públicas de Liderpapel que sirven la tienda enlazada por Inlogem. `scripts/import-inlogem-catalog.mjs` selecciona 9 referencias disponibles por cada familia, descarga las imágenes y las convierte a WebP local.

```bash
pnpm import:inlogem --refresh
```

El refresh requiere revisión humana del diff y conserva `demoPriceCents` por `sourceCode`. No se ejecuta en `pnpm build` ni en cada visita.

Los importes son ficticios y finales: “IVA incluido · precio de demostración”. Los portes demo usan 7,87 € en península y gratuidad desde 72,60 €, siempre descritos como condiciones por validar.

## Límites

No hay login profesional, tarifas B2B por cliente, edición, exportación, fiscalidad, pagos, D1, sincronización de stock, scraping periódico ni mensajes a Inlogem. Las tarifas profesionales siguen fuera de alcance; cualquier evolución requiere una propuesta específica. Marcas, referencias y procedencia se muestran como datos observados; el sistema gráfico propio de la propuesta acompaña imágenes locales del catálogo real.

## Revisión UX/UI — 5 de septiembre de 2026

Portada con foco de compra, titulares y tarjetas más contenidos. El contenido de
la propuesta y su formulario se agrupa en un desplegable. Cabecera y pie
compartidos entre portada, catálogo, ficha, carrito, entrega y confirmación.
La fotografía editorial es generada; las fichas conservan sus imágenes de catálogo.
Véase `docs/audits/ECOMMERCE_UX_2026-09-05.md` para referencia, precios del
servicio, recursos y verificación. La propuesta privada no se enlaza desde la home indexable.
