# R5.5h — Evidencia visual inerte de devoluciones

Revisión local del 2026-09-18. Las páginas Astro reales se ejecutan con el
manifest y las dependencias ficticias del arnés de cuenta: sin D1, secretos,
proveedor ni efectos. Esta evidencia no activa CUS-005 ni demuestra un rollout
de cliente. La demo pública conserva la capacidad instalada e inactiva.

## Reproducción

```bash
AUDIT_SCREENSHOT_DIR=docs/audits/r5-5h \
  node scripts/audit-customer-account-local.mjs --only=surface
```

Necesita Chrome/Chromium local y las dependencias del proyecto. El arnés
compila y sirve un Worker efímero, verifica HTTP/cabeceras y ejecuta el auditor
de navegador; cierra los procesos al acabar. No ejecutarlo durante otro build
en la misma copia de trabajo porque comparte `dist/`.

## Resultado observado

- 26 superficies de cuenta a 1440 y 375 px: **0 errores y 0 avisos**.
- Lista y detalle: contenido íntegro, sin desbordamiento horizontal, controles
  con nombre accesible, contraste y tamaños táctiles verificados por el auditor.
- Ocho capturas revisadas individualmente. Las variantes `focus` alcanzan el
  enlace principal mediante Tab real; el anillo de foco es visible en ambas
  anchuras.
- Cabeceras privadas, DTO limitado y formularios con CSRF/idempotencia sin
  JavaScript comprobados por el arnés.

| Pantalla | Escritorio | Móvil | Foco escritorio | Foco móvil |
|---|---|---|---|---|
| Solicitudes y alta | [1440](customer-account-returns-1440.png) | [375](customer-account-returns-375.png) | [Tab](customer-account-returns-1440-focus.png) | [Tab](customer-account-returns-375-focus.png) |
| Detalle | [1440](customer-account-return-detail-1440.png) | [375](customer-account-return-detail-375.png) | [Tab](customer-account-return-detail-1440-focus.png) | [Tab](customer-account-return-detail-375-focus.png) |

Las capturas permanecen en documentación interna, fuera de los assets públicos.
El pase automático cubre las reglas computables del auditor del repositorio;
la inspección visual y de teclado complementa esa evidencia.

Consejo: frontend ✓ · UX/UI ✓.
