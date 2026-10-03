-- R5.6c.3: políticas y correlación durables, exclusivamente para QA local.
-- Tres tablas aditivas, vacías y append-only. Sin backfill, cron, descriptor
-- registrado ni activación. La cola efímera no forma parte del backup 39.

CREATE TABLE customer_segment_facts_policies (
  policy_id TEXT NOT NULL CHECK (typeof(policy_id) = 'text' AND length(policy_id) BETWEEN 1 AND 200 AND policy_id GLOB '[a-z]*' AND policy_id NOT GLOB '*[^a-z0-9._-]*' AND policy_id NOT GLOB '*[._-][._-]*' AND policy_id NOT GLOB '*[._-]'),
  policy_version INTEGER NOT NULL CHECK (typeof(policy_version) = 'integer' AND policy_version BETWEEN 1 AND 9007199254740991),
  policy_json TEXT NOT NULL CHECK (typeof(policy_json) = 'text' AND json_valid(policy_json) AND json_type(policy_json) = 'object' AND json(policy_json) = policy_json),
  policy_fingerprint TEXT NOT NULL CHECK (typeof(policy_fingerprint) = 'text' AND length(policy_fingerprint) = 64 AND policy_fingerprint NOT GLOB '*[^0-9a-f]*'),
  created_at TEXT NOT NULL CHECK (typeof(created_at) = 'text' AND length(created_at) = 24 AND strftime('%Y-%m-%dT%H:%M:%fZ', created_at, '+0 seconds') IS created_at),
  created_by TEXT NOT NULL CHECK (typeof(created_by) = 'text' AND length(created_by) BETWEEN 1 AND 200 AND created_by GLOB '[a-z]*' AND created_by NOT GLOB '*[^a-z0-9._:-]*'),
  idempotency_key TEXT NOT NULL CHECK (typeof(idempotency_key) = 'text' AND length(idempotency_key) BETWEEN 8 AND 200 AND idempotency_key GLOB '[a-z]*' AND idempotency_key NOT GLOB '*[^a-z0-9._:-]*'),
  command_fingerprint TEXT NOT NULL CHECK (typeof(command_fingerprint) = 'text' AND length(command_fingerprint) = 64 AND command_fingerprint NOT GLOB '*[^0-9a-f]*'),
  PRIMARY KEY (policy_id, policy_version),
  UNIQUE (policy_id, idempotency_key)
);

CREATE TABLE customer_segment_execution_plans (
  run_id TEXT NOT NULL PRIMARY KEY CHECK (typeof(run_id) = 'text' AND length(run_id) BETWEEN 8 AND 200 AND run_id GLOB '[a-z]*' AND run_id NOT GLOB '*[^a-z0-9._:-]*'),
  policy_id TEXT NOT NULL,
  policy_version INTEGER NOT NULL CHECK (typeof(policy_version) = 'integer' AND policy_version BETWEEN 1 AND 9007199254740991),
  batch_size INTEGER NOT NULL CHECK (typeof(batch_size) = 'integer' AND batch_size BETWEEN 1 AND 100),
  created_at TEXT NOT NULL CHECK (typeof(created_at) = 'text' AND length(created_at) = 24 AND strftime('%Y-%m-%dT%H:%M:%fZ', created_at, '+0 seconds') IS created_at),
  created_by TEXT NOT NULL CHECK (typeof(created_by) = 'text' AND length(created_by) BETWEEN 1 AND 200 AND created_by GLOB '[a-z]*' AND created_by NOT GLOB '*[^a-z0-9._:-]*'),
  idempotency_key TEXT NOT NULL UNIQUE CHECK (typeof(idempotency_key) = 'text' AND length(idempotency_key) BETWEEN 8 AND 200 AND idempotency_key GLOB '[a-z]*' AND idempotency_key NOT GLOB '*[^a-z0-9._:-]*'),
  command_fingerprint TEXT NOT NULL CHECK (typeof(command_fingerprint) = 'text' AND length(command_fingerprint) = 64 AND command_fingerprint NOT GLOB '*[^0-9a-f]*'),
  FOREIGN KEY (run_id) REFERENCES customer_segment_runs(run_id) ON DELETE RESTRICT,
  FOREIGN KEY (policy_id, policy_version) REFERENCES customer_segment_facts_policies(policy_id, policy_version) ON DELETE RESTRICT
);

CREATE INDEX idx_customer_segment_execution_plans_policy
  ON customer_segment_execution_plans(policy_id, policy_version);

CREATE TABLE customer_segment_job_intents (
  job_run_id TEXT NOT NULL PRIMARY KEY CHECK (typeof(job_run_id) = 'text' AND length(job_run_id) BETWEEN 1 AND 128 AND job_run_id GLOB '[a-z]*' AND job_run_id NOT GLOB '*[^a-z0-9._:-]*'),
  run_id TEXT NOT NULL,
  expected_revision INTEGER NOT NULL CHECK (typeof(expected_revision) = 'integer' AND expected_revision BETWEEN 1 AND 9007199254740991),
  scheduled_for TEXT NOT NULL CHECK (typeof(scheduled_for) = 'text' AND length(scheduled_for) = 24 AND strftime('%Y-%m-%dT%H:%M:%fZ', scheduled_for, '+0 seconds') IS scheduled_for),
  created_at TEXT NOT NULL CHECK (typeof(created_at) = 'text' AND length(created_at) = 24 AND strftime('%Y-%m-%dT%H:%M:%fZ', created_at, '+0 seconds') IS created_at),
  created_by TEXT NOT NULL CHECK (typeof(created_by) = 'text' AND length(created_by) BETWEEN 1 AND 200 AND created_by GLOB '[a-z]*' AND created_by NOT GLOB '*[^a-z0-9._:-]*'),
  idempotency_key TEXT NOT NULL UNIQUE CHECK (typeof(idempotency_key) = 'text' AND length(idempotency_key) BETWEEN 8 AND 200 AND idempotency_key GLOB '[a-z]*' AND idempotency_key NOT GLOB '*[^a-z0-9._:-]*'),
  command_fingerprint TEXT NOT NULL CHECK (typeof(command_fingerprint) = 'text' AND length(command_fingerprint) = 64 AND command_fingerprint NOT GLOB '*[^0-9a-f]*'),
  UNIQUE (run_id, expected_revision),
  FOREIGN KEY (run_id) REFERENCES customer_segment_execution_plans(run_id) ON DELETE RESTRICT,
  FOREIGN KEY (run_id, expected_revision) REFERENCES customer_segment_run_snapshots(run_id, revision) ON DELETE RESTRICT
);

-- SQLite valida el esquema cerrado y su representación canónica. La aplicación
-- calcula SHA-256 al escribir y lo vuelve a comprobar al leer/restaurar.
CREATE TRIGGER customer_segment_policy_insert_guard
BEFORE INSERT ON customer_segment_facts_policies
BEGIN
  -- REPLACE también es una escritura destructiva aunque SQLite no ejecute los
  -- triggers DELETE internos sin recursive_triggers. Se rechaza antes de PK.
  SELECT RAISE(ABORT, 'customer_segment_policy_conflict') WHERE EXISTS (
    SELECT 1 FROM customer_segment_facts_policies
    WHERE policy_id = NEW.policy_id AND (policy_version = NEW.policy_version OR idempotency_key = NEW.idempotency_key)
  );
  SELECT RAISE(ABORT, 'customer_segment_policy_invalid') WHERE
    NOT json_valid(NEW.policy_json) OR json_type(NEW.policy_json) IS NOT 'object';
  SELECT RAISE(ABORT, 'customer_segment_policy_invalid') WHERE
    (SELECT count(*) FROM json_each(NEW.policy_json)) <> 16 OR
    (SELECT count(DISTINCT key) FROM json_each(NEW.policy_json)) <> 16 OR
    EXISTS (SELECT 1 FROM json_each(NEW.policy_json) WHERE key NOT IN (
      'schemaVersion','id','version','population','orderStatuses','orderEligibility',
      'activityBasis','amountBasis','refunds','storedValue','paymentAdjustments',
      'unsettledPayments','missingPaymentEvidence','currency','foreignCurrency','dayBoundary'
    )) OR
    json_type(NEW.policy_json, '$.schemaVersion') IS NOT 'integer' OR
    json_extract(NEW.policy_json, '$.schemaVersion') IS NOT 1 OR
    json_type(NEW.policy_json, '$.id') IS NOT 'text' OR
    json_extract(NEW.policy_json, '$.id') IS NOT NEW.policy_id OR
    json_type(NEW.policy_json, '$.version') IS NOT 'integer' OR
    json_extract(NEW.policy_json, '$.version') IS NOT NEW.policy_version OR
    json_type(NEW.policy_json, '$.orderStatuses') IS NOT 'array' OR
    json_array_length(NEW.policy_json, '$.orderStatuses') NOT BETWEEN 1 AND 5 OR
    EXISTS (SELECT 1 FROM json_each(NEW.policy_json, '$.orderStatuses')
      WHERE type <> 'text' OR value NOT IN ('pending','paid','shipped','delivered','cancelled')) OR
    (SELECT count(*) FROM json_each(NEW.policy_json, '$.orderStatuses')) <>
      (SELECT count(DISTINCT value) FROM json_each(NEW.policy_json, '$.orderStatuses')) OR
    EXISTS (SELECT 1 FROM json_each(NEW.policy_json, '$.orderStatuses') a
      JOIN json_each(NEW.policy_json, '$.orderStatuses') b ON a.key < b.key
      WHERE CASE a.value WHEN 'pending' THEN 0 WHEN 'paid' THEN 1 WHEN 'shipped' THEN 2 WHEN 'delivered' THEN 3 WHEN 'cancelled' THEN 4 END >
        CASE b.value WHEN 'pending' THEN 0 WHEN 'paid' THEN 1 WHEN 'shipped' THEN 2 WHEN 'delivered' THEN 3 WHEN 'cancelled' THEN 4 END) OR
    EXISTS (SELECT 1 FROM json_each(NEW.policy_json) WHERE key NOT IN ('schemaVersion','version','orderStatuses') AND type <> 'text') OR
    json_extract(NEW.policy_json, '$.population') IS NOT 'active_profiles' OR
    json_extract(NEW.policy_json, '$.orderEligibility') NOT IN ('selected_status','successful_capture') OR
    json_extract(NEW.policy_json, '$.activityBasis') NOT IN ('order_created','first_successful_capture','last_successful_capture') OR
    json_extract(NEW.policy_json, '$.amountBasis') NOT IN ('original_order_total','current_order_total','captured_payments') OR
    json_extract(NEW.policy_json, '$.refunds') NOT IN ('ignore','subtract') OR
    json_extract(NEW.policy_json, '$.storedValue') NOT IN ('exclude','include','included_in_order_total') OR
    json_extract(NEW.policy_json, '$.paymentAdjustments') NOT IN ('reject','ignore') OR
    json_extract(NEW.policy_json, '$.unsettledPayments') NOT IN ('reject','exclude') OR
    json_extract(NEW.policy_json, '$.missingPaymentEvidence') NOT IN ('null','reject') OR
    json_extract(NEW.policy_json, '$.foreignCurrency') NOT IN ('exclude_orders','reject') OR
    json_extract(NEW.policy_json, '$.dayBoundary') NOT IN ('elapsed_24h_floor','utc_calendar_days') OR
    length(json_extract(NEW.policy_json, '$.currency')) <> 3 OR
    json_extract(NEW.policy_json, '$.currency') GLOB '*[^A-Z]*' OR
    (json_extract(NEW.policy_json, '$.amountBasis') = 'captured_payments' AND
      json_extract(NEW.policy_json, '$.storedValue') = 'included_in_order_total') OR
    (json_extract(NEW.policy_json, '$.amountBasis') <> 'captured_payments' AND
      (json_extract(NEW.policy_json, '$.storedValue') <> 'included_in_order_total' OR
       json_extract(NEW.policy_json, '$.refunds') <> 'ignore'));
  SELECT RAISE(ABORT, 'customer_segment_policy_invalid') WHERE NEW.policy_json IS NOT json_object(
    'activityBasis',json_extract(NEW.policy_json,'$.activityBasis'),
    'amountBasis',json_extract(NEW.policy_json,'$.amountBasis'),
    'currency',json_extract(NEW.policy_json,'$.currency'),
    'dayBoundary',json_extract(NEW.policy_json,'$.dayBoundary'),
    'foreignCurrency',json_extract(NEW.policy_json,'$.foreignCurrency'),
    'id',json_extract(NEW.policy_json,'$.id'),
    'missingPaymentEvidence',json_extract(NEW.policy_json,'$.missingPaymentEvidence'),
    'orderEligibility',json_extract(NEW.policy_json,'$.orderEligibility'),
    'orderStatuses',json(json_extract(NEW.policy_json,'$.orderStatuses')),
    'paymentAdjustments',json_extract(NEW.policy_json,'$.paymentAdjustments'),
    'population',json_extract(NEW.policy_json,'$.population'),
    'refunds',json_extract(NEW.policy_json,'$.refunds'),
    'schemaVersion',json_extract(NEW.policy_json,'$.schemaVersion'),
    'storedValue',json_extract(NEW.policy_json,'$.storedValue'),
    'unsettledPayments',json_extract(NEW.policy_json,'$.unsettledPayments'),
    'version',json_extract(NEW.policy_json,'$.version')
  );
END;

CREATE TRIGGER customer_segment_plan_insert_guard
BEFORE INSERT ON customer_segment_execution_plans
BEGIN
  SELECT RAISE(ABORT, 'customer_segment_plan_conflict') WHERE EXISTS (
    SELECT 1 FROM customer_segment_execution_plans WHERE run_id = NEW.run_id OR idempotency_key = NEW.idempotency_key
  );
  SELECT RAISE(ABORT, 'customer_segment_plan_conflict') WHERE NOT EXISTS (
    SELECT 1 FROM customer_segment_runs r
    JOIN customer_segment_run_snapshots s ON s.run_id = r.run_id
      AND s.revision = (SELECT MAX(revision) FROM customer_segment_run_snapshots WHERE run_id = r.run_id)
    JOIN customer_segment_facts_policies p ON p.policy_id = NEW.policy_id AND p.policy_version = NEW.policy_version
    WHERE r.run_id = NEW.run_id AND s.state = 'requested'
      AND NEW.created_at >= r.requested_at AND NEW.created_at >= s.recorded_at AND NEW.created_at >= p.created_at
  );
END;

CREATE TRIGGER customer_segment_planned_snapshot_guard
BEFORE INSERT ON customer_segment_run_snapshots
WHEN EXISTS (
  SELECT 1 FROM customer_segment_execution_plans WHERE run_id = NEW.run_id
)
BEGIN
  SELECT RAISE(ABORT, 'customer_segment_plan_conflict') WHERE EXISTS (
    SELECT 1 FROM customer_segment_execution_plans WHERE run_id = NEW.run_id AND NEW.recorded_at < created_at
  );
  SELECT RAISE(ABORT, 'customer_segment_plan_conflict') WHERE NEW.started_at IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM customer_segment_execution_plans e
    JOIN customer_segment_facts_policies p ON p.policy_id = e.policy_id AND p.policy_version = e.policy_version
    WHERE e.run_id = NEW.run_id AND NEW.facts_policy_id = p.policy_id AND NEW.facts_policy_version = p.policy_version
      AND NEW.currency = json_extract(p.policy_json, '$.currency')
      AND NEW.recorded_at >= e.created_at AND NEW.started_at >= e.created_at
      AND length(NEW.source_snapshot_ref) = 136
      AND substr(NEW.source_snapshot_ref,1,72) = 'source:' || p.policy_fingerprint || ':'
      AND substr(NEW.source_snapshot_ref,73) NOT GLOB '*[^0-9a-f]*'
  );
END;

CREATE TRIGGER customer_segment_intent_insert_guard
BEFORE INSERT ON customer_segment_job_intents
BEGIN
  SELECT RAISE(ABORT, 'customer_segment_intent_conflict') WHERE EXISTS (
    SELECT 1 FROM customer_segment_job_intents WHERE job_run_id = NEW.job_run_id OR idempotency_key = NEW.idempotency_key
      OR (run_id = NEW.run_id AND expected_revision = NEW.expected_revision)
  ) OR EXISTS (
    -- No se puede apropiarse de una identidad que ya pertenece a otra cola.
    SELECT 1 FROM platform_job_runs WHERE run_id = NEW.job_run_id OR idempotency_key = NEW.idempotency_key
  );
  -- La revisión puede ser histórica: el restore reproduce intenciones después
  -- de la historia. Solo la inserción de cola exige que siga vigente y abierta.
  SELECT RAISE(ABORT, 'customer_segment_intent_conflict') WHERE NOT EXISTS (
    SELECT 1 FROM customer_segment_execution_plans p
    JOIN customer_segment_run_snapshots s ON s.run_id = p.run_id AND s.revision = NEW.expected_revision
    WHERE p.run_id = NEW.run_id AND s.state IN ('requested','running')
      AND NEW.created_at >= p.created_at AND NEW.created_at >= s.recorded_at
  );
END;

CREATE TRIGGER customer_segment_job_insert_guard
BEFORE INSERT ON platform_job_runs
WHEN NEW.job_id = 'customers.advance-segment' OR EXISTS (
  SELECT 1 FROM customer_segment_job_intents WHERE job_run_id = NEW.run_id OR idempotency_key = NEW.idempotency_key
)
BEGIN
  SELECT RAISE(ABORT, 'customer_segment_job_conflict') WHERE EXISTS (
    SELECT 1 FROM platform_job_runs WHERE run_id = NEW.run_id OR idempotency_key = NEW.idempotency_key
  );
  SELECT RAISE(ABORT, 'customer_segment_job_conflict') WHERE NOT EXISTS (
    SELECT 1 FROM customer_segment_job_intents i
    JOIN customer_segment_run_snapshots s ON s.run_id = i.run_id AND s.revision = i.expected_revision
    WHERE i.job_run_id = NEW.run_id AND i.idempotency_key = NEW.idempotency_key
      AND NEW.job_id = 'customers.advance-segment' AND NEW.trigger_kind = 'one-off'
      AND NEW.scheduled_for = i.scheduled_for AND NEW.created_at = i.created_at AND NEW.updated_at = i.created_at
      AND NEW.available_at = i.scheduled_for AND NEW.status = 'pending'
      AND NEW.attempt_count = 0 AND NEW.replay_count = 0
      AND NEW.locked_at IS NULL AND NEW.lock_expires_at IS NULL AND NEW.locked_by IS NULL
      AND NEW.completed_at IS NULL AND NEW.dead_at IS NULL AND NEW.last_error_code IS NULL AND NEW.last_error_message IS NULL
      AND s.state IN ('requested','running') AND s.revision = (
        SELECT MAX(revision) FROM customer_segment_run_snapshots WHERE run_id = i.run_id
      )
  );
END;

CREATE TRIGGER customer_segment_job_update_guard
BEFORE UPDATE ON platform_job_runs
WHEN OLD.job_id = 'customers.advance-segment' OR NEW.job_id = 'customers.advance-segment' OR EXISTS (
  SELECT 1 FROM customer_segment_job_intents
  WHERE job_run_id IN (OLD.run_id,NEW.run_id) OR idempotency_key IN (OLD.idempotency_key,NEW.idempotency_key)
)
BEGIN
  SELECT RAISE(ABORT, 'customer_segment_job_conflict') WHERE
    NEW.run_id IS NOT OLD.run_id OR NEW.job_id IS NOT OLD.job_id OR
    NEW.trigger_kind IS NOT OLD.trigger_kind OR NEW.scheduled_for IS NOT OLD.scheduled_for OR
    NEW.idempotency_key IS NOT OLD.idempotency_key OR NEW.created_at IS NOT OLD.created_at;
END;

CREATE TRIGGER customer_segment_policy_no_update BEFORE UPDATE ON customer_segment_facts_policies
BEGIN SELECT RAISE(ABORT, 'customer_segment_policy_immutable'); END;
CREATE TRIGGER customer_segment_policy_no_delete BEFORE DELETE ON customer_segment_facts_policies
BEGIN SELECT RAISE(ABORT, 'customer_segment_policy_immutable'); END;
CREATE TRIGGER customer_segment_plan_no_update BEFORE UPDATE ON customer_segment_execution_plans
BEGIN SELECT RAISE(ABORT, 'customer_segment_plan_immutable'); END;
CREATE TRIGGER customer_segment_plan_no_delete BEFORE DELETE ON customer_segment_execution_plans
BEGIN SELECT RAISE(ABORT, 'customer_segment_plan_immutable'); END;
CREATE TRIGGER customer_segment_intent_no_update BEFORE UPDATE ON customer_segment_job_intents
BEGIN SELECT RAISE(ABORT, 'customer_segment_intent_immutable'); END;
CREATE TRIGGER customer_segment_intent_no_delete BEFORE DELETE ON customer_segment_job_intents
BEGIN SELECT RAISE(ABORT, 'customer_segment_intent_immutable'); END;
