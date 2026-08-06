# ADR-0005 — Transición incremental sin big-bang

- Estado: **accepted**
- Fecha: 2026-08-06
- Mandato: R1.1

## Contexto

El motor tiene contratos de compra probados y una demo aislada. Mover todos los
archivos para simular modularidad arriesgaría dinero, stock, SEO y clonabilidad
sin entregar valor.

## Decisión

Migrar por cortes verticales al tocar cada bloque R: definir puerto, trasladar
caso de uso/adaptador, mantener fachada compatible, ejecutar tests y reducir la
allowlist. No se mueve un archivo si no adquiere propietario/API verificable.

R1.2–R1.5 siguen la tabla de transición de `arquitectura/README.md`. El
composition root se introduce en paralelo; las rutas cambian de dependencia sin
cambiar su respuesta. Cambios de esquema siguen sus propias puertas R2+.

## Alternativas consideradas

- Reescritura completa: rechazada por riesgo y ausencia de feedback incremental.
- Solo renombrar carpetas: rechazado; conserva el acoplamiento.
- Mantener plano hasta tener todas las features: rechazado; multiplica deuda.

## Consecuencias

Durante R1 convivirán estructura plana y módulos nuevos. La allowlist hace
visible esa convivencia y los tests funcionales protegen contratos.

## Invariantes

- Sin cambio HTTP/UI/runtime por un movimiento arquitectónico.
- Sin migración D1 o dependencia incidental.
- Demo, seed, reset interno y configuración clonable conservan comportamiento.
- Cada corte reduce o mantiene excepciones; nunca las desplaza a otro archivo.

## Deuda conocida

La convivencia termina como máximo en R1.12 salvo deuda que requiera explícita
migración R2+. Esas excepciones necesitan ADR/bloque, no comentario informal.

## Señal de revisión

Si un corte vertical no puede preservar un contrato con adaptador/fachada y
tests, se detiene ese corte y se redacta ADR de migración. No autoriza un
big-bang global.
