# R5.9b — Publicación del catálogo: QA local

`/demo/admin/publicacion` muestra qué productos y variantes aparecerían en cada
mercado y canal. Las doce combinaciones tienen selecciones independientes;
editar prepara cambios y «Aplicar al ejemplo» actualiza el resultado en memoria.
Recargar o restablecer devuelve los tres productos ficticios a su estado inicial.

Verificación del 2026-10-03 sobre el build local:

- `pnpm check`: 905 archivos sin diagnósticos, 230 suites y 2.222 pruebas.
- Modelo y gate: 47 pruebas; revisión independiente de 453 comprobaciones,
  sin P1/P2 pendientes. La composición del modelo se empaqueta desde cinco
  fuentes puras, sin lectores operativos.
- E2E: 164/164. Build: 44 HTML y 44 formularios locales, sin envíos ni cron.
- [Navegador](report.json): 188 comprobaciones a 1440/375, incluidas las doce
  selecciones pendientes, aplicación aislada, variante principal oculta,
  borrador/archivada excluidas, producto inactivo y detalle por identidad exacta.
  También teclado real, foco, selección vacía, reset, recarga y modo sin JS.
- [Accesibilidad](a11y-report.json): ocho superficies, cero errores y avisos;
  movimiento reducido. El panel mantiene su diseño claro, sin modo oscuro.
- Cero solicitudes HTTP, escrituras de almacenamiento, temporizadores,
  beacons, ventanas externas o errores JavaScript propios del módulo.
  Las escrituras de arranque y recarga se comprueban como exclusivas de la guía
  compartida. Su sessionStorage y el `requestAnimationFrame` visual del contacto
  flotante existente se registran aparte; este último se identifica por su
  punto de llamada exacto en el HTML contrastado con la fuente. No son cron.
- Base QA intacta: 143 tablas, 353 filas y el mismo hash antes/después en el
  [informe agregado](verification-report.json). Worker y Chrome detenidos.

MKT-004 permanece instalada e inactiva. La ruta exige manifest demo y
`DEMO_MODE=true`, es noindex y no tiene formularios, endpoints operativos ni
persistencia. Visibilidad no acredita precio, stock ni posibilidad de compra.
Sin DDL, datos reales ni despliegue; la evidencia no acredita el sitio remoto.

Las ocho capturas se revisaron conservando el lanzador compartido de la guía:

| Estado | Escritorio | Móvil |
|---|---|---|
| Inicio: Azul visible, Arena principal oculta | [1440](inicio-1440.png) | [375](inicio-375.png) |
| Francia: catálogo vacío explicado | [1440](fr-vacio-1440.png) | [375](fr-vacio-375.png) |
| Selección aplicada: Arena y Azul visibles | [1440](aplicado-1440.png) | [375](aplicado-375.png) |
| Detalle de Arena excluida | [1440](variante-excluida-1440.png) | [375](variante-excluida-375.png) |

Repetir con un único Worker local preparado con fixtures sintéticos:

```sh
BASE_URL=http://127.0.0.1:8793 OUTPUT_DIR=docs/audits/r5-9b pnpm test:e2e:publication
BASE_URL=http://127.0.0.1:8793 node scripts/a11y-audit.mjs --only=market-publication: --json
BASE_URL=http://127.0.0.1:8793 pnpm test:e2e
```

No utilizar D1 remota ni registrar cron para preparar esta evidencia.
