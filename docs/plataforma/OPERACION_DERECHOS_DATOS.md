# Operación de evidencia de derechos de datos (`CUS-008`)

## Estado del contrato

R5.3b materializa el contrato de ADR-0041 mediante la migración expand-only
`0038`, un repositorio D1 interno y backup esquema 32. `CUS-008` permanece
`installed` e inerte: no hay ruta HTTP, UI, job, descarga, email ni adaptador
que exporte, corrija, restrinja, anonimice o borre datos.

La persistencia solo admite identificadores y referencias opacas. Las
decisiones del plan y las referencias de artefacto se guardan en tablas
normalizadas; no existe un JSON libre donde introducir filas, SQL, documentos,
emails, teléfonos, direcciones, tokens o payloads protegidos.

Producción continúa en `0032`. `0033`–`0038` requieren un rollout remoto
autorizado y ordenado. La D1 local sirve `0038` con cero solicitudes, decisiones
y referencias de artefacto.

## Preflight y rehearsal

1. Confirmar backup y Time Travel del D1 objetivo.
2. Aplicar y validar primero `0033`–`0037`.
3. Obtener una baseline exacta en `0037`. Si `wrangler d1 export --local`
   rechaza la tabla virtual FTS5, crear una copia consistente con `.backup` y
   volcar esa copia con `/usr/bin/sqlite3 .dump`; nunca operar sobre el origen.
4. Ejecutar:

   ```bash
   pnpm db:rehearse:data-rights-evidence -- \
     --baseline /ruta/baseline-0037.sql \
     --output-dir /ruta/aislada
   ```

5. Exigir el mismo hash antes, después y tras restore para productos,
   variantes, balances, pedidos, líneas, pagos, perfiles, direcciones, merges y
   consentimientos.
6. Comprobar que las tres tablas nuevas tienen cero filas y que
   `foreign_key_check` e `integrity_check` quedan limpios.

El rehearsal local del 2026-08-18 conservó 294 productos, 296 variantes y
balances, 8 pedidos, 13 líneas y 8 pagos, con hash
`490d23851d7f5917f0267c508ebc2e750bf34a9b047d022ec16a109073e01894`.
El dump restaurable ocupa 642.313 bytes; no inventó perfiles, consentimientos,
solicitudes, decisiones ni referencias de artefacto.

## Escritura y concurrencia

- La clave de historial es `request_id`; sujeto y tipo no pueden cambiar.
- El primer hecho siempre es `requested`; cada append exige la versión siguiente
  y un `occurred_at` no anterior al hecho previo.
- `idempotency_key` es globalmente única. Un retry idéntico devuelve `replayed`;
  reutilizarla con otro comando produce el error estable
  `customer_data_rights_conflict` sin datos internos.
- Evidencia, decisiones de plan y referencias de artefacto se insertan en una
  sola `D1.batch`; una carrera deja un ganador y nunca un plan parcial.
- Los triggers impiden `UPDATE`. La aplicación no expone `DELETE`; el borrado
  solo aparece en un restore completo privilegiado.
- Las decisiones solo pueden colgar de `plan_attached`, y las referencias de
  artefacto solo de `completed`. R5.3b no crea ningún productor de estas últimas.

## Activación y gates restantes

Persistir el lifecycle no autoriza a ejecutarlo. Cada proyecto debe aprobar,
antes de abrir superficies o efectos:

1. política, plazo, región, base jurídica, retención y excepciones;
2. prueba de identidad suficiente y almacenamiento protegido de su evidencia;
3. autenticación, scopes, doble control, rate limit y anti-enumeración;
4. adaptadores por propietario con dry-run, idempotencia y audit log;
5. almacenamiento/entrega de exportaciones fuera de D1, con caducidad;
6. textos, notificaciones, runbook de incidencias y revisión competente.

Export HTTP, corrección, restricción, anonimización y borrado conservan gates
independientes. Pedidos, pagos, fulfillments, documentos y audit log no se
eliminan por defecto.

## Backup, reconciliación y rollback

El backup esquema 32 inserta primero evidencia, después decisiones y finalmente
referencias; dentro de cada solicitud ordena los hechos por versión. Restaurar
exige una base con `0038` aplicada.

La reconciliación valida versión continua, contexto estable, tiempos, FKs,
decisiones únicas por propietario y referencias opacas. Los informes usan
recuentos agregados; nunca imprimen sujeto, HMAC, idempotency keys o referencias.

El rollback seguro es de comportamiento: mantener `CUS-008` sin flags y sin
consumidores. No borrar ni contraer las tablas; cualquier contracción futura
requiere política aprobada, export verificado y una migración propia.
