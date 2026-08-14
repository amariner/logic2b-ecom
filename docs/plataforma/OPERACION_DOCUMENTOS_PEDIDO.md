# Operación de documentos de pedido R3.11

## Alcance y frontera fiscal

`ORD-012` genera albaranes y etiquetas internas sin importes. Factura y
rectificativa se emiten siempre en la herramienta fiscal del comercio; el panel
solo registra su referencia y compara el importe con D1. “Anular” en este panel
anula el registro local: cualquier efecto legal debe hacerse primero en el
proveedor.

## Preflight y rollout

1. confirmar backup restaurable en esquema 17 y `PRAGMA foreign_key_check=0`;
2. ensayar `0024_order_documents.sql` con
   `pnpm db:rehearse:documents -- --baseline <dump-0023.sql> --output-dir <dir>`;
3. aplicar `0024` antes del Worker nuevo; la migración no crea plantillas ni
   documentos;
4. desplegar con `ORD-012` desactivada y comprobar tablas, índices y lectura;
5. sembrar o publicar las plantillas declarativas del despliegue;
6. activar rutas y emitir un albarán de un fulfillment no cancelado;
7. contrastar checksum, HTML sin importes, sustitución y restore;
8. registrar una referencia fiscal de prueba ya emitida por el proveedor.

La demo pública incluye dos fixtures ficticios y controles deshabilitados;
crear, anular o sustituir responde 403.

## Reconciliación

```sql
SELECT order_id, document_type,
  coalesce(fulfillment_id, 0) AS fulfillment_scope,
  coalesce(refund_id, 0) AS refund_scope,
  count(*) AS activas
FROM order_documents
WHERE status='active'
GROUP BY order_id, document_type, fulfillment_scope, refund_scope
HAVING count(*) <> 1;

SELECT d.id
FROM order_documents d
LEFT JOIN order_document_artifacts a ON a.document_id=d.id
WHERE (d.source='generated' AND a.document_id IS NULL)
   OR (d.source='external' AND a.document_id IS NOT NULL)
   OR (a.document_id IS NOT NULL AND a.content_sha256<>d.content_sha256);

SELECT d.id
FROM order_documents d JOIN orders o ON o.id=d.order_id
WHERE d.document_type='external_invoice'
  AND (d.expected_amount_cents<>o.total_cents OR d.currency<>upper(o.currency));

SELECT d.id
FROM order_documents d JOIN refunds r ON r.id=d.refund_id
JOIN orders o ON o.id=d.order_id
WHERE d.document_type='external_credit_note'
  AND (r.status<>'succeeded' OR r.order_id<>d.order_id
    OR d.expected_amount_cents<>r.total_cents OR d.currency<>upper(o.currency));

PRAGMA foreign_key_check;
```

## Incidencias

- `409`: otra petición ganó la versión activa; recarga y revisa antes de
  reexpedir.
- `422` al generar: envío cancelado, plantilla inactiva o relación de pedido
  incoherente.
- `422` al registrar: el pedido no está pagado, la rectificativa no tiene un
  reembolso confirmado o la URL no usa HTTPS.
- Artefacto `410`: esa versión está sustituida o anulada; usa la activa.
- Referencia fiscal incorrecta: corrígela en el proveedor y registra una nueva
  versión; no edites D1 a mano.
- Checksum divergente: aísla el artefacto, conserva evidencia y reexpide desde
  la versión activa; nunca sobrescribas contenido histórico.

## Rollback

Desactiva `ORD-012`. Los pedidos, envíos, devoluciones y reembolsos siguen
operativos. Conserva las cuatro tablas y el backup esquema 18. La factura legal
permanece en el proveedor externo; Logic2B no intenta recrearla ni compensarla.
