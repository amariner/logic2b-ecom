# R6.8c — Identidad histórica y coincidencias de SKU

El histórico fixture conserva cada fila con SKU, unidades e identidad declarada
opcional, junto al catálogo de origen completo. Una identidad aportada debe
existir bajo el producto indicado y corresponder al SKU literal de ese origen.
Una identidad no aportada permanece desconocida, aunque el SKU tenga una sola
coincidencia.

La comparación recibe otro catálogo completo y una declaración explícita de
que ambos cortes usan el mismo espacio de IDs. Ese supuesto permite comparar
los números del fixture; no demuestra continuidad de productos reales,
autenticidad de una compra o pertenencia a una cuenta.

Cada fila devuelve dos resultados independientes: si su identidad declarada
figura en el catálogo comparado y qué identidades coinciden con el SKU histórico.
Si una variante conserva su identidad pero cambia de SKU, ambos textos siguen
visibles por separado. Si el SKU pasa a otra variante, esta no sustituye la
identidad histórica. Un ID de variante bajo otro producto tampoco se acepta
como la misma pareja de identidades.

No encontrar una identidad significa que no figura en ese corte; no acredita
retirada, falta de stock o indisponibilidad real. Las referencias y fechas son
metadatos declarados. La comparación admite cortes con fechas diferentes sin
declarar ninguno vigente.

Filas repetidas, cantidades cero y máximos enteros seguros se conservan sin
sumar, corregir o convertir a cajas. El resultado es descriptivo: no construye
una lista nueva por SKU, carrito o pedido. El contrato reutiliza los
normalizadores de catálogo y lista existentes, sin cambiar sus reglas.

`companies` 1.13.0 conserva B2B-008 parcial e instalada/inactiva, dependiente de
B2B-002, sin superficies operativas. La demo visual sigue pendiente.

Verificación de fuentes del 2026-10-04:

- 35 pruebas del histórico y seis de arquitectura correctas, con dos archivos
  propios sin diagnósticos TypeScript; 122 pruebas de registro/manifiesto/acceso.
- Revisión independiente sin P1/P2 pendientes: 176.040 aserciones sobre 312 casos y 914
  filas, con 71 rechazos adversariales y límites de 20.000 variantes entre ambos
  catálogos. Se registran aparte 2.202 comprobaciones de delegación y una
  revisión paralela de fronteras con 115 casos y 966 aserciones.
- Cero efectos, getters ejecutados o reloj implícito en las sondas; las fechas
  de metadatos son explícitas. Los contratos anteriores a/b conservan su fuente.
- Bundle público diagnóstico de cuatro exports: 11.093 B / 3.306 gzip, sin
  aplicación CSV, imports externos o runtime operativo. Incluye 1.184 B de
  constantes históricas. No corresponde a un cliente emitido por Astro.

El check global final revisó 1.012 archivos sin diagnósticos y pasó 271 suites
con 4.134 pruebas; build del 2026-10-04 a las 06:09:55 UTC. La comparación
contra PR #46 mantiene idénticos ocho grafos cliente, 361 fuentes seleccionadas,
19 CSS y los 62 JS públicos (432.002 B / 138.864 gzip por suma de archivos).
Los 282 JS del Worker suman 63 B adicionales de metadatos: 280 son idénticos
tras sustituir 24 nombres generados; las diferencias restantes corresponden
al registro de módulos y al manifest generado. Esto no prueba equivalencia
completa del runtime SSR.

La revisión detectó una inicialización de límites no utilizada que se retenía
en otros clientes. Se corrigió delimitando la construcción completa como pura.
El bundle diagnóstico funcional es idéntico byte a byte; 18 comprobaciones
dirigidas y las focales se repitieron, y el segundo check/build elimina la
retención. El oráculo completo anterior no se cuenta como una nueva ejecución.

Evidencia y hashes: [verification-report.json](verification-report.json).
Este corte no añade interfaz ni ejecuta Worker, HTTP, navegador o base de datos.
La interacción se hereda de [R6.7c / PR #44](../r6-7c/README.md): 5.076
comprobaciones, 108 visitas, ocho superficies a11y sin hallazgos, ocho capturas
revisadas y E2E 200/200. Su hash intacto de 143 tablas/353 filas corresponde a
esa ejecución anterior, no a una nueva prueba de R6.8c.

Sin despliegue, migración, proveedor, cron, pedido o mutación operativa.

Consejo (skill [equipo](../../../.claude/skills/equipo/SKILL.md)): arquitectura ✓ · backend ✓ · fullstack ✓ · producto ✓.
