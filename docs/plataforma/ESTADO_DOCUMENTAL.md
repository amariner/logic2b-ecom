# Gobierno del estado y la documentación

> Contrato de mantenimiento documental. Su objetivo es que código, operación,
> roadmap y comunicación al cliente describan siempre el mismo estado, sin
> duplicar la matriz ni publicar una promesa antes de tiempo.

## Las dos vistas del producto

| Audiencia | Fuente principal | Responde |
|---|---|---|
| Equipo de desarrollo y operación | [`MATRIZ_CAPACIDADES.md`](MATRIZ_CAPACIDADES.md), [`ROADMAP.md`](ROADMAP.md), ADR y runbooks | Qué existe, con qué límites, qué evidencia tiene y cuál es el siguiente bloque. |
| Comercio, agencia o decisor | [`../CAPACIDADES_CLIENTE.md`](../CAPACIDADES_CLIENTE.md), dossier y ayuda operativa | Qué obtiene, qué se puede activar o integrar por proyecto y cómo solicitar una necesidad nueva. |

La matriz conserva el detalle por ID. La ficha de cliente solo traduce ese
estado a una decisión comprensible; no repite migraciones, secretos, amenazas,
IDs internos ni números de test.

## Diccionario de estados

El estado interno de una fila de la matriz y la etiqueta de cliente no son lo
mismo. Esta es la única traducción permitida:

| Estado interno | Puede decirse al cliente | Condición |
|---|---|---|
| `actual` en núcleo | **Incluido** | Está cubierto por pruebas y entra en el alcance de la tienda. |
| `actual` en módulo apagado | **Activable por proyecto** | El rollout, datos, operación y dependencias del cliente están validados. |
| `conector` | **Integrable** | Existe adaptador operativo, healthcheck, manejo de fallos y procedimiento de salida. |
| `gestionado` | **A medida** | Hay un proceso de análisis y responsabilidades explícitas. |
| `parcial`, `especificado`, `pendiente` | **En ruta** o sin mención pública | Nunca se describe como disponible o activable. |
| `excluido` | Fuera de alcance o alternativa externa | No genera una promesa funcional. |

Un módulo con código local pero sin migración, preflight o activación en el
entorno del cliente continúa fuera de la categoría **Activable por proyecto**.
En particular, una demo inerte nunca prueba que una capacidad esté disponible.

## Contrato de demo técnica inerte

La demo pública muestra producto, no opera negocio real. Toda capacidad nueva
que se represente en ella debe cumplir simultáneamente:

1. `DEMO_MODE=true` corta en servidor cobros, emails externos, webhooks,
   proveedores, jobs y mutaciones durables antes de cualquier efecto.
2. El manifest de demo conserva `sideEffects=false` y `jobs=false`; una ruta o
   componente visual no puede cambiar esos flags.
3. La UI usa fixtures, respuestas simuladas o estado local reversible. Si una
   acción necesita D1 para ser comprensible, solo puede leer datos sembrados o
   escribir en un espacio explícitamente efímero y sin consumidor externo.
4. Ningún secreto o cuenta de producción es necesario para navegar la demo.
5. Cada superficie con apariencia de acción real tiene una prueba de aislamiento
   que confirme el código de rechazo y cero llamadas a D1/proveedor cuando
   corresponda.
6. La implementación real permanece detrás de capacidad, configuración,
   preflight y despliegue aislado de cliente. Su activación nunca se deriva de
   que la UI exista.
7. Toda capacidad orientada a comercio/agencia aporta una superficie visual
   inerte con fixtures o queda marcada como **demo visual pendiente** en matriz
   o roadmap. Mientras falte, puede estar cerrada técnicamente, pero no se
   presenta como demostrable a un posible cliente.

La revisión de producto debe permitir que un CEO de ecommerce entienda qué
resuelve la capacidad y qué vería su equipo. La revisión técnica debe garantizar
que esa demostración no compromete datos, dinero, reputación ni infraestructura.

## Actualización obligatoria al cerrar un bloque

La definición de terminado documental se añade a los artefactos técnicos del
bloque, no se deja para una tarea posterior:

1. Actualizar la fila o filas afectadas de `MATRIZ_CAPACIDADES.md` con estado
   real, vía, límites y cualquier condición de rollout.
2. Registrar en `ROADMAP.md` el cierre, evidencia, entorno aplicado y el
   siguiente bloque canónico. Si hay rollout pendiente, distinguir con precisión
   **local**, **desplegado inerte**, **migrado** y **activo para un cliente**.
3. Crear o revisar ADR, runbook, backup/rehearsal y guía de operación cuando el
   contrato, los datos o la recuperación cambien.
4. Revisar `../CAPACIDADES_CLIENTE.md` solo si cambia la clasificación que un
   cliente puede entender o solicitar. Resumir el efecto comercial sin detalles
   sensibles.
5. Si existe o se publica una página web de funcionalidad, aplicar además
   `WIKI_SEO.md`: estado visible, evidencia, límites, CTA y decisión explícita
   de indexación.

Los cambios puramente internos que no alteran capacidad, operación ni promesa
no obligan a reescribir la ficha de cliente. Aun así, el roadmap debe conservar
el cierre técnico si modifica un contrato relevante.

## Checklist de revisión

Antes de integrar un bloque, confirmar:

- [ ] La matriz no llama `actual` a una intención futura ni omite un límite
      material.
- [ ] El roadmap dice dónde vive el cambio: local, remoto, inerte o activo.
- [ ] La ficha de cliente no presenta una capacidad parcial o no desplegada como
      incluida, activable o integrable.
- [ ] Un desarrollo bajo demanda describe resultado, proceso y dependencias; no
      una funcionalidad imaginaria.
- [ ] La ayuda operativa solo explica acciones que el comercio puede realizar en
      su panel real.
- [ ] La demo puede enseñar el flujo sin ejecutar ninguna acción externa o
      durable, y sus controles de aislamiento están probados.
- [ ] La capacidad tiene evidencia visual comprensible para un decisor o deja
      registrada de forma explícita la deuda de demo visual.
- [ ] Cualquier contenido indexable cumple la revisión producto/backend/SEO de
      `WIKI_SEO.md`.

## Cadencia

- **Al cerrar un bloque:** actualización obligatoria de matriz y roadmap.
- **Antes de una propuesta o entrega:** revisar la ficha de cliente frente al
  alcance concreto; el documento general no sustituye la propuesta.
- **Al activar o retirar una capacidad en un cliente:** actualizar su acta de
  entrega, inventario de accesos y guía de operación si cambia el trabajo diario.
- **Cada trimestre o al cambiar la ruta:** revisar la sección «Qué está en
  ruta» de la ficha de cliente para retirar lenguaje obsoleto o especulativo.

## Propiedad

Arquitectura custodia la evidencia y los límites; producto custodia que el copy
no prometa de más; desarrollo actualiza contratos y runbooks; SEO valida toda
publicación indexable. La decisión comercial de incluir una capacidad, fijar
precio, plazo o alcance sigue siendo de Andreu y del acuerdo de proyecto.
