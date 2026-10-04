# R5.11c — Monedas y métodos: QA local

`/demo/admin/divisas` muestra equivalencias entre EUR, JPY y KWD mediante tipos
ficticios. Los métodos locales se evalúan siempre con el importe original del
mercado, independientemente de la moneda presentada y del estado de la evidencia
FX. No se selecciona ni se inicia un pago. Restablecer o recargar recupera el
ejemplo inicial.

Verificación del 2026-10-04 sobre el build local:

- `pnpm check`: 936 archivos sin diagnósticos, 240 suites y 2.885 pruebas;
  build de 44 HTML y 44 formularios locales, sin cron.
- [Navegador](report.json): 2.030 comprobaciones a 1440/375. Recorre 126 estados
  por tamaño: 14 contextos originales, tres destinos y tres estados de evidencia.
  Incluye los seis pares FX, identidad, ausencia, caducidad, teclado real, foco,
  cambio de mercado, reset, recarga en otro documento y consulta sin JavaScript.
- [Accesibilidad](a11y-report.json): ocho superficies, cero errores y avisos,
  con movimiento reducido. El panel mantiene su diseño claro, sin modo oscuro.
- Cero solicitudes HTTP, escrituras de almacenamiento, temporizadores,
  beacons, ventanas externas o errores JavaScript propios del módulo.
  No hubo intentos bloqueados de API, mutaciones HTTP ni navegación externa.
- La guía compartida realizó tres escrituras al arrancar y dos al recargar,
  exclusivamente en `logic2b:ecom-guide:v1`. Su almacenamiento y el
  `requestAnimationFrame` visual del contacto flotante se registran aparte.
  El punto exacto de llamada del rAF se contrasta con la fuente y el HTML;
  no se permite ningún otro temporizador. No son cron.

Equivalencias vigentes comprobadas, con formato exacto de 0, 2 y 3 decimales:

| Original | Destino | Resultado presentado |
|---|---|---|
| 29,75 EUR | JPY | 4.760 JPY |
| 29,75 EUR | KWD | 9,818 KWD |
| 3.000 JPY | EUR | 18,75 EUR |
| 3.000 JPY | KWD | 6,000 KWD |
| 9,875 KWD | EUR | 29,63 EUR |
| 9,875 KWD | JPY | 4.938 JPY |

También se comprueban todos los importes EUR seleccionables: 0,00; 4,99; 5,00;
29,75; 50,00 y 50,01. Las fronteras seleccionables de métodos quedan probadas
en navegador; los restantes límites de las reglas pertenecen a las pruebas del
contrato puro. Francia conserva la transferencia desactivada, Japón su método
local y Kuwait el alternativo; las reglas ausentes se explican explícitamente.
El cambio ES↔FR conserva el importe EUR elegido. Cambiar de moneda nominal
carga su fixture compatible; volver a EUR recupera 29,75 EUR, sin convertir el
importe anterior ni recuperar una selección guardada.

La identidad no conserva tasa ni fechas, incluso con evidencia seleccionada
como caducada o ausente. La caducidad conserva la referencia histórica marcada
como tal, pero elimina el importe presentado y sus atributos monetarios. La
ausencia elimina también tasa y fechas. El cero real conserva sus atributos.
En todos esos cambios permanecen iguales los métodos, motivos y rangos del
mismo contexto original. Los tipos racionales son ilustrativos y no se utilizan
para cobros, reembolsos ni liquidaciones.

Las ocho capturas se revisaron en escritorio y móvil: foco visible, importes
legibles y ausencia de overflow o defectos bloqueantes. Conservan el lanzador
compartido de la guía:

| Estado | Escritorio | Móvil |
|---|---|---|
| EUR→JPY con evidencia vigente | [1440](default-1440.png) | [375](default-375.png) |
| Identidad EUR, sin cotización | [1440](identity-1440.png) | [375](identity-375.png) |
| Tipo caducado, sin equivalencia disponible | [1440](expired-1440.png) | [375](expired-375.png) |
| Original KWD con tres decimales | [1440](kw-1440.png) | [375](kw-375.png) |

La ruta exige manifest demo y `DEMO_MODE=true`, es noindex y no contiene
formularios ni importes libres. MKT-008 y CHK-010 siguen parciales e
instaladas/inactivas; esto no cambia las demás capacidades de `payments`.
Sin proveedor, datos reales, persistencia ni despliegue. El E2E global y la
comparación de la base QA constan en el [informe agregado](verification-report.json).

Repetir con un único Worker local preparado con fixtures sintéticos:

```sh
BASE_URL=http://127.0.0.1:8793 OUTPUT_DIR=docs/audits/r5-11c pnpm test:e2e:currencies
BASE_URL=http://127.0.0.1:8793 node scripts/a11y-audit.mjs --only=currency-methods: --json
```

No utilizar D1 remota ni registrar cron para preparar esta evidencia.
