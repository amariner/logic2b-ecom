# Ruta de desarrollo continuo — Logic2B Ecommerce

> Hilo conductor sin fechas ni horas para todo el proyecto. Este documento existe
> para que Andreu pueda iniciar un objetivo con:
>
> **`/goal sigue desarrollando este proyecto todo lo que puedas`**
>
> y el agente pueda avanzar de forma autónoma, verificable y ordenada sin pedir
> qué toca después de cada bloque.

## 1. Objetivo permanente

Evolucionar Logic2B Ecommerce desde el corte actual hasta una plataforma
ecommerce modular, profesional, operable y comercialmente honesta, conservando:

- despliegue y datos aislados por cliente;
- panel mínimo según capacidades activas;
- coste operativo bajo sobre Cloudflare;
- dinero, stock, impuestos y permisos decididos en servidor;
- Stripe alojado y sin ampliar superficie PCI;
- compatibilidad de migraciones, backup y rollback;
- TypeScript estricto, accesibilidad, rendimiento y SEO;
- demo pública aislada y sin escrituras comerciales reales.

El objetivo no es “hacer actividad” indefinidamente. Es cerrar, uno detrás de
otro, los bloques canónicos con criterios de terminado y dejar siempre el
proyecto en un estado retomable.

## 2. Alcance completo

Este objetivo incluye **todo el desarrollo del producto y del escaparate**:

- motor ecommerce, administración, datos, integraciones y operación;
- `nuevos-temas/` y todos los elementos presentes o futuros de su cola;
- nuevas direcciones estéticas, réplicas de referencias y colecciones demo;
- generación, optimización e integración de imágenes propias para cada tema;
- fichas, capturas, catálogo `/estilos`, landing y material comercial;
- motor compartido de storefront y migración de todos los temas al contrato
  común cuando llegue su bloque arquitectónico;
- regresiones, accesibilidad, rendimiento, SEO, documentación y despliegue.

Los temas no se tratan como una distracción ni se ejecutan todos de golpe. Son
un carril visual del mismo producto, con bloques, dependencias y criterios de
terminado propios. Pueden avanzar en paralelo desde un worktree independiente o
intercalarse en puntos seguros cuando solo exista un Goal activo.

## 3. Fuentes de verdad y orden de autoridad

Antes de actuar, leer en este orden:

1. `CLAUDE.md`: principios, stack, vetos y alcance.
2. `docs/CONTINUAR.md`: protocolo de cada bloque.
3. `docs/ROADMAP.md`: estado integrado y «Siguiente bloque».
4. Este documento: continuidad global cuando termina un bloque.
5. `docs/plataforma/ROADMAP.md`: orden R2–R11 y definición específica.
6. `docs/plataforma/MATRIZ_CAPACIDADES.md`: estado real de cada capacidad.
7. `docs/NUEVOS_TEMAS.md`: orden y reglas del carril visual.
8. `nuevos-temas/cola.json`: estado canónico de referencias pendientes.
9. `docs/CHECKLIST_TEMA.md`: definición de terminado de cada tema.
10. ADR, modelo, ficha o runbook enlazado por el bloque activo.

Si dos documentos discrepan, manda el más específico y reciente. La matriz
manda el estado comercial; el código y las pruebas mandan la evidencia.

## 4. Algoritmo autónomo de selección

El agente repite esta decisión después de cada bloque:

1. Si hay un bloque principal o tema `en_progreso`, terminarlo antes de abrir
   otro del mismo carril.
2. Si `docs/ROADMAP.md` contiene un «Siguiente bloque», conservarlo como cabeza
   del carril principal.
3. Si `nuevos-temas/cola.json` contiene un elemento `en_progreso`, conservarlo
   como cabeza del carril visual; si no, usar el primer `pendiente` por posición.
4. Si trabajan dos chats, permitir ambos carriles simultáneamente solo en
   worktrees/rutas de escritura separados y coordinar la integración.
5. Si trabaja un único `/goal`, cerrar el bloque actual y alternar un bloque
   visual únicamente cuando no haya una migración, deploy o cambio transversal
   del storefront abierto.
6. Si el bloque principal cierra una ola R, ejecutar su consolidación antes de
   pasar a la siguiente.
7. Si el último bloque añadió UI, completar su pase visual, responsive y a11y
   antes de avanzar al backend siguiente.
8. Si un tema descubre una carencia del motor, registrarla en el ROADMAP y
   resolverla en el bloque arquitectónico correspondiente para todos los temas;
   nunca introducir un parche privado en esa colección.
9. Si solo quedan decisiones reservadas en un carril, continuar con el siguiente
   bloque independiente del otro carril.

No se elige por novedad visual ni por facilidad. Dependencias, seguridad de
datos, estado de la cola y orden del roadmap mandan.

## 5. Ciclo universal de cada bloque

Un único `/goal` puede encadenar muchos bloques, pero cada bloque permanece
atómico y pasa por el mismo ciclo.

### 5.1 Sincronizar

- `git fetch origin`;
- comprobar `git status`, ahead/behind y cambios ajenos;
- no trabajar sobre base desactualizada;
- preservar cambios del usuario y no mezclar trabajo no relacionado.

### 5.2 Comprender

- leer el criterio completo del bloque;
- inspeccionar código, tests, migraciones y documentación afectados;
- identificar capacidades, presets y rutas que deben permanecer ausentes;
- activar vetos de coste, dependencia, migración, PCI o promesa comercial.

### 5.3 Diseñar

- fijar invariantes y definición de terminado;
- preferir contratos y composición frente a condicionales repartidos;
- diseñar primero migración/rollback si cambia persistencia;
- definir tests antes de abrir una superficie nueva.

### 5.4 Implementar

- dominio y aplicación antes que presentación;
- adaptadores detrás de puertos explícitos;
- ninguna ruta o navegación cuando la capacidad esté apagada;
- audit log, eventos y observabilidad cuando haya mutaciones;
- demo pública en modo inerte y de solo lectura.

### 5.5 Verificar

- tests focalizados durante el desarrollo;
- `pnpm check` al cerrar el bloque;
- E2E si se toca compra, pedido, inventario, pago o admin;
- a11y y navegador real si se toca UI;
- backup/restore/foreign keys si se toca D1;
- Lighthouse después del deploy si se toca una superficie comercial citada.

### 5.6 Documentar e integrar

- actualizar estado, evidencia y siguiente bloque;
- actualizar matriz/wiki sin adelantar promesas;
- commit descriptivo y push con árbol limpio;
- deploy y smoke cuando el bloque servido lo requiera;
- continuar automáticamente con el bloque siguiente si no existe bloqueo real.

### 5.7 Especialización de cada bloque de tema

Un tema es un bloque atómico completo, no una tarea decorativa parcial:

1. leer `docs/NUEVOS_TEMAS.md`, la cola y `docs/CHECKLIST_TEMA.md`;
2. abrir la referencia completa y separar interfaz de marco promocional;
3. crear o reanudar el kit con `pnpm new:theme <id>`;
4. definir colección, catálogo, tokens, layout y componentes sin duplicar
   negocio ni tocar precio, checkout, pedidos o inventario;
5. generar imaginería propia con `imagegen`, una llamada activa cada vez, y
   guardar los WebP optimizados dentro del repositorio;
6. verificar fidelidad, desktop, móvil, oscuro, interacción, a11y y rendimiento;
7. completar ficha, capturas, `/estilos`, landing, cola y ROADMAP;
8. integrar el trabajo solo después de actualizarlo contra la base vigente y
   ejecutar `pnpm check` con el conjunto completo.

Si la herramienta de imagen se bloquea temporalmente, el tema permanece
`en_progreso`; el Goal puede avanzar el carril principal y volver después, pero
no marca el tema como completado ni salta su posición en la cola.

## 6. Arranque coordinado

La ruta empieza con dos carriles. El principal fija contratos y operaciones; el
visual demuestra variedad real sobre ese único motor.

### Carril principal · Etapa 1 — R2.5: media y atributos tipados

Objetivo: completar el producto/variante con información visual y técnica
estructurada sin romper `products.image` ni `specs_json`.

Orden interno:

1. ADR/invariantes y diseño de esquema.
2. Migración aditiva y rehearsal sobre copia aislada.
3. Galería con orden, alt, foco y asociación opcional a variante.
4. Definiciones de atributos con tipos y validación.
5. Valores de atributo por producto/variante según contrato.
6. Repositorios, casos de uso y endpoints administrativos.
7. Auditoría, concurrencia y capability gates.
8. Seed compatible, backup/restore y fallback legacy.
9. UI funcional en la ficha del panel.
10. Check, E2E, a11y, migración coordinada, deploy y smoke.

Cierre: CAT-007/CAT-008 pasan al estado real demostrado por tests; producto
simple sigue funcionando y presets sin capacidad no muestran nada nuevo.

### Carril principal · Etapa 2 — Panel administrativo V2 — ✅ 2026-08-10

Esta etapa entra inmediatamente después de R2.5 y antes de R2.6 por mandato de
producto. El panel actual es funcional pero está por debajo de la landing en
jerarquía, acabado y adaptación móvil.

#### UIA.1 · Sistema y shell

- corregir naming inconsistente del panel;
- crear estilos/primitivas administrativas con tokens Logic2B UI;
- Poppins para jerarquía e Inter para operación;
- navegación estable, tienda activa, estado del sistema y demo integrada;
- shell desktop amplio y navegación móvil accesible;
- botones, badges, campos, tarjetas, tablas, empty/error/loading y foco.

#### UIA.2 · Pedidos

- resumen operativo útil;
- búsqueda, filtros combinables y URL compartible cuando el backend lo permita;
- filas accionables y jerarquía clara de total/estado/cliente;
- vista móvil sin tabla recortada;
- detalle con líneas, totales, cliente, envío, timeline y acciones;
- acción destructiva separada de la operación normal.

#### UIA.3 · Productos

- búsqueda, categoría, estado y límite/paginación;
- miniatura, producto, variante, SKU, precio y stock legibles;
- evitar renderizar cientos de formularios simultáneos;
- ficha con galería/atributos R2.5, opciones, valores y variantes;
- feedback de guardado persistente y errores recuperables;
- paridad visual y funcional entre 1440 px y 375 px.

#### UIA.4 · Operación restante

- envíos y tarifas;
- emails con lista y preview;
- login y ayuda;
- estados vacíos/read-only;
- revisión global de copy, naming y metadatos.

Cierre: todas las rutas del panel comparten el mismo sistema, no hay overflow
involuntario, los targets miden al menos 44 px, el contraste es AA, el foco es
visible y E2E/a11y están en verde.

Evidencia de cierre: shell y navegación responsive por capacidad, listados de
pedidos/productos consultables y paginados, detalles operativos, envíos, emails,
login y ayuda unificados; `pnpm check` suma 50 suites/335 tests, E2E 37/37 y la
auditoría administrativa cubre 16 superficies a 1440/375 con 0 errores y 0
avisos. No hubo migración ni despliegue. La cabeza principal pasa a R2.6.

### Carril visual inmediato — cola de temas

La cola actual contiene cinco referencias completadas y catorce pendientes. El
orden visual es siempre el de `nuevos-temas/cola.json`:

1. cerrar R2.5 antes de integrar nuevos cambios de colección o seed;
2. las posiciones 1–5 están cerradas; tomar la posición 6 y completar
   referencia, nombre, colección, catálogo, componentes, assets, ficha,
   capturas y QA;
3. repetir el mismo bloque cerrado con las posiciones 7–19;
4. ejecutar una consolidación de fidelidad y regresión de todas las tiendas;
5. integrar la rama visual, desplegar y comprobar que landing, `/estilos`, cada
   tienda y sus assets responden correctamente.

Con dos chats, este carril puede comenzar en su worktree mientras el principal
entra en Admin V2, pero debe rebasarse o fusionarse de forma no destructiva sobre
R2.5 antes de verificar e integrar. Con un único Goal, se intercala un tema
después de un bloque principal cerrado cuando no comparta una edición abierta.

Cuando Andreu añada referencias nuevas, entran al final de la cola y se aplican
las mismas reglas. No hace falta una orden adicional de «créame un tema»: el
Goal continuo puede seleccionar el siguiente elemento por sí mismo.

## 7. Núcleo transaccional R2

Después del panel V2, continuar el orden exacto:

1. **R2.6 — Diseño del ledger de inventario — ✅ 2026-08-10.** ADR-0014,
   contrato ejecutable y DDL separados para ledger R2.7/reservas R2.8; sin
   escritura viva ni migración.
2. **R2.7 — Implementación del ledger — ✅ 2026-08-10.** Migración/backfill,
   append-only, disponibilidad por variante, venta/cancelación/admin atómicos,
   espejo legacy y ensayo dump/restore; sin deploy.
3. **R2.8 — Reservas y expiración — ✅ 2026-08-10.** Migración, TTL, liberación,
   captura, carrera de la última unidad y job durable; `INV-004` instalado pero
   apagado por defecto y sin deploy.
4. **R2.9 — Ledger de pagos.** Payment/transaction/refund, proveedor, moneda,
   importe, estado e idempotencia.
5. **R2.10 — Reembolso total.** Admin→proveedor→ledger→evento→email→stock con
   retry seguro.
6. **R2.11 — Fulfillment por líneas.** El envío total actual pasa a ser el caso
   simple del modelo nuevo.
7. **R2.12 — Fulfillment parcial.** Cantidades, múltiples trackings, emails y
   estados derivados.
8. **R2.13 — Cancelación/reembolso parcial.** Selección por cantidad, dinero y
   reposición correctos bajo concurrencia.
9. **R2.14 — Consolidación.** E2E completo, carga, concurrencia y guía de
   migración.

No se salta a promociones, clientes o IA mientras dinero, stock, pago y
fulfillment no tengan primitivas fiables.

## 8. Operación profesional R3

Objetivo: convertir las primitivas R2 en operación diaria completa.

Orden:

1. índice de pedidos escalable;
2. notas, etiquetas y timeline;
3. edición segura de pedido;
4. holds e incidencias;
5. acciones masivas mediante jobs;
6. ubicaciones;
7. transferencias;
8. conteos y ajustes;
9. motor de asignación;
10. devoluciones/RMA;
11. documentos operativos;
12. consolidación multiubicación, fulfillment y devolución.

Cada bloque que añada operación debe completar también su UI administrativa,
responsive, permisos, auditoría y runbook antes de avanzar.

## 9. Modelos comerciales R4

Construir sobre dinero e inventario ya consolidados:

1. motor de reglas de precio;
2. códigos promocionales;
3. descuentos automáticos;
4. cantidad y compra X/Y;
5. combinabilidad y explicación;
6. listas de precios;
7. bundles;
8. tarjeta regalo/crédito;
9. preventa/backorder;
10. suscripciones mediante adaptador;
11. presupuestos y depósitos;
12. consolidación con property tests de dinero.

## 10. Clientes, privacidad y mercados R5

Mantener guest checkout como base y activar complejidad solo por módulo:

1. perfil deduplicable;
2. consentimientos versionados;
3. derechos de datos;
4. cuentas passwordless opcionales;
5. autoservicio;
6. segmentación observable;
7. modelo de mercados;
8. traducciones, URLs y hreflang;
9. publicación por mercado;
10. impuestos por adaptador;
11. multidivisa y métodos locales;
12. consolidación legal, SEO y seguridad.

Las decisiones legales, fiscales o de proveedor que dependan del cliente se
documentan como puertas; no se inventan configuraciones universales.

## 11. B2B R6

Orden:

1. empresas, sedes, contactos y roles;
2. catálogos/listas de precio B2B;
3. mínimos, múltiplos y cajas;
4. condiciones de pago;
5. crédito y aprobaciones;
6. presupuesto/pedido preliminar;
7. PO, factura y conciliación;
8. pedido rápido/repetición;
9. consolidación de permisos y dinero.

## 12. Marketing, analítica y automatización R7

Orden:

1. contrato de eventos analíticos con consentimiento;
2. embudo e informes comerciales;
3. analítica operativa;
4. campañas y atribución;
5. feed Google Merchant/Meta con diagnóstico;
6. adaptador email/CRM;
7. adaptador WhatsApp/SMS;
8. motor de automatizaciones;
9. recetas de ciclo de vida apagadas por defecto;
10. tests/rollouts;
11. consolidación privacidad→pedido→atribución→automatización.

## 13. Storefront, búsqueda y contenido R8

Esta ola consolida el motor visual y absorbe toda la experiencia acumulada al
crear los temas de la cola.

1. contrato de secciones;
2. renderer y presets;
3. migración técnica de temas existentes al contrato común;
4. contenido estructurado;
5. búsqueda escalable;
6. facetas y merchandising;
7. recomendaciones con fallback y medición;
8. consolidación de rendimiento, a11y y SEO.

Hasta R8.3, los temas nuevos respetan el kit actual. Desde R8.3, todos los temas
existentes y futuros usan el contrato de secciones; no se mantienen dos
arquitecturas. El cierre de R8 debe validar el contrato creando o migrando una
tienda visualmente exigente de extremo a extremo sin tocar lógica comercial.

## 14. Integraciones y omnicanalidad R9

1. SDK interno de adaptadores;
2. panel de integraciones sin secretos ni jerga;
3. transporte/etiquetas/tracking con fallback CSV;
4. ERP/facturación;
5. marketplace;
6. POS mediante proveedor elegido;
7. portabilidad/importadores con dry-run;
8. consolidación de caída, replay y reconciliación.

Una integración no pasa a “disponible” solo porque exista un formulario: exige
errores, reintentos, observabilidad, desconexión y reconciliación.

## 15. IA y comercio agéntico R10

No empezar hasta que permisos, audit log, catálogo estructurado, action gateway
y observabilidad estén listos.

1. política y threat model;
2. borradores con fuentes y revisión humana;
3. consultas analíticas seguras;
4. action gateway tipado con dry-run/confirmación/idempotencia;
5. copiloto admin;
6. catálogo para agentes;
7. carrito/checkout agéntico con pagos alojados;
8. red-team, costes, fallos, replay y documentación.

## 16. Escala y madurez R11

1. catálogo reproducible de 10/100k/1M referencias;
2. suite de carga y concurrencia;
3. restore/DR drill;
4. seguridad y privacidad;
5. SLO, alertas y runbooks;
6. presupuestos web en CI;
7. revisión recurrente de bugs, fricción, móvil, bulk, import/export, docs y
   configuración muerta.

R11 convierte la calidad en proceso continuo; no es un cierre que se ejecuta
una sola vez.

## 17. Carriles transversales dentro del mismo objetivo

### Temas, demos e imaginería

- mantener `nuevos-temas/cola.json` como fuente de orden y reanudación;
- terminar siempre el elemento `en_progreso` antes de abrir el siguiente;
- conservar una sola implementación de catálogo, carrito, checkout y gracias;
- generar assets originales, optimizados y versionados dentro del proyecto;
- integrar cada tema en capturas, `/estilos`, landing y conmutador de tiendas;
- ejecutar consolidaciones visuales cuando cambie el motor compartido;
- migrar toda la biblioteca cuando R8 cambie el contrato de storefront.

### UI y UX

Después de cada bloque que añada una capacidad visible:

- completar estados, navegación y responsive;
- probar 1440 y 375;
- revisar foco, teclado, contraste y targets;
- evitar que el panel crezca en carga cognitiva cuando módulos están apagados.

### Wiki y verdad comercial

- actualizar matriz y ficha interna con cada capacidad;
- publicar solo `actual`, `conector` operativo o `gestionado` bien delimitado;
- no prometer como disponible lo meramente especificado;
- ejecutar F12.6 cuando no interfiera con una migración activa: índice docs,
  OG, páginas comerciales, Lighthouse y coherencia de copy.

### Calidad, seguridad y operación

- migraciones siempre ensayadas;
- dependencias solo con justificación y auditoría;
- PII fuera de logs/eventos;
- acciones destructivas confirmadas;
- runbook y observabilidad para todo flujo recuperable.

## 18. Condiciones para detener el `/goal`

El agente continúa mientras exista trabajo autónomo seguro. Solo se detiene si:

1. necesita una decisión reservada de precio, promesa, alcance o gasto;
2. falta un secreto, login/OAuth o autorización externa que no puede sustituir;
3. una migración o acción destructiva necesita aprobación expresa;
4. hay cambios ajenos solapados que no puede preservar con seguridad;
5. todos los bloques de esta ruta y todos los elementos presentes en la cola de
   temas están completos.

No son motivos para detenerse:

- que un bloque sea largo;
- que termine un commit;
- que haya que actualizar documentación;
- que una prueba falle y pueda diagnosticarse;
- que exista otro bloque independiente mientras uno espera una decisión.

## 19. Estado de reanudación obligatorio

Después de cada bloque, aunque el objetivo continúe, dejar en ROADMAP:

- bloque cerrado y evidencia;
- carril (`principal` o `visual`) y estado de la cola si aplica;
- commit/deploy si existen;
- siguiente bloque exacto;
- bloqueo real, si lo hay;
- estado servido frente a estado del repo.

Así, si el objetivo se pausa o el chat cambia, la misma orden puede continuar
sin reconstruir contexto.

## 20. Prompt operativo

El prompt previsto es:

> **`/goal sigue desarrollando este proyecto todo lo que puedas`**

El repositorio convierte esa frase breve en un objetivo medible: seguir ambos
carriles, cerrar bloques de producto y temas en el orden correcto, verificar
cada resultado, actualizar el siguiente paso y continuar hasta bloqueo genuino
o finalización.
