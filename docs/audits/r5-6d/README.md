# R5.6d — segmentos con fixtures

La pantalla `/demo/admin/segmentos` muestra 12 perfiles ficticios, cuatro
hechos y tres plantillas. La evaluación reutiliza el dominio puro y avanza por
clics, con lotes de tres. Editar una regla invalida resultados y progreso;
recargar o restablecer vuelve al ejemplo inicial. No se persiste ningún resultado.

El acceso y el enlace solo existen con manifest demo y `DEMO_MODE=true`.
CUS-009 permanece instalada e inactiva; no hay ruta operativa, job ni API de
segmentación. El panel conserva su acceso guiado mediante cookie stateless.

Reproducción contra un Worker **local** con D1 de fixtures preparada:

```sh
BASE_URL=http://127.0.0.1:8793 pnpm test:e2e:segments
BASE_URL=http://127.0.0.1:8793 node scripts/a11y-audit.mjs --only=segments: --json
BASE_URL=http://127.0.0.1:8793 pnpm test:e2e
```

Los scripts de navegador requieren Chrome/Chromium (`CHROME_BIN` opcional).
Las pruebas cubren escritorio/375 px, teclado, fallback sin JavaScript,
resultados, invalidación, reinicio y ausencia de tráfico con efectos.
La auditoría de accesibilidad cubre estados inicial, completo, inválido y
movimiento reducido en ambos tamaños. Evidencia local; sin despliegue remoto.

Cierre: `pnpm check` pasa 883 archivos sin diagnósticos, 222 suites/1.730
pruebas y build. Navegador: 119/119 comprobaciones, cero APIs, mutaciones,
beacons o errores; ocho capturas. E2E: 156/156. Accesibilidad: ocho superficies,
cero errores y cero avisos. Tras todos los recorridos, las 143 tablas y 353
filas de QA conservan exactamente su hash inicial; el detalle agregado está
en `verification-report.json`.
