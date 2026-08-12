# ADR-0018 — Colaboración de pedidos y timeline compuesto

- Estado: **aceptado**
- Fecha: 2026-08-12
- Mandato: R3.2

## Contexto

`order_events` registra cambios transaccionales de estado, pero no modela notas
editables, etiquetas ni quién hizo una acción. Ampliar esa tabla mezclaría hechos
de negocio inmutables con contenido colaborativo revisable y obligaría a
reescribir el histórico existente.

## Decisión

1. `order_events` conserva sin cambios su responsabilidad transaccional.
2. `0015_order_collaboration.sql` añade notas actuales, revisiones inmutables,
   catálogo de etiquetas, asignaciones actuales y eventos de asignación.
3. Cada nota declara `internal` o `customer`; crearla genera la revisión 1 y
   editarla exige la versión esperada. Una carrera deja un solo ganador.
4. La edición nunca sobrescribe evidencia: actualiza la proyección
   `order_notes` y añade una fila a `order_note_revisions` en la misma batch.
5. Las asignaciones son idempotentes por `(order_id, tag_id)`. Asignar o retirar
   añade un `order_tag_event` con snapshot de slug y nombre.
6. Toda mutación y su `audit_log` comparten una guarda SQL. El diff solo expone
   visibilidad, versión, cambio de contenido o slug; nunca guarda el cuerpo de
   una nota ni PII de cliente.
7. El timeline es una lectura `UNION ALL` de estados, revisiones y eventos de
   etiqueta, ordenada por instante y desempate estable. La visibilidad de un
   estado es `customer`; las etiquetas son internas.
8. `ORD-004` posee rutas y efectos. Está activo en el preset avanzado; la demo
   pública enseña fixtures, pero elimina formularios y responde `403` antes de
   procesar cualquier mutación.

## Compatibilidad y coste

La migración es expand-only: cinco tablas e índices, sin alterar ni borrar
objetos anteriores. No toca dinero, stock, pagos o PCI; no añade dependencias,
jobs ni servicios. Un Worker anterior ignora las tablas nuevas. El backup sube
a esquema 9 e incluye padres antes que hijos.

## Rollout y rollback

1. restaurar un export reciente en una base aislada y exigir cero FKs;
2. aplicar `0015` y comprobar tablas, índices y restricciones;
3. ensayar create/edit concurrente, assign/remove y backup/restore;
4. aplicar `0015` en la D1 objetivo antes del Worker R3.2;
5. volver al Worker R3.1 sin revertir DDL si falla la presentación o API.

Retirar las tablas es una contracción destructiva separada y requiere otra
decisión y autorización.

## Criterio de terminado

- notas internas/cliente con actor y revisión optimista;
- etiquetas idempotentes y filtro compartible en el índice;
- timeline compuesto sin duplicar estados históricos;
- auditoría atómica sin cuerpos ni PII;
- demo inerte, backup/restore v9, reset, E2E y a11y 1440/375 en verde.
