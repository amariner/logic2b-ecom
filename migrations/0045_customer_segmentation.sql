-- R5.6b: persistencia interna de segmentación calculada, instalada e inactiva.
-- Expansión aditiva sin backfill. No crea productores, jobs, rutas ni consumidores.
-- Las escrituras de candidatos/resultados y su snapshot se ejecutan en un único
-- db.batch transaccional; el snapshot final acredita todo el lote o lo revierte.

CREATE TABLE customer_segment_definitions (
  segment_id TEXT NOT NULL CHECK (typeof(segment_id) = 'text' AND length(segment_id) BETWEEN 1 AND 200 AND segment_id GLOB '[a-z]*' AND segment_id NOT GLOB '*[^a-z0-9._-]*' AND segment_id NOT GLOB '*[._-][._-]*' AND segment_id NOT GLOB '*[._-]'),
  definition_version INTEGER NOT NULL CHECK (typeof(definition_version) = 'integer' AND definition_version BETWEEN 1 AND 9007199254740991),
  template_id TEXT NOT NULL CHECK (typeof(template_id) = 'text' AND length(template_id) BETWEEN 1 AND 200 AND template_id GLOB '[a-z]*' AND template_id NOT GLOB '*[^a-z0-9._-]*' AND template_id NOT GLOB '*[._-][._-]*' AND template_id NOT GLOB '*[._-]'),
  template_version INTEGER NOT NULL CHECK (typeof(template_version) = 'integer' AND template_version BETWEEN 1 AND 9007199254740991),
  template_json TEXT NOT NULL CHECK (json_valid(template_json) AND json_type(template_json) = 'object' AND json(template_json) = template_json),
  parameters_json TEXT NOT NULL CHECK (json_valid(parameters_json) AND json_type(parameters_json) = 'object' AND json(parameters_json) = parameters_json),
  definition_fingerprint TEXT NOT NULL CHECK (typeof(definition_fingerprint) = 'text' AND length(definition_fingerprint) = 64 AND definition_fingerprint NOT GLOB '*[^0-9a-f]*'),
  created_at TEXT NOT NULL CHECK (typeof(created_at) = 'text' AND length(created_at) = 24 AND strftime('%Y-%m-%dT%H:%M:%fZ', created_at, '+0 seconds') IS created_at),
  created_by TEXT NOT NULL CHECK (typeof(created_by) = 'text' AND length(created_by) BETWEEN 1 AND 200 AND created_by NOT GLOB '*[^a-z0-9._:-]*'),
  idempotency_key TEXT NOT NULL CHECK (typeof(idempotency_key) = 'text' AND length(idempotency_key) BETWEEN 8 AND 200 AND idempotency_key NOT GLOB '*[^a-z0-9._:-]*'),
  command_fingerprint TEXT NOT NULL CHECK (typeof(command_fingerprint) = 'text' AND length(command_fingerprint) = 64 AND command_fingerprint NOT GLOB '*[^0-9a-f]*'),
  PRIMARY KEY (segment_id, definition_version),
  UNIQUE (segment_id, idempotency_key)
);

CREATE TABLE customer_segment_runs (
  run_id TEXT NOT NULL CHECK (typeof(run_id) = 'text' AND length(run_id) BETWEEN 8 AND 200 AND run_id NOT GLOB '*[^a-z0-9._:-]*'),
  segment_id TEXT NOT NULL CHECK (typeof(segment_id) = 'text' AND length(segment_id) BETWEEN 1 AND 200 AND segment_id GLOB '[a-z]*' AND segment_id NOT GLOB '*[^a-z0-9._-]*' AND segment_id NOT GLOB '*[._-][._-]*' AND segment_id NOT GLOB '*[._-]'),
  definition_version INTEGER NOT NULL CHECK (typeof(definition_version) = 'integer' AND definition_version BETWEEN 1 AND 9007199254740991),
  generation INTEGER NOT NULL CHECK (typeof(generation) = 'integer' AND generation BETWEEN 1 AND 9007199254740991),
  requested_at TEXT NOT NULL CHECK (typeof(requested_at) = 'text' AND length(requested_at) = 24 AND strftime('%Y-%m-%dT%H:%M:%fZ', requested_at, '+0 seconds') IS requested_at),
  requested_by TEXT NOT NULL CHECK (typeof(requested_by) = 'text' AND length(requested_by) BETWEEN 1 AND 200 AND requested_by NOT GLOB '*[^a-z0-9._:-]*'),
  idempotency_key TEXT NOT NULL CHECK (typeof(idempotency_key) = 'text' AND length(idempotency_key) BETWEEN 8 AND 200 AND idempotency_key NOT GLOB '*[^a-z0-9._:-]*'),
  command_fingerprint TEXT NOT NULL CHECK (typeof(command_fingerprint) = 'text' AND length(command_fingerprint) = 64 AND command_fingerprint NOT GLOB '*[^0-9a-f]*'),
  PRIMARY KEY (run_id),
  UNIQUE (segment_id, generation),
  UNIQUE (segment_id, idempotency_key),
  UNIQUE (run_id, segment_id, definition_version, generation),
  FOREIGN KEY (segment_id, definition_version) REFERENCES customer_segment_definitions(segment_id, definition_version) ON DELETE RESTRICT
);

CREATE TABLE customer_segment_run_snapshots (
  run_id TEXT NOT NULL CHECK (typeof(run_id) = 'text' AND length(run_id) BETWEEN 8 AND 200 AND run_id NOT GLOB '*[^a-z0-9._:-]*'),
  revision INTEGER NOT NULL CHECK (typeof(revision) = 'integer' AND revision BETWEEN 1 AND 9007199254740991),
  state TEXT NOT NULL CHECK (state IN ('requested', 'running', 'completed', 'failed')),
  started_at TEXT CHECK (started_at IS NULL OR (typeof(started_at) = 'text' AND length(started_at) = 24 AND strftime('%Y-%m-%dT%H:%M:%fZ', started_at, '+0 seconds') IS started_at)),
  finished_at TEXT CHECK (finished_at IS NULL OR (typeof(finished_at) = 'text' AND length(finished_at) = 24 AND strftime('%Y-%m-%dT%H:%M:%fZ', finished_at, '+0 seconds') IS finished_at)),
  cursor TEXT CHECK (cursor IS NULL OR (typeof(cursor) = 'text' AND length(cursor) BETWEEN 8 AND 256 AND cursor NOT GLOB '*[^a-z0-9._:-]*')),
  total_candidates INTEGER NOT NULL CHECK (typeof(total_candidates) = 'integer' AND total_candidates BETWEEN 0 AND 9007199254740991),
  processed_candidates INTEGER NOT NULL CHECK (typeof(processed_candidates) = 'integer' AND processed_candidates BETWEEN 0 AND 9007199254740991),
  matched_customers INTEGER NOT NULL CHECK (typeof(matched_customers) = 'integer' AND matched_customers BETWEEN 0 AND 9007199254740991),
  error_code TEXT CHECK (error_code IS NULL OR (typeof(error_code) = 'text' AND length(error_code) BETWEEN 1 AND 200 AND error_code NOT GLOB '*[^a-z0-9._:-]*')),
  source_snapshot_ref TEXT CHECK (source_snapshot_ref IS NULL OR (typeof(source_snapshot_ref) = 'text' AND length(source_snapshot_ref) BETWEEN 1 AND 200 AND source_snapshot_ref NOT GLOB '*[^a-z0-9._:-]*')),
  source_snapshot_fingerprint TEXT CHECK (source_snapshot_fingerprint IS NULL OR (typeof(source_snapshot_fingerprint) = 'text' AND length(source_snapshot_fingerprint) = 64 AND source_snapshot_fingerprint NOT GLOB '*[^0-9a-f]*')),
  facts_policy_id TEXT CHECK (facts_policy_id IS NULL OR (typeof(facts_policy_id) = 'text' AND length(facts_policy_id) BETWEEN 1 AND 200 AND facts_policy_id GLOB '[a-z]*' AND facts_policy_id NOT GLOB '*[^a-z0-9._-]*' AND facts_policy_id NOT GLOB '*[._-][._-]*' AND facts_policy_id NOT GLOB '*[._-]')),
  facts_policy_version INTEGER CHECK (facts_policy_version IS NULL OR (typeof(facts_policy_version) = 'integer' AND facts_policy_version BETWEEN 1 AND 9007199254740991)),
  facts_captured_at TEXT CHECK (facts_captured_at IS NULL OR (typeof(facts_captured_at) = 'text' AND length(facts_captured_at) = 24 AND strftime('%Y-%m-%dT%H:%M:%fZ', facts_captured_at, '+0 seconds') IS facts_captured_at)),
  currency TEXT CHECK (currency IS NULL OR (typeof(currency) = 'text' AND length(currency) = 3 AND currency NOT GLOB '*[^A-Z]*')),
  last_position INTEGER NOT NULL CHECK (typeof(last_position) = 'integer' AND last_position BETWEEN 0 AND 9007199254740991),
  recorded_at TEXT NOT NULL CHECK (typeof(recorded_at) = 'text' AND length(recorded_at) = 24 AND strftime('%Y-%m-%dT%H:%M:%fZ', recorded_at, '+0 seconds') IS recorded_at),
  actor_id TEXT NOT NULL CHECK (typeof(actor_id) = 'text' AND length(actor_id) BETWEEN 1 AND 200 AND actor_id NOT GLOB '*[^a-z0-9._:-]*'),
  idempotency_key TEXT NOT NULL CHECK (typeof(idempotency_key) = 'text' AND length(idempotency_key) BETWEEN 8 AND 200 AND idempotency_key NOT GLOB '*[^a-z0-9._:-]*'),
  command_fingerprint TEXT NOT NULL CHECK (typeof(command_fingerprint) = 'text' AND length(command_fingerprint) = 64 AND command_fingerprint NOT GLOB '*[^0-9a-f]*'),
  PRIMARY KEY (run_id, revision),
  UNIQUE (run_id, idempotency_key),
  FOREIGN KEY (run_id) REFERENCES customer_segment_runs(run_id) ON DELETE RESTRICT,
  CHECK (matched_customers <= processed_candidates AND processed_candidates <= total_candidates AND last_position = processed_candidates),
  CHECK (error_code IS NULL OR (error_code GLOB '[a-z]*' AND error_code NOT GLOB '*[^a-z0-9_.-]*')),
  CHECK ((started_at IS NULL AND source_snapshot_ref IS NULL AND source_snapshot_fingerprint IS NULL AND facts_policy_id IS NULL AND facts_policy_version IS NULL AND facts_captured_at IS NULL AND currency IS NULL) OR (started_at IS NOT NULL AND source_snapshot_ref IS NOT NULL AND source_snapshot_fingerprint IS NOT NULL AND facts_policy_id IS NOT NULL AND facts_policy_version IS NOT NULL AND facts_captured_at IS NOT NULL AND currency IS NOT NULL AND facts_captured_at <= started_at)),
  CHECK ((state = 'requested' AND started_at IS NULL AND finished_at IS NULL AND cursor IS NULL AND total_candidates = 0 AND processed_candidates = 0 AND matched_customers = 0 AND error_code IS NULL) OR (state = 'running' AND started_at IS NOT NULL AND finished_at IS NULL AND ((processed_candidates < total_candidates AND cursor IS NOT NULL) OR (processed_candidates = total_candidates AND cursor IS NULL)) AND error_code IS NULL) OR (state = 'completed' AND started_at IS NOT NULL AND finished_at IS NOT NULL AND cursor IS NULL AND processed_candidates = total_candidates AND error_code IS NULL) OR (state = 'failed' AND finished_at IS NOT NULL AND cursor IS NULL AND error_code IS NOT NULL AND (started_at IS NOT NULL OR (total_candidates = 0 AND processed_candidates = 0 AND matched_customers = 0)))),
  CHECK ((started_at IS NULL OR started_at <= recorded_at) AND (finished_at IS NULL OR (finished_at <= recorded_at AND (started_at IS NULL OR finished_at >= started_at))))
);

CREATE UNIQUE INDEX idx_customer_segment_snapshot_cursor ON customer_segment_run_snapshots(cursor) WHERE cursor IS NOT NULL;
CREATE INDEX idx_customer_segment_snapshot_source ON customer_segment_run_snapshots(source_snapshot_ref) WHERE source_snapshot_ref IS NOT NULL;

CREATE TABLE customer_segment_results (
  run_id TEXT NOT NULL CHECK (typeof(run_id) = 'text' AND length(run_id) BETWEEN 8 AND 200 AND run_id NOT GLOB '*[^a-z0-9._:-]*'),
  customer_profile_id TEXT NOT NULL REFERENCES customer_profiles(id) ON DELETE RESTRICT,
  position INTEGER NOT NULL CHECK (typeof(position) = 'integer' AND position BETWEEN 1 AND 9007199254740991),
  customer_profile_version INTEGER NOT NULL CHECK (typeof(customer_profile_version) = 'integer' AND customer_profile_version BETWEEN 1 AND 9007199254740991),
  facts_json TEXT NOT NULL CHECK (json_valid(facts_json) AND json_type(facts_json) = 'object' AND json(facts_json) = facts_json),
  facts_fingerprint TEXT NOT NULL CHECK (typeof(facts_fingerprint) = 'text' AND length(facts_fingerprint) = 64 AND facts_fingerprint NOT GLOB '*[^0-9a-f]*'),
  matches INTEGER CHECK (matches IS NULL OR (typeof(matches) = 'integer' AND matches IN (0, 1))),
  missing_facts_json TEXT CHECK (missing_facts_json IS NULL OR (json_valid(missing_facts_json) AND json_type(missing_facts_json) = 'array' AND json(missing_facts_json) = missing_facts_json)),
  evaluated_revision INTEGER CHECK (evaluated_revision IS NULL OR (typeof(evaluated_revision) = 'integer' AND evaluated_revision BETWEEN 1 AND 9007199254740991)),
  PRIMARY KEY (run_id, customer_profile_id),
  UNIQUE (run_id, position),
  FOREIGN KEY (run_id) REFERENCES customer_segment_runs(run_id) ON DELETE RESTRICT,
  CHECK ((matches IS NULL AND missing_facts_json IS NULL AND evaluated_revision IS NULL) OR (matches IS NOT NULL AND missing_facts_json IS NOT NULL AND evaluated_revision IS NOT NULL))
);

CREATE INDEX idx_customer_segment_results_revision ON customer_segment_results(run_id, evaluated_revision, position);

CREATE TABLE customer_segment_publications (
  segment_id TEXT NOT NULL CHECK (typeof(segment_id) = 'text' AND length(segment_id) BETWEEN 1 AND 200 AND segment_id GLOB '[a-z]*' AND segment_id NOT GLOB '*[^a-z0-9._-]*' AND segment_id NOT GLOB '*[._-][._-]*' AND segment_id NOT GLOB '*[._-]'),
  publication_version INTEGER NOT NULL CHECK (typeof(publication_version) = 'integer' AND publication_version BETWEEN 1 AND 9007199254740991),
  run_id TEXT NOT NULL CHECK (typeof(run_id) = 'text' AND length(run_id) BETWEEN 8 AND 200 AND run_id NOT GLOB '*[^a-z0-9._:-]*'),
  definition_version INTEGER NOT NULL CHECK (typeof(definition_version) = 'integer' AND definition_version BETWEEN 1 AND 9007199254740991),
  generation INTEGER NOT NULL CHECK (typeof(generation) = 'integer' AND generation BETWEEN 1 AND 9007199254740991),
  published_at TEXT NOT NULL CHECK (typeof(published_at) = 'text' AND length(published_at) = 24 AND strftime('%Y-%m-%dT%H:%M:%fZ', published_at, '+0 seconds') IS published_at),
  published_by TEXT NOT NULL CHECK (typeof(published_by) = 'text' AND length(published_by) BETWEEN 1 AND 200 AND published_by NOT GLOB '*[^a-z0-9._:-]*'),
  idempotency_key TEXT NOT NULL CHECK (typeof(idempotency_key) = 'text' AND length(idempotency_key) BETWEEN 8 AND 200 AND idempotency_key NOT GLOB '*[^a-z0-9._:-]*'),
  command_fingerprint TEXT NOT NULL CHECK (typeof(command_fingerprint) = 'text' AND length(command_fingerprint) = 64 AND command_fingerprint NOT GLOB '*[^0-9a-f]*'),
  PRIMARY KEY (segment_id, publication_version),
  UNIQUE (segment_id, idempotency_key),
  FOREIGN KEY (run_id, segment_id, definition_version, generation) REFERENCES customer_segment_runs(run_id, segment_id, definition_version, generation) ON DELETE RESTRICT
);

CREATE TRIGGER customer_segment_definitions_update_guard
BEFORE UPDATE ON customer_segment_definitions
BEGIN
  SELECT RAISE(ABORT, 'customer_segment_immutable');
END;

CREATE TRIGGER customer_segment_definitions_delete_guard
BEFORE DELETE ON customer_segment_definitions
BEGIN
  SELECT RAISE(ABORT, 'customer_segment_immutable');
END;

CREATE TRIGGER customer_segment_runs_update_guard
BEFORE UPDATE ON customer_segment_runs
BEGIN
  SELECT RAISE(ABORT, 'customer_segment_immutable');
END;

CREATE TRIGGER customer_segment_runs_delete_guard
BEFORE DELETE ON customer_segment_runs
BEGIN
  SELECT RAISE(ABORT, 'customer_segment_immutable');
END;

CREATE TRIGGER customer_segment_run_snapshots_update_guard
BEFORE UPDATE ON customer_segment_run_snapshots
BEGIN
  SELECT RAISE(ABORT, 'customer_segment_immutable');
END;

CREATE TRIGGER customer_segment_run_snapshots_delete_guard
BEFORE DELETE ON customer_segment_run_snapshots
BEGIN
  SELECT RAISE(ABORT, 'customer_segment_immutable');
END;

CREATE TRIGGER customer_segment_publications_update_guard
BEFORE UPDATE ON customer_segment_publications
BEGIN
  SELECT RAISE(ABORT, 'customer_segment_immutable');
END;

CREATE TRIGGER customer_segment_publications_delete_guard
BEFORE DELETE ON customer_segment_publications
BEGIN
  SELECT RAISE(ABORT, 'customer_segment_immutable');
END;

CREATE TRIGGER customer_segment_results_delete_guard
BEFORE DELETE ON customer_segment_results
BEGIN
  SELECT RAISE(ABORT, 'customer_segment_immutable');
END;

-- Valida el lenguaje cerrado también ante escrituras SQL directas. La huella
-- criptográfica y la ordenación canónica de claves se verifican en el repositorio.
CREATE TRIGGER customer_segment_definition_insert_guard
BEFORE INSERT ON customer_segment_definitions
BEGIN
  SELECT RAISE(ABORT, 'customer_segment_definition_conflict')
  WHERE NEW.definition_version <> COALESCE((SELECT MAX(definition_version) + 1
    FROM customer_segment_definitions WHERE segment_id = NEW.segment_id), 1)
    OR EXISTS (SELECT 1 FROM customer_segment_definitions previous
      WHERE previous.segment_id = NEW.segment_id AND previous.created_at > NEW.created_at);

  SELECT RAISE(ABORT, 'customer_segment_template_conflict')
  WHERE EXISTS (SELECT 1 FROM customer_segment_definitions existing
    WHERE existing.template_id = NEW.template_id AND existing.template_version = NEW.template_version
      AND existing.template_json <> NEW.template_json);

  SELECT RAISE(ABORT, 'customer_segment_definition_invalid')
  WHERE json_valid(NEW.template_json) IS NOT 1 OR json_valid(NEW.parameters_json) IS NOT 1
    OR json_type(NEW.template_json) IS NOT 'object' OR json_type(NEW.parameters_json) IS NOT 'object';

  SELECT RAISE(ABORT, 'customer_segment_definition_invalid')
  WHERE (SELECT count(*) FROM json_each(NEW.template_json)) <> 4
    OR (SELECT count(DISTINCT key) FROM json_each(NEW.template_json)
        WHERE key IN ('id', 'version', 'parameters', 'conditions')) <> 4
    OR json_type(NEW.template_json, '$.id') IS NOT 'text'
    OR json_extract(NEW.template_json, '$.id') IS NOT NEW.template_id
    OR json_type(NEW.template_json, '$.version') IS NOT 'integer'
    OR json_extract(NEW.template_json, '$.version') IS NOT NEW.template_version
    OR json_type(NEW.template_json, '$.parameters') IS NOT 'array'
    OR json_type(NEW.template_json, '$.conditions') IS NOT 'array'
    OR json_array_length(NEW.template_json, '$.parameters') = 0
    OR json_array_length(NEW.template_json, '$.conditions') <> json_array_length(NEW.template_json, '$.parameters');

  SELECT RAISE(ABORT, 'customer_segment_definition_invalid')
  WHERE EXISTS (SELECT 1 FROM json_each(NEW.template_json, '$.parameters') parameter
    WHERE parameter.type <> 'object'
      OR (SELECT count(*) FROM json_each(parameter.value)) <> 3
      OR (SELECT count(DISTINCT key) FROM json_each(parameter.value)
          WHERE key IN ('name', 'min', 'max')) <> 3
      OR json_type(parameter.value, '$.name') IS NOT 'text'
      OR length(json_extract(parameter.value, '$.name')) = 0
      OR json_extract(parameter.value, '$.name') NOT GLOB '[a-z]*'
      OR json_extract(parameter.value, '$.name') GLOB '*[^a-z0-9_]*'
      OR json_type(parameter.value, '$.min') IS NOT 'integer'
      OR json_type(parameter.value, '$.max') IS NOT 'integer'
      OR json_extract(parameter.value, '$.min') NOT BETWEEN 0 AND 9007199254740991
      OR json_extract(parameter.value, '$.max') NOT BETWEEN json_extract(parameter.value, '$.min') AND 9007199254740991)
    OR (SELECT count(DISTINCT json_extract(value, '$.name')) FROM json_each(NEW.template_json, '$.parameters'))
        <> json_array_length(NEW.template_json, '$.parameters');

  SELECT RAISE(ABORT, 'customer_segment_definition_invalid')
  WHERE EXISTS (SELECT 1 FROM json_each(NEW.template_json, '$.conditions') condition
    WHERE condition.type <> 'object'
      OR (SELECT count(*) FROM json_each(condition.value)) <> 3
      OR (SELECT count(DISTINCT key) FROM json_each(condition.value)
          WHERE key IN ('fact', 'operator', 'parameter')) <> 3
      OR json_type(condition.value, '$.fact') IS NOT 'text'
      OR json_extract(condition.value, '$.fact') NOT IN ('customer.age_days', 'orders.count', 'orders.days_since_last', 'orders.total_spent_cents')
      OR json_type(condition.value, '$.operator') IS NOT 'text'
      OR json_extract(condition.value, '$.operator') NOT IN ('eq', 'gte', 'lte')
      OR json_type(condition.value, '$.parameter') IS NOT 'text'
      OR NOT EXISTS (SELECT 1 FROM json_each(NEW.template_json, '$.parameters') parameter
          WHERE json_extract(parameter.value, '$.name') = json_extract(condition.value, '$.parameter')))
    OR (SELECT count(DISTINCT json_extract(value, '$.parameter')) FROM json_each(NEW.template_json, '$.conditions'))
        <> json_array_length(NEW.template_json, '$.parameters');

  SELECT RAISE(ABORT, 'customer_segment_definition_invalid')
  WHERE (SELECT count(*) FROM json_each(NEW.parameters_json)) <> json_array_length(NEW.template_json, '$.parameters')
    OR (SELECT count(DISTINCT key) FROM json_each(NEW.parameters_json)) <> json_array_length(NEW.template_json, '$.parameters')
    OR EXISTS (SELECT 1 FROM json_each(NEW.parameters_json) parameter_value
      WHERE parameter_value.type <> 'integer' OR NOT EXISTS (
        SELECT 1 FROM json_each(NEW.template_json, '$.parameters') parameter
        WHERE parameter_value.key = json_extract(parameter.value, '$.name')
          AND parameter_value.value BETWEEN json_extract(parameter.value, '$.min') AND json_extract(parameter.value, '$.max')))
    OR EXISTS (SELECT 1
      FROM json_each(NEW.template_json, '$.conditions') condition
      JOIN json_each(NEW.parameters_json) parameter_value
        ON parameter_value.key = json_extract(condition.value, '$.parameter')
      GROUP BY json_extract(condition.value, '$.fact')
      HAVING MAX(CASE WHEN json_extract(condition.value, '$.operator') IN ('eq', 'gte') THEN parameter_value.value ELSE 0 END)
        > MIN(CASE WHEN json_extract(condition.value, '$.operator') IN ('eq', 'lte') THEN parameter_value.value ELSE 9007199254740991 END));
END;

CREATE TRIGGER customer_segment_run_insert_guard
BEFORE INSERT ON customer_segment_runs
BEGIN
  SELECT RAISE(ABORT, 'customer_segment_run_conflict')
  WHERE NEW.definition_version IS NOT (SELECT MAX(definition_version) FROM customer_segment_definitions WHERE segment_id = NEW.segment_id)
    OR NEW.generation <> COALESCE((SELECT MAX(generation) + 1 FROM customer_segment_runs WHERE segment_id = NEW.segment_id), 1)
    OR NOT EXISTS (SELECT 1 FROM customer_segment_definitions definition
      WHERE definition.segment_id = NEW.segment_id AND definition.definition_version = NEW.definition_version
        AND definition.created_at <= NEW.requested_at);
END;

CREATE TRIGGER customer_segment_snapshot_insert_guard
BEFORE INSERT ON customer_segment_run_snapshots
BEGIN
  SELECT RAISE(ABORT, 'customer_segment_revision_conflict')
  WHERE NEW.revision <> COALESCE((SELECT MAX(revision) + 1 FROM customer_segment_run_snapshots WHERE run_id = NEW.run_id), 1)
    OR (NEW.revision = 1 AND NEW.state <> 'requested')
    OR (NEW.revision > 1 AND NOT EXISTS (SELECT 1 FROM customer_segment_run_snapshots previous
      WHERE previous.run_id = NEW.run_id AND previous.revision = NEW.revision - 1
        AND ((previous.state = 'requested' AND NEW.state IN ('running', 'failed'))
          OR (previous.state = 'running' AND NEW.state IN ('running', 'completed', 'failed')))
        AND NEW.recorded_at >= previous.recorded_at));

  SELECT RAISE(ABORT, 'customer_segment_snapshot_invalid')
  WHERE NOT EXISTS (SELECT 1 FROM customer_segment_runs run WHERE run.run_id = NEW.run_id
      AND NEW.recorded_at >= run.requested_at
      AND (NEW.started_at IS NULL OR NEW.started_at >= run.requested_at)
      AND (NEW.finished_at IS NULL OR NEW.finished_at >= run.requested_at))
    OR EXISTS (SELECT 1 FROM customer_segment_run_snapshots previous
      WHERE previous.run_id = NEW.run_id AND previous.revision = NEW.revision - 1
        AND previous.started_at IS NOT NULL AND (
          NEW.started_at IS NOT previous.started_at OR NEW.total_candidates <> previous.total_candidates
          OR NEW.source_snapshot_ref IS NOT previous.source_snapshot_ref
          OR NEW.source_snapshot_fingerprint IS NOT previous.source_snapshot_fingerprint
          OR NEW.facts_policy_id IS NOT previous.facts_policy_id
          OR NEW.facts_policy_version IS NOT previous.facts_policy_version
          OR NEW.facts_captured_at IS NOT previous.facts_captured_at OR NEW.currency IS NOT previous.currency
          OR NEW.processed_candidates < previous.processed_candidates
          OR NEW.matched_customers < previous.matched_customers
          OR (NEW.state = 'running' AND NEW.processed_candidates <= previous.processed_candidates)
          OR (NEW.state IN ('completed', 'failed') AND (NEW.processed_candidates <> previous.processed_candidates
            OR NEW.matched_customers <> previous.matched_customers))))
    OR EXISTS (SELECT 1 FROM customer_segment_run_snapshots previous
      WHERE previous.run_id = NEW.run_id AND previous.revision = NEW.revision - 1
        AND previous.state = 'requested' AND (NEW.processed_candidates <> 0
          OR NEW.matched_customers <> 0 OR (NEW.state = 'failed' AND NEW.started_at IS NOT NULL)));

  SELECT RAISE(ABORT, 'customer_segment_source_conflict')
  WHERE NEW.source_snapshot_ref IS NOT NULL AND EXISTS (
    SELECT 1 FROM customer_segment_run_snapshots existing
    WHERE existing.source_snapshot_ref = NEW.source_snapshot_ref AND (
      existing.source_snapshot_fingerprint IS NOT NEW.source_snapshot_fingerprint
      OR existing.facts_policy_id IS NOT NEW.facts_policy_id
      OR existing.facts_policy_version IS NOT NEW.facts_policy_version
      OR existing.facts_captured_at IS NOT NEW.facts_captured_at OR existing.currency IS NOT NEW.currency
      OR existing.total_candidates <> NEW.total_candidates));

  SELECT RAISE(ABORT, 'customer_segment_results_conflict')
  WHERE NEW.total_candidates <> (SELECT count(*) FROM customer_segment_results WHERE run_id = NEW.run_id)
    OR NEW.total_candidates <> COALESCE((SELECT MAX(position) FROM customer_segment_results WHERE run_id = NEW.run_id), 0)
    OR NEW.processed_candidates <> (SELECT count(*) FROM customer_segment_results WHERE run_id = NEW.run_id AND evaluated_revision IS NOT NULL)
    OR NEW.matched_customers <> (SELECT count(*) FROM customer_segment_results WHERE run_id = NEW.run_id AND matches = 1)
    OR NEW.last_position <> COALESCE((SELECT MAX(position) FROM customer_segment_results WHERE run_id = NEW.run_id AND evaluated_revision IS NOT NULL), 0)
    OR EXISTS (SELECT 1 FROM customer_segment_results WHERE run_id = NEW.run_id AND evaluated_revision > NEW.revision);
END;

CREATE TRIGGER customer_segment_result_insert_guard
BEFORE INSERT ON customer_segment_results
BEGIN
  SELECT RAISE(ABORT, 'customer_segment_results_conflict')
  WHERE NEW.matches IS NOT NULL OR NEW.missing_facts_json IS NOT NULL OR NEW.evaluated_revision IS NOT NULL
    OR NEW.position <> COALESCE((SELECT MAX(position) + 1 FROM customer_segment_results WHERE run_id = NEW.run_id), 1)
    OR NOT EXISTS (SELECT 1 FROM customer_segment_run_snapshots current
      WHERE current.run_id = NEW.run_id AND current.state = 'requested'
        AND current.revision = (SELECT MAX(revision) FROM customer_segment_run_snapshots WHERE run_id = NEW.run_id));

  SELECT RAISE(ABORT, 'customer_segment_facts_invalid')
  WHERE json_valid(NEW.facts_json) IS NOT 1 OR json_type(NEW.facts_json) IS NOT 'object';

  SELECT RAISE(ABORT, 'customer_segment_facts_invalid')
  WHERE (SELECT count(*) FROM json_each(NEW.facts_json)) <> 4
    OR (SELECT count(DISTINCT key) FROM json_each(NEW.facts_json)
      WHERE key IN ('customer.age_days', 'orders.count', 'orders.days_since_last', 'orders.total_spent_cents')) <> 4
    OR EXISTS (SELECT 1 FROM json_each(NEW.facts_json) fact
      WHERE fact.type NOT IN ('null', 'integer') OR (fact.type = 'integer' AND fact.value NOT BETWEEN 0 AND 9007199254740991));
END;

CREATE TRIGGER customer_segment_result_update_guard
BEFORE UPDATE ON customer_segment_results
BEGIN
  SELECT RAISE(ABORT, 'customer_segment_immutable')
  WHERE NEW.run_id IS NOT OLD.run_id OR NEW.customer_profile_id IS NOT OLD.customer_profile_id
    OR NEW.position IS NOT OLD.position OR NEW.customer_profile_version IS NOT OLD.customer_profile_version
    OR NEW.facts_json IS NOT OLD.facts_json OR NEW.facts_fingerprint IS NOT OLD.facts_fingerprint
    OR OLD.evaluated_revision IS NOT NULL;

  SELECT RAISE(ABORT, 'customer_segment_results_conflict')
  WHERE NEW.matches IS NULL OR NEW.missing_facts_json IS NULL OR NEW.evaluated_revision IS NULL
    OR NOT EXISTS (SELECT 1 FROM customer_segment_run_snapshots current
      WHERE current.run_id = NEW.run_id AND current.revision = NEW.evaluated_revision - 1 AND current.state = 'running'
        AND current.revision = (SELECT MAX(revision) FROM customer_segment_run_snapshots WHERE run_id = NEW.run_id))
    OR NEW.position <> COALESCE((SELECT MAX(position) + 1 FROM customer_segment_results
      WHERE run_id = NEW.run_id AND evaluated_revision IS NOT NULL), 1);

  -- El dominio calcula el resultado; SQL impide confirmar otro resultado para
  -- esos mismos hechos congelados, parámetros y condiciones (incluidos null).
  SELECT RAISE(ABORT, 'customer_segment_evaluation_invalid')
  WHERE NEW.matches IS NOT (SELECT NOT EXISTS (
      SELECT 1 FROM json_each(definition.template_json, '$.conditions') condition
      JOIN json_each(NEW.facts_json) fact ON fact.key = json_extract(condition.value, '$.fact')
      JOIN json_each(definition.parameters_json) parameter ON parameter.key = json_extract(condition.value, '$.parameter')
      WHERE fact.type = 'null' OR NOT CASE json_extract(condition.value, '$.operator')
        WHEN 'eq' THEN fact.value = parameter.value
        WHEN 'gte' THEN fact.value >= parameter.value
        WHEN 'lte' THEN fact.value <= parameter.value END)
    FROM customer_segment_runs run JOIN customer_segment_definitions definition
      ON definition.segment_id = run.segment_id AND definition.definition_version = run.definition_version
    WHERE run.run_id = NEW.run_id)
    OR NEW.missing_facts_json IS NOT (SELECT json_group_array(missing.fact) FROM (
      SELECT json_extract(condition.value, '$.fact') AS fact
      FROM customer_segment_runs run JOIN customer_segment_definitions definition
        ON definition.segment_id = run.segment_id AND definition.definition_version = run.definition_version
      JOIN json_each(definition.template_json, '$.conditions') condition
      JOIN json_each(NEW.facts_json) fact ON fact.key = json_extract(condition.value, '$.fact')
      WHERE run.run_id = NEW.run_id AND fact.type = 'null'
      GROUP BY json_extract(condition.value, '$.fact') ORDER BY MIN(condition.key)
    ) missing);
END;

CREATE TRIGGER customer_segment_publication_insert_guard
BEFORE INSERT ON customer_segment_publications
BEGIN
  SELECT RAISE(ABORT, 'customer_segment_publication_conflict')
  WHERE NEW.publication_version <> COALESCE((SELECT MAX(publication_version) + 1 FROM customer_segment_publications WHERE segment_id = NEW.segment_id), 1)
    OR NEW.generation <= COALESCE((SELECT MAX(generation) FROM customer_segment_publications WHERE segment_id = NEW.segment_id), 0)
    OR NEW.definition_version IS NOT (SELECT MAX(definition_version) FROM customer_segment_definitions WHERE segment_id = NEW.segment_id)
    OR NOT EXISTS (SELECT 1 FROM customer_segment_runs run
      JOIN customer_segment_run_snapshots snapshot ON snapshot.run_id = run.run_id
      WHERE run.run_id = NEW.run_id AND run.segment_id = NEW.segment_id
        AND run.definition_version = NEW.definition_version AND run.generation = NEW.generation
        AND snapshot.state = 'completed' AND snapshot.finished_at <= NEW.published_at
        AND snapshot.revision = (SELECT MAX(revision) FROM customer_segment_run_snapshots WHERE run_id = NEW.run_id))
    OR EXISTS (SELECT 1 FROM customer_segment_publications previous
      WHERE previous.segment_id = NEW.segment_id AND previous.published_at > NEW.published_at);
END;
