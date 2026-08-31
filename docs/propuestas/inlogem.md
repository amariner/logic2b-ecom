# Propuesta Inlogem

Estado actual: `draft` hasta completar QA y revisión local.

URL privada local: `/propuestas/inlogem-3a7399641519f1d36a1ea232f309223c`

## Alcance

- Micrositio comercial “Precisión cercana”.
- Storefront B2B con 72 fichas públicas trazables, 8 familias y compra rápida.
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

No hay login profesional, tarifas por cliente, edición, exportación, fiscalidad, pagos, D1, sincronización de stock, scraping periódico ni mensajes a Inlogem. Marcas, referencias y procedencia se presentan como datos observados; las escenas editoriales no imitan productos identificables ni sustituyen el logotipo oficial.
