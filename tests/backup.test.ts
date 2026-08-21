import { describe, expect, it } from 'vitest';
import { BACKUP_SCHEMA_VERSION, BACKUP_TABLES, buildBackupSql, dumpTable } from '../src/lib/backup';
import { seedStatements } from '../seed/seed';
import { createD1BackupReader, exportBackup } from '../src/platform/operations';
import { SqliteD1 } from './sqlite-d1';
import { createOrderBulkActionOperations } from '../src/composition/order-bulk-action-operations';
import { createPreliminaryOrderOperations } from '../src/composition/preliminary-order-operations';

describe('volcado de copia de seguridad', () => {
  it('declara el contrato que incluye la colaboración de pedidos', () => {
    expect(BACKUP_SCHEMA_VERSION).toBe(34);
    expect(buildBackupSql({}, '2026-08-21')).toContain('0041_customer_order_access');
  });

  it('genera INSERTs con columnas explícitas y escape de comillas', () => {
    const stmts = dumpTable('products', [
      { id: 1, name: "Queso d'Ovella", price_cents: 950, image: null },
    ]);
    expect(stmts).toEqual([
      "INSERT INTO products (id, name, price_cents, image) VALUES (1, 'Queso d''Ovella', 950, NULL);",
    ]);
  });

  it('tabla vacía → sin sentencias', () => {
    expect(dumpTable('orders', [])).toEqual([]);
  });

  it('el dump completo borra hijos antes que padres e inserta padres antes que hijos', () => {
    const sql = buildBackupSql({ products: [{ id: 1, slug: 'a' }], order_items: [{ id: 1, order_id: 2 }] }, '2026-07-19');
    const deleteChildren = sql.indexOf('DELETE FROM order_items');
    const deleteParent = sql.indexOf('DELETE FROM orders');
    expect(deleteChildren).toBeGreaterThan(-1);
    expect(deleteChildren).toBeLessThan(deleteParent);
    expect(sql.indexOf('INSERT INTO products')).toBeLessThan(sql.indexOf('INSERT INTO order_items'));
    expect(sql).toContain(`logic2b-backup-schema: ${BACKUP_SCHEMA_VERSION}`);
    expect(sql.indexOf('DELETE FROM product_variant_option_values')).toBeLessThan(
      sql.indexOf('DELETE FROM product_variants'),
    );
    expect(BACKUP_TABLES).toEqual(expect.arrayContaining([
      'product_options',
      'product_option_values',
      'product_variants',
      'product_variant_option_values',
      'product_media',
      'product_variant_media',
      'attribute_definitions',
      'product_attribute_values',
      'inventory_balances',
      'inventory_movements',
      'inventory_reservations',
      'inventory_reservation_lines',
      'inventory_reservation_events',
      'inventory_reservation_balance_events',
      'payments',
      'payment_transactions',
      'refunds',
      'refund_items',
      'fulfillments',
      'fulfillment_items',
      'order_tags',
      'order_notes',
      'order_note_revisions',
      'order_tag_assignments',
      'order_tag_events',
      'order_amendments',
      'order_amendment_lines',
      'refund_payment_allocations',
      'order_holds',
      'order_hold_events',
      'order_bulk_batches',
      'order_bulk_batch_rows',
      'automatic_discounts',
      'automatic_discount_products',
      'automatic_discount_applications',
      'quantity_offers',
      'quantity_offer_tiers',
      'quantity_offer_products',
      'quantity_offer_applications',
      'discount_combination_policies',
      'discount_combination_source_pairs',
      'discount_combination_class_pairs',
      'discount_combination_applications',
      'price_lists',
      'price_list_products',
      'price_list_companies',
      'price_list_applications',
      'bundles',
      'bundle_groups',
      'bundle_components',
      'order_bundle_components',
      'bundle_applications',
      'inventory_transfers',
      'inventory_transfer_lines',
      'inventory_transfer_receipts',
      'inventory_transfer_receipt_lines',
      'inventory_transfer_movements',
      'inventory_counts',
      'inventory_routing_policies',
      'inventory_allocation_decisions',
      'inventory_allocation_lines',
      'inventory_allocation_movements',
      'inventory_count_lines',
      'inventory_count_movements',
      'return_requests',
      'return_request_lines',
      'return_events',
      'return_inventory_movements',
      'bundle_return_inventory_movements',
      'return_exchange_lines',
      'order_document_templates',
      'order_documents',
      'order_document_artifacts',
      'order_document_events',
      'preorder_policies',
      'preorder_commitments',
      'preorder_commitment_events',
      'preorder_allocations',
      'subscription_plans',
      'subscriptions',
      'subscription_provider_events',
      'subscription_events',
      'subscription_cycles',
      'preliminary_orders',
      'preliminary_order_lines',
      'preliminary_order_payment_links',
      'preliminary_order_payments',
      'preliminary_order_events',
      'customer_profiles',
      'customer_address_revisions',
      'customer_profile_merges',
      'customer_consent_evidence',
      'customer_data_rights_evidence',
      'customer_data_rights_plan_decisions',
      'customer_data_rights_artifact_references',
      'customer_auth_identities',
      'customer_session_families',
      'customer_sessions',
      'customer_passwordless_challenges',
      'customer_order_access_refs',
    ]));
    for (const table of BACKUP_TABLES) expect(sql).toContain(`DELETE FROM ${table};`);
  });

  it('el caso de uso pide el contrato completo y genera un nombre estable', async () => {
    const requested: string[][] = [];
    const backup = await exportBackup({
      async readTables(tables) {
        requested.push([...tables]);
        return { products: [{ id: 1, slug: 'a' }] };
      },
    }, new Date('2026-08-06T14:35:00.000Z'));
    expect(requested).toEqual([[...BACKUP_TABLES]]);
    expect(backup.filename).toBe('backup-2026-08-06-1435.sql');
    expect(backup.sql).toContain('INSERT INTO products');
    expect(backup.sql).not.toContain('audit_log');
  });

  it('restaura productos v2, combinaciones y pedidos sin romper FKs', async () => {
    const source = new SqliteD1();
    await source.batch(seedStatements().map((sql) => source.prepare(sql)));
    source.sqlite.exec(`
      INSERT INTO customer_profiles (
        id, primary_email, email_identity_hash, status, version, created_at, updated_at
      ) VALUES ('cus_backup', 'backup-profile@example.com', '${'c'.repeat(64)}',
        'active', 1, '2026-08-08T16:00:00.000Z', '2026-08-08T16:00:00.000Z');
      INSERT INTO customer_address_revisions (
        address_id, customer_profile_id, revision, recipient_name, phone,
        street, city, region, postal_code, country_code, valid_from
      ) VALUES ('addr_backup', 'cus_backup', 1, 'Backup Customer', NULL,
        'Carrer Major 1', 'Castelló', NULL, '12001', 'ES', '2026-08-08T16:00:00.000Z');
      INSERT INTO customer_address_revisions (
        address_id, customer_profile_id, revision, recipient_name, phone,
        street, city, region, postal_code, country_code, valid_from
      ) VALUES ('addr_backup', 'cus_backup', 2, 'Backup Customer', NULL,
        'Carrer Major 2', 'Castelló', NULL, '12001', 'ES', '2026-08-08T17:00:00.000Z');
      INSERT INTO customer_consent_evidence (
        id, customer_profile_id, contact_identity_hash, channel, purpose_id,
        action, notice_id, notice_version, source_kind, source_reference,
        region, occurred_at, recorded_at, withdraws_evidence_id, version,
        idempotency_key
      ) VALUES (
        'consent_backup_001', 'cus_backup', NULL, 'email', 'marketing.newsletter',
        'granted', 'privacy.marketing', '2026-08-08', 'storefront', 'form_footer',
        'ES', '2026-08-08T16:05:00.000Z', '2026-08-08T16:05:01.000Z', NULL, 1,
        'idem:backup:consent:grant'
      );
      INSERT INTO customer_consent_evidence (
        id, customer_profile_id, contact_identity_hash, channel, purpose_id,
        action, notice_id, notice_version, source_kind, source_reference,
        region, occurred_at, recorded_at, withdraws_evidence_id, version,
        idempotency_key
      ) VALUES (
        'consent_backup_002', 'cus_backup', NULL, 'email', 'marketing.newsletter',
        'withdrawn', 'privacy.marketing', '2026-08-08', 'storefront', 'center_preferences',
        'ES', '2026-08-08T16:10:00.000Z', '2026-08-08T16:10:01.000Z',
        'consent_backup_001', 2, 'idem:backup:consent:withdraw'
      );
      INSERT INTO customer_data_rights_evidence (
        id, request_id, customer_profile_id, contact_identity_hash, request_kind,
        action, actor_id, occurred_at, recorded_at, version, idempotency_key,
        request_payload_reference, verification_method_id,
        verification_evidence_reference, plan_id, plan_fingerprint,
        plan_created_by, plan_created_at, reason_id
      ) VALUES
        ('rights_backup_001', 'request:backup:1', 'cus_backup', NULL, 'access',
          'requested', 'actor:requester:1', '2026-08-08T16:15:00.000Z',
          '2026-08-08T16:15:00.000Z', 1, 'idem:backup:rights:request',
          NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
        ('rights_backup_002', 'request:backup:1', 'cus_backup', NULL, 'access',
          'identity_verified', 'actor:verifier:1', '2026-08-08T16:16:00.000Z',
          '2026-08-08T16:16:00.000Z', 2, 'idem:backup:rights:verify',
          NULL, 'method:account_session', 'proof:session:backup',
          NULL, NULL, NULL, NULL, NULL),
        ('rights_backup_003', 'request:backup:1', 'cus_backup', NULL, 'access',
          'plan_attached', 'actor:planner:1', '2026-08-08T16:17:00.000Z',
          '2026-08-08T16:17:00.000Z', 3, 'idem:backup:rights:plan',
          NULL, NULL, NULL, 'plan:backup:1', '${'d'.repeat(64)}',
          'actor:planner:1', '2026-08-08T16:16:30.000Z', NULL);
      INSERT INTO customer_data_rights_plan_decisions (
        evidence_id, owner_id, operation, policy_reason_id, payload_reference, position
      ) VALUES ('rights_backup_003', 'orders:snapshots', 'retain',
        'policy:fiscal_retention', NULL, 0);
      INSERT INTO customer_auth_identities (
        id, customer_profile_id, contact_identity_hash, status, created_at,
        revoked_at, creation_idempotency_key
      ) VALUES ('auth_identity:backup:1', 'cus_backup', '${'c'.repeat(64)}',
        'active', '2026-08-08T16:18:00.000Z', NULL,
        'auth:identity:backup:create');
      INSERT INTO customer_session_families (
        id, identity_id, customer_profile_id, status, created_at,
        absolute_expires_at, revoked_at, revocation_reason_id,
        transition_idempotency_key, version
      ) VALUES ('session_family:backup:1', 'auth_identity:backup:1', 'cus_backup',
        'active', '2026-08-08T16:20:00.000Z', '2026-09-07T16:20:00.000Z',
        NULL, NULL, NULL, 1);
      INSERT INTO customer_session_families (
        id, identity_id, customer_profile_id, status, created_at,
        absolute_expires_at, revoked_at, revocation_reason_id,
        transition_idempotency_key, version
      ) VALUES
        ('session_family:backup:active-v7', 'auth_identity:backup:1', 'cus_backup',
          'active', '2026-08-08T16:20:00.000Z', '2026-09-07T16:20:00.000Z',
          NULL, NULL, NULL, 7),
        ('session_family:backup:expired-v7', 'auth_identity:backup:1', 'cus_backup',
          'active', '2026-08-08T16:20:00.000Z', '2026-09-07T16:20:00.000Z',
          NULL, NULL, NULL, 6),
        ('session_family:backup:revoked-v1', 'auth_identity:backup:1', 'cus_backup',
          'revoked', '2026-08-08T16:20:00.000Z', '2026-09-07T16:20:00.000Z',
          '2026-08-08T16:22:00.000Z', 'reason:security_event',
          'auth:family:backup:revoked-v1', 1);
      INSERT INTO customer_sessions (
        id, family_id, identity_id, customer_profile_id, token_digest,
        can_revoke_sessions, status, issued_at, expires_at, absolute_expires_at,
        generation, rotated_from_session_id, replaced_by_session_id, revoked_at,
        revocation_reason_id, transition_idempotency_key, version
      ) VALUES ('customer_session:backup:1', 'session_family:backup:1',
        'auth_identity:backup:1', 'cus_backup', '${'f'.repeat(64)}', 1, 'active',
        '2026-08-08T16:20:00.000Z', '2026-08-09T16:20:00.000Z',
        '2026-09-07T16:20:00.000Z', 1, NULL, NULL, NULL, NULL, NULL, 1);
      INSERT INTO customer_sessions (
        id, family_id, identity_id, customer_profile_id, token_digest,
        can_revoke_sessions, status, issued_at, expires_at, absolute_expires_at,
        generation, rotated_from_session_id, replaced_by_session_id, revoked_at,
        revocation_reason_id, transition_idempotency_key, version
      ) VALUES ('customer_session:backup:2', 'session_family:backup:1',
        'auth_identity:backup:1', 'cus_backup', '${'2'.repeat(64)}', 1, 'active',
        '2026-08-08T16:21:00.000Z', '2026-08-09T16:21:00.000Z',
        '2026-09-07T16:20:00.000Z', 2, 'customer_session:backup:1', NULL,
        NULL, NULL, NULL, 1);
      INSERT INTO customer_sessions (
        id, family_id, identity_id, customer_profile_id, token_digest,
        can_revoke_sessions, status, issued_at, expires_at, absolute_expires_at,
        generation, rotated_from_session_id, replaced_by_session_id, revoked_at,
        revocation_reason_id, transition_idempotency_key, version
      ) VALUES ('customer_session:backup:3', 'session_family:backup:1',
        'auth_identity:backup:1', 'cus_backup', '${'3'.repeat(64)}', 1, 'active',
        '2026-08-08T16:22:00.000Z', '2026-08-09T16:22:00.000Z',
        '2026-09-07T16:20:00.000Z', 3, 'customer_session:backup:2', NULL,
        NULL, NULL, NULL, 1);
      INSERT INTO customer_sessions (
        id, family_id, identity_id, customer_profile_id, token_digest,
        can_revoke_sessions, status, issued_at, expires_at, absolute_expires_at,
        generation, rotated_from_session_id, replaced_by_session_id, revoked_at,
        revocation_reason_id, transition_idempotency_key, version
      ) VALUES
        ('customer_session:backup:active-v7', 'session_family:backup:active-v7',
          'auth_identity:backup:1', 'cus_backup', '${'4'.repeat(64)}', 0, 'active',
          '2026-08-08T16:20:00.000Z', '2026-08-09T16:20:00.000Z',
          '2026-09-07T16:20:00.000Z', 1, NULL, NULL, NULL, NULL, NULL, 1),
        ('customer_session:backup:expired-v7', 'session_family:backup:expired-v7',
          'auth_identity:backup:1', 'cus_backup', '${'5'.repeat(64)}', 0, 'active',
          '2026-08-08T16:20:00.000Z', '2026-08-09T16:20:00.000Z',
          '2026-09-07T16:20:00.000Z', 1, NULL, NULL, NULL, NULL, NULL, 1);
      UPDATE customer_sessions SET status='rotated',
        replaced_by_session_id='customer_session:backup:2',
        transition_idempotency_key='auth:session:backup:rotate', version=2
      WHERE id='customer_session:backup:1';
      UPDATE customer_sessions SET status='rotated',
        replaced_by_session_id='customer_session:backup:3',
        transition_idempotency_key='auth:session:backup:rotate:2', version=2
      WHERE id='customer_session:backup:2';
      UPDATE customer_sessions SET status='revoked',
        revoked_at='2026-08-08T16:23:00.000Z',
        revocation_reason_id='reason:security_event',
        transition_idempotency_key='auth:session:backup:revoke', version=2
      WHERE id='customer_session:backup:3';
      UPDATE customer_sessions SET status='expired',
        transition_idempotency_key='auth:session:backup:expired-v7', version=2
      WHERE id='customer_session:backup:expired-v7';
      UPDATE customer_session_families SET status='expired',
        transition_idempotency_key='auth:family:backup:expired-v7', version=7
      WHERE id='session_family:backup:expired-v7';
      UPDATE customer_session_families SET status='revoked',
        revoked_at='2026-08-08T16:23:00.000Z',
        revocation_reason_id='reason:security_event',
        transition_idempotency_key='auth:family:backup:revoke', version=2
      WHERE id='session_family:backup:1';
      INSERT INTO customer_passwordless_challenges (
        id, identity_id, method, purpose, provider_reference, secret_digest,
        status, requested_at, expires_at, consumed_at, consumed_by_session_id,
        transition_idempotency_key, version
      ) VALUES
        ('auth_challenge:backup:1', 'auth_identity:backup:1',
          'email_magic_link', 'sign_in', 'provider_challenge:backup:1',
          '${'1'.repeat(64)}', 'consumed', '2026-08-08T16:19:00.000Z',
          '2026-08-08T16:29:00.000Z', '2026-08-08T16:20:00.000Z',
          'customer_session:backup:1', 'auth:challenge:backup:consume', 2),
        ('auth_challenge:backup:final', 'auth_identity:backup:1',
          'email_magic_link', 'sign_in', 'provider_challenge:backup:final',
          '${'6'.repeat(64)}', 'consumed', '2026-08-08T16:21:00.000Z',
          '2026-08-08T16:31:00.000Z', '2026-08-08T16:22:00.000Z',
          'customer_session:backup:3', 'auth:challenge:backup:final', 2),
        ('auth_challenge:backup:pending-before-terminal', 'auth_identity:backup:1',
          'email_magic_link', 'sign_in',
          'provider_challenge:backup:pending-before-terminal', '${'7'.repeat(64)}',
          'pending', '2026-08-08T16:24:00.000Z', '2026-08-08T16:34:00.000Z',
          NULL, NULL, NULL, 1),
        ('auth_challenge:backup:terminal-after-pending', 'auth_identity:backup:1',
          'email_magic_link', 'sign_in',
          'provider_challenge:backup:terminal-after-pending', '${'8'.repeat(64)}',
          'revoked', '2026-08-08T16:25:00.000Z', '2026-08-08T16:35:00.000Z',
          NULL, NULL, 'auth:challenge:backup:terminal', 2);
      UPDATE orders SET customer_profile_id='cus_backup'
      WHERE id=(SELECT id FROM orders ORDER BY id LIMIT 1);
    `);
    const quoteVariant = source.query<{ id: number }>(
      "SELECT id FROM product_variants WHERE status='active' ORDER BY id LIMIT 1",
    )[0]!;
    await createPreliminaryOrderOperations(source.asD1()).create({
      email: 'backup-quote@example.com', customerName: 'Backup quote', addressJson: '{}',
      currency: 'EUR', shippingCents: 0, depositCents: 0, conversionGate: 'approval',
      expiresAt: '2027-01-01T00:00:00.000Z',
      lines: [{ variantId: quoteVariant.id, quantity: 1 }],
      idempotencyKey: 'preliminary:backup:create',
    });
    const reservable = source.query<{
      variant_id: number; reserved: number; reservation_version: number;
    }>(`
      SELECT variant_id, reserved, reservation_version
      FROM inventory_balances WHERE on_hand > reserved ORDER BY variant_id LIMIT 1
    `)[0]!;
    source.sqlite.prepare(`
      INSERT INTO inventory_reservations (
        id, owner_type, owner_id, status, idempotency_key, expires_at,
        version, created_at, updated_at
      ) VALUES (
        'backup-reservation', 'order', 'BACKUP-ORDER', 'active',
        'backup:reservation:create', '2026-08-08T17:00:00.000Z', 1,
        '2026-08-08T16:00:00.000Z', '2026-08-08T16:00:00.000Z'
      )
    `).run();
    source.sqlite.prepare(`
      INSERT INTO inventory_reservation_lines (reservation_id, variant_id, quantity)
      VALUES ('backup-reservation', ?, 1)
    `).run(reservable.variant_id);
    source.sqlite.prepare(`
      INSERT INTO inventory_reservation_balance_events (
        reservation_id, variant_id, transition, quantity_delta, reserved_after,
        reservation_version_after, idempotency_key, occurred_at
      ) VALUES (
        'backup-reservation', ?, 'created', 1, ?, ?,
        'backup:reservation:create:line', '2026-08-08T16:00:00.000Z'
      )
    `).run(
      reservable.variant_id,
      reservable.reserved + 1,
      reservable.reservation_version + 1,
    );
    source.sqlite.prepare(`
      UPDATE inventory_balances
      SET reserved = reserved + 1, reservation_version = reservation_version + 1
      WHERE variant_id = ?
    `).run(reservable.variant_id);
    const bulkOperations = createOrderBulkActionOperations(source.asD1(), {
      now: () => '2026-08-08T16:00:00.000Z',
    });
    const bulkOrderId = Number(source.value("SELECT id AS value FROM orders WHERE order_number = 'BM-DEMO-1004'"));
    const bulkTagId = Number(source.value("SELECT id AS value FROM order_tags WHERE slug = 'prioritario'"));
    const bulkPreview = await bulkOperations.preview({
      orderIds: [bulkOrderId],
      action: { type: 'add_tag', tagId: bulkTagId },
    });
    const bulkBatch = await bulkOperations.confirm(bulkPreview);
    const bundleProducts = source.query<{ id: number }>('SELECT id FROM products ORDER BY id LIMIT 3');
    source.sqlite.exec(`
      INSERT INTO bundles (id, product_id, label, kind, state, version, created_at, updated_at)
      VALUES ('backup-bundle', ${bundleProducts[0]!.id}, 'Bundle en backup', 'fixed', 'disabled', 1,
        '2026-08-08T16:00:00.000Z', '2026-08-08T16:00:00.000Z');
      INSERT INTO bundle_components (bundle_id, group_id, product_id, quantity, is_default, sort_order)
      VALUES ('backup-bundle', NULL, ${bundleProducts[1]!.id}, 2, 1, 0),
        ('backup-bundle', NULL, ${bundleProducts[2]!.id}, 1, 1, 1);
      UPDATE bundles SET state='active' WHERE id='backup-bundle';
    `);
    const backup = await exportBackup(
      createD1BackupReader(source.asD1()),
      new Date('2026-08-08T16:00:00.000Z'),
    );

    const restored = new SqliteD1();
    restored.sqlite.exec(backup.sql);

    for (const table of BACKUP_TABLES) {
      expect(restored.value(`SELECT count(*) AS value FROM ${table}`), table).toBe(
        source.value(`SELECT count(*) AS value FROM ${table}`),
      );
    }
    expect(restored.query(`
      SELECT pv.sku, po.name AS option_name, pov.value
      FROM product_variants pv
      JOIN product_variant_option_values pvov ON pvov.variant_id = pv.id
      JOIN product_options po ON po.id = pvov.option_id
      JOIN product_option_values pov ON pov.id = pvov.option_value_id
      WHERE pv.is_default = 1 AND pv.sku = 'SUM-SHELL-07-M'
    `)).toEqual([{ sku: 'SUM-SHELL-07-M', option_name: 'Talla', value: 'M' }]);
    expect(restored.query('PRAGMA foreign_key_check')).toEqual([]);
    expect(restored.value("SELECT count(*) AS value FROM inventory_reservations WHERE status='active'")).toBe(1);
    expect(restored.query(`SELECT bundle.label, component.quantity FROM bundles bundle
      JOIN bundle_components component ON component.bundle_id=bundle.id
      WHERE bundle.id='backup-bundle' ORDER BY component.sort_order`))
      .toEqual([{ label: 'Bundle en backup', quantity: 2 }, { label: 'Bundle en backup', quantity: 1 }]);
    expect(restored.value(`SELECT count(*) AS value FROM order_bulk_batch_rows
      WHERE batch_id = '${bulkBatch.view.batch.id}' AND outcome = 'pending'`)).toBe(1);
    expect(restored.value('SELECT count(*) AS value FROM orders_search')).toBe(
      restored.value('SELECT count(*) AS value FROM orders'),
    );
    expect(restored.query(`SELECT access.public_ref, access.ownership_version
      FROM customer_order_access_refs access
      JOIN orders ON orders.id=access.order_id
      ORDER BY orders.id`)).toEqual(source.query(`
      SELECT access.public_ref, access.ownership_version
      FROM customer_order_access_refs access
      JOIN orders ON orders.id=access.order_id
      ORDER BY orders.id`));
    expect(restored.query(`SELECT profile.primary_email, address.street
      FROM customer_profiles profile JOIN customer_address_revisions address
        ON address.customer_profile_id=profile.id
      WHERE profile.id='cus_backup' AND address.valid_to IS NULL`)).toEqual([{
      primary_email: 'backup-profile@example.com', street: 'Carrer Major 2',
    }]);
    expect(restored.query(`SELECT action, withdraws_evidence_id, version
      FROM customer_consent_evidence ORDER BY version`)).toEqual([
      { action: 'granted', withdraws_evidence_id: null, version: 1 },
      { action: 'withdrawn', withdraws_evidence_id: 'consent_backup_001', version: 2 },
    ]);
    expect(restored.query(`SELECT evidence.action, evidence.version, decision.operation
      FROM customer_data_rights_evidence evidence
      LEFT JOIN customer_data_rights_plan_decisions decision
        ON decision.evidence_id=evidence.id
      WHERE evidence.request_id='request:backup:1'
      ORDER BY evidence.version`)).toEqual([
      { action: 'requested', version: 1, operation: null },
      { action: 'identity_verified', version: 2, operation: null },
      { action: 'plan_attached', version: 3, operation: 'retain' },
    ]);
    expect(restored.query(`SELECT identity.id AS identity_id, challenge.id AS challenge_id,
      session.status AS session_status, challenge.status AS challenge_status
      FROM customer_auth_identities identity
      JOIN customer_sessions session ON session.identity_id=identity.id
      JOIN customer_passwordless_challenges challenge
        ON challenge.consumed_by_session_id=session.id
      WHERE identity.id='auth_identity:backup:1' ORDER BY challenge.id`)).toEqual([
      {
        identity_id: 'auth_identity:backup:1', challenge_id: 'auth_challenge:backup:1',
        session_status: 'rotated', challenge_status: 'consumed',
      },
      {
        identity_id: 'auth_identity:backup:1', challenge_id: 'auth_challenge:backup:final',
        session_status: 'revoked', challenge_status: 'consumed',
      },
    ]);
    expect(restored.query(`SELECT id, status, version
      FROM customer_passwordless_challenges
      WHERE id IN ('auth_challenge:backup:pending-before-terminal',
        'auth_challenge:backup:terminal-after-pending')
      ORDER BY requested_at`)).toEqual([
      {
        id: 'auth_challenge:backup:pending-before-terminal',
        status: 'pending', version: 1,
      },
      {
        id: 'auth_challenge:backup:terminal-after-pending',
        status: 'revoked', version: 2,
      },
    ]);
    expect(restored.query(`SELECT id, status, generation, rotated_from_session_id,
      replaced_by_session_id, revocation_reason_id, version
      FROM customer_sessions WHERE family_id='session_family:backup:1'
      ORDER BY generation`)).toEqual([
      {
        id: 'customer_session:backup:1', status: 'rotated', generation: 1,
        rotated_from_session_id: null,
        replaced_by_session_id: 'customer_session:backup:2',
        revocation_reason_id: null, version: 2,
      },
      {
        id: 'customer_session:backup:2', status: 'rotated', generation: 2,
        rotated_from_session_id: 'customer_session:backup:1',
        replaced_by_session_id: 'customer_session:backup:3',
        revocation_reason_id: null, version: 2,
      },
      {
        id: 'customer_session:backup:3', status: 'revoked', generation: 3,
        rotated_from_session_id: 'customer_session:backup:2',
        replaced_by_session_id: null,
        revocation_reason_id: 'reason:security_event', version: 2,
      },
    ]);
    expect(restored.query(`SELECT status, revocation_reason_id, version
      FROM customer_session_families WHERE id='session_family:backup:1'`)).toEqual([{
      status: 'revoked', revocation_reason_id: 'reason:security_event', version: 2,
    }]);
    expect(restored.query(`SELECT id, status, version
      FROM customer_session_families
      WHERE id IN ('session_family:backup:active-v7',
        'session_family:backup:expired-v7', 'session_family:backup:revoked-v1')
      ORDER BY id`)).toEqual([
      { id: 'session_family:backup:active-v7', status: 'active', version: 7 },
      { id: 'session_family:backup:expired-v7', status: 'expired', version: 7 },
      { id: 'session_family:backup:revoked-v1', status: 'revoked', version: 1 },
    ]);
    expect(restored.query(`SELECT id, family_id, status, version
      FROM customer_sessions
      WHERE family_id IN ('session_family:backup:active-v7',
        'session_family:backup:expired-v7')
      ORDER BY id`)).toEqual([
      {
        id: 'customer_session:backup:active-v7',
        family_id: 'session_family:backup:active-v7', status: 'active', version: 1,
      },
      {
        id: 'customer_session:backup:expired-v7',
        family_id: 'session_family:backup:expired-v7', status: 'expired', version: 2,
      },
    ]);
  }, 15_000);
});
