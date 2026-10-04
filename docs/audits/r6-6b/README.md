# R6.6b — Presupuesto fixture ligado a una oferta

La composición conserva una oferta histórica y términos explícitos. Reconstruye emisión, aprobación declarada, caducidad y cancelación mediante las APIs públicas de ORD-008; no admite pagos o conversión a pedido.

- `pnpm check`: 989 archivos sin diagnósticos, 263 suites y 3.789 pruebas.
- Revisión independiente: 9.093 comprobaciones sin P1/P2, con oráculo separado de historiales y pruebas de delegación a reducers.
- Dos anotaciones `PURE` permiten descartar fábricas ambientales de eventos no utilizadas. Bundle diagnóstico: 31.399 B / 8.356 gzip; importación sin efectos.
- Los 58 JS públicos, seis grafos completos, 355 fuentes explícitas y 19 CSS siguen idénticos a PR #39. La salida Worker cambia; no se afirma igualdad completa de SSR.
- Navegador, accesibilidad, E2E y hash de fixtures se heredan de PR #38, sin nuevas ejecuciones runtime.

[Informe completo](verification-report.json) · [Decisión y límites](../../plataforma/adr/0060-artefacto-preliminar-fixture.md).

Sin despliegue, DDL, crons, formularios enviados, llamadas a proveedores o escrituras operativas en base de datos. La demo visual corresponde a R6.6c.
