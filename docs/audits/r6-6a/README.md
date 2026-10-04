# R6.6a — Solicitudes y ofertas fixture

Verificación local del contrato de negociación: solicitud sin dinero, ofertas completas en EUR, historial inmutable, selección explícita y comparación de revisiones. No se crean pedidos ni se ejecuta el ciclo comercial de ORD-008.

- `pnpm check`: 987 archivos sin diagnósticos, 262 suites y 3.745 pruebas.
- Revisión independiente: 10.245 comprobaciones, sin P1/P2; dinero con oráculo separado, historial, replay, contexto y fronteras sin efectos.
- Seis grafos JavaScript y 355 fuentes explícitas iguales a PR #38. De 19 CSS, 18 iguales; el restante añade únicamente `.ordinal` sin uso en esas fuentes, 175 bytes / 7 gzip. Retirar la regla recupera el SHA previo exacto.
- Navegador, accesibilidad, E2E y hash de fixtures se heredan de PR #38; no se ejecutaron de nuevo en este bloque.

[Informe completo](verification-report.json) · [Decisión y límites](../../plataforma/adr/0059-solicitudes-ofertas-fixture.md).

Sin despliegue, DDL, crons, formularios enviados, llamadas a proveedores o escrituras operativas en base de datos. La demostración visual de negociación corresponde al siguiente corte de interfaz.
