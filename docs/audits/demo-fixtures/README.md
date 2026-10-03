# Demo de fixtures — comprobación local

Corte R5.6c.3, 2026-10-03. Evidencia obtenida con una compilación demo y una
base sintética aislada; no describe un despliegue remoto.

- `pnpm check`: 877 archivos sin diagnósticos, 220 suites y 1.705 tests.
- Guardia del build: 44 páginas HTML y 44 formularios locales.
- `e2e-report.json`: 153 comprobaciones y tres triggers históricos inertes.
  Las 143 tablas y 353 filas conservan el mismo hash antes y después de todo QA.
- `report.json`: 31 comprobaciones de contacto, acceso y lote a 1440/375 px,
  también sin JavaScript; cero peticiones mutantes, beacons o errores JS.
- `a11y-report.json`: ocho superficies, cero errores y cero avisos.
- `guide-report.json`: recorrido de compra ficticia completo en ambos tamaños,
  sin peticiones a APIs operativas.

Reproducir contra un Worker **local aislado**, preparado con datos sintéticos:
`BASE_URL=http://127.0.0.1:8793 node scripts/e2e.mjs`,
`BASE_URL=http://127.0.0.1:8793 node scripts/test-demo-fixtures.mjs` y
`BASE_URL=http://127.0.0.1:8793 node scripts/a11y-audit.mjs --only=fixture:`.
Consultar las opciones del script antes de cambiar la ruta de salida.
Los logs y snapshots por tabla permanecen fuera de Git; los informes solo
contienen resultados agregados y las capturas muestran datos ficticios.

Para cambiar un proyecto cliente a modo demo se debe recompilar con su
configuración demo. Cambiar únicamente una variable remota no transforma los
assets HTML de una compilación cliente existente.
