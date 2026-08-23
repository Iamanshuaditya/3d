-- PostgreSQL target schema for Vortex SQLite schema v15.
-- This is a migration target, not a claim that the runtime adapter is complete.

CREATE TABLE schema_migrations (
  version integer PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE auth_users (
  id text PRIMARY KEY,
  name text NOT NULL,
  email text NOT NULL UNIQUE,
  email_verified boolean NOT NULL DEFAULT false,
  image text,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE TABLE auth_sessions (
  id text PRIMARY KEY,
  expires_at timestamptz NOT NULL,
  token text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  ip_address text,
  user_agent text,
  user_id text NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE
);
CREATE INDEX auth_sessions_user_idx ON auth_sessions(user_id);

CREATE TABLE auth_accounts (
  id text PRIMARY KEY,
  issuer text NOT NULL,
  account_id text NOT NULL,
  provider_id text NOT NULL,
  user_id text NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  access_token text,
  refresh_token text,
  id_token text,
  access_token_expires_at timestamptz,
  refresh_token_expires_at timestamptz,
  scope text,
  password text,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);
CREATE INDEX auth_accounts_user_idx ON auth_accounts(user_id);

CREATE TABLE auth_verifications (
  id text PRIMARY KEY,
  identifier text NOT NULL,
  value text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);
CREATE INDEX auth_verifications_identifier_idx ON auth_verifications(identifier);

CREATE TABLE product_definitions (
  id text PRIMARY KEY,
  status text NOT NULL CHECK (status IN ('draft', 'published')),
  definition_json jsonb NOT NULL,
  current_version_id text,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE TABLE product_versions (
  id text PRIMARY KEY,
  product_id text NOT NULL REFERENCES product_definitions(id) ON DELETE RESTRICT,
  version_number integer NOT NULL CHECK (version_number >= 1),
  version_json jsonb NOT NULL,
  sha256 text NOT NULL CHECK (length(sha256) = 64),
  published_at timestamptz NOT NULL,
  UNIQUE(product_id, version_number)
);
ALTER TABLE product_definitions ADD CONSTRAINT product_definitions_current_version_fk
  FOREIGN KEY (current_version_id) REFERENCES product_versions(id) ON DELETE RESTRICT;

CREATE TABLE design_projects (
  id text PRIMARY KEY,
  title text NOT NULL,
  product_id text NOT NULL,
  product_version_id text NOT NULL REFERENCES product_versions(id) ON DELETE RESTRICT,
  configuration_id text NOT NULL,
  option_selection_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_template_version_id text,
  owner_type text NOT NULL CHECK (owner_type IN ('guest', 'user')),
  owner_id text NOT NULL,
  status text NOT NULL CHECK (status IN ('draft', 'ready_for_preflight', 'production_ready', 'archived')),
  design_json jsonb NOT NULL,
  revision integer NOT NULL CHECK (revision >= 1),
  preview_asset_id text,
  creation_key text,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  UNIQUE(owner_type, owner_id, creation_key)
);
CREATE INDEX design_projects_owner_updated_idx
  ON design_projects(owner_type, owner_id, status, updated_at DESC);

CREATE TABLE project_revisions (
  project_id text NOT NULL REFERENCES design_projects(id) ON DELETE CASCADE,
  revision integer NOT NULL CHECK (revision >= 1),
  design_json jsonb NOT NULL,
  created_at timestamptz NOT NULL,
  PRIMARY KEY (project_id, revision)
);

CREATE TABLE project_assets (
  id text PRIMARY KEY,
  project_id text NOT NULL REFERENCES design_projects(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('artwork', 'preview')),
  filename text NOT NULL,
  mime_type text NOT NULL CHECK (mime_type IN ('image/png', 'image/jpeg', 'image/webp')),
  byte_size bigint NOT NULL CHECK (byte_size > 0),
  width integer NOT NULL CHECK (width > 0),
  height integer NOT NULL CHECK (height > 0),
  sha256 text NOT NULL CHECK (length(sha256) = 64),
  storage_key text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL
);
CREATE INDEX project_assets_project_idx ON project_assets(project_id, kind, created_at);
ALTER TABLE design_projects ADD CONSTRAINT design_projects_preview_asset_fk
  FOREIGN KEY (preview_asset_id) REFERENCES project_assets(id) ON DELETE SET NULL;

CREATE TABLE project_owner_claims (
  guest_id text PRIMARY KEY,
  user_id text NOT NULL,
  project_count integer NOT NULL CHECK (project_count >= 0),
  claimed_at timestamptz NOT NULL
);

CREATE TABLE design_template_definitions (
  id text PRIMARY KEY,
  status text NOT NULL CHECK (status IN ('draft', 'published')),
  definition_json jsonb NOT NULL,
  current_version_id text,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE TABLE design_template_versions (
  id text PRIMARY KEY,
  template_id text NOT NULL REFERENCES design_template_definitions(id) ON DELETE RESTRICT,
  version_number integer NOT NULL CHECK (version_number >= 1),
  version_json jsonb NOT NULL,
  sha256 text NOT NULL CHECK (length(sha256) = 64),
  published_at timestamptz NOT NULL,
  UNIQUE(template_id, version_number)
);
ALTER TABLE design_template_definitions ADD CONSTRAINT template_definitions_current_version_fk
  FOREIGN KEY (current_version_id) REFERENCES design_template_versions(id) ON DELETE RESTRICT;
ALTER TABLE design_projects ADD CONSTRAINT design_projects_template_version_fk
  FOREIGN KEY (source_template_version_id) REFERENCES design_template_versions(id) ON DELETE RESTRICT;

CREATE TABLE template_assets (
  id text PRIMARY KEY,
  filename text NOT NULL,
  mime_type text NOT NULL CHECK (mime_type IN ('image/png', 'image/jpeg', 'image/webp')),
  byte_size bigint NOT NULL CHECK (byte_size > 0),
  width integer NOT NULL CHECK (width > 0),
  height integer NOT NULL CHECK (height > 0),
  sha256 text NOT NULL CHECK (length(sha256) = 64),
  storage_key text NOT NULL UNIQUE,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL
);

CREATE TABLE product_drafts (
  id text PRIMARY KEY,
  product_id text NOT NULL,
  base_version_id text REFERENCES product_versions(id) ON DELETE RESTRICT,
  status text NOT NULL CHECK (status IN ('draft', 'validated', 'published')),
  revision integer NOT NULL CHECK (revision >= 1),
  document_json jsonb NOT NULL,
  validation_json jsonb,
  published_version_id text REFERENCES product_versions(id) ON DELETE RESTRICT,
  created_by text NOT NULL,
  updated_by text NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  onboarding_job_id text,
  onboarding_report_sha256 text CHECK (onboarding_report_sha256 IS NULL OR length(onboarding_report_sha256) = 64),
  onboarding_tool_version text
);
CREATE INDEX product_drafts_product_updated_idx ON product_drafts(product_id, updated_at DESC);

CREATE TABLE onboarding_assets (
  id text PRIMARY KEY,
  job_id text NOT NULL,
  role text NOT NULL CHECK (role IN ('input_glb', 'input_manifest', 'inspection', 'validation_report', 'product_glb', 'product_config', 'regions', 'diagnostic', 'uv_template')),
  filename text NOT NULL,
  mime_type text NOT NULL,
  byte_size bigint NOT NULL CHECK (byte_size > 0),
  sha256 text NOT NULL CHECK (length(sha256) = 64),
  storage_key text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL
);

CREATE TABLE onboarding_jobs (
  id text PRIMARY KEY,
  operator_id text NOT NULL,
  product_id text NOT NULL,
  draft_id text REFERENCES product_drafts(id) ON DELETE SET NULL,
  status text NOT NULL CHECK (status IN ('queued', 'running', 'passed', 'failed', 'cancelled')),
  input_asset_id text NOT NULL REFERENCES onboarding_assets(id) ON DELETE RESTRICT,
  manifest_asset_id text REFERENCES onboarding_assets(id) ON DELETE RESTRICT,
  command_version text NOT NULL,
  started_at timestamptz,
  completed_at timestamptz,
  report_asset_id text REFERENCES onboarding_assets(id) ON DELETE RESTRICT,
  error_code text,
  stdout_text text NOT NULL,
  stderr_text text NOT NULL,
  created_at timestamptz NOT NULL
);
CREATE INDEX onboarding_jobs_product_created_idx ON onboarding_jobs(product_id, created_at DESC);
CREATE INDEX onboarding_jobs_status_created_idx ON onboarding_jobs(status, created_at);
CREATE INDEX onboarding_assets_job_idx ON onboarding_assets(job_id, role, created_at);
ALTER TABLE product_drafts ADD CONSTRAINT product_drafts_onboarding_job_fk
  FOREIGN KEY (onboarding_job_id) REFERENCES onboarding_jobs(id) ON DELETE SET NULL;

CREATE TABLE product_version_onboarding_provenance (
  product_version_id text PRIMARY KEY REFERENCES product_versions(id) ON DELETE RESTRICT,
  onboarding_job_id text NOT NULL REFERENCES onboarding_jobs(id) ON DELETE RESTRICT,
  report_sha256 text NOT NULL CHECK (length(report_sha256) = 64),
  tool_version text NOT NULL CHECK (length(tool_version) = 64),
  recorded_at timestamptz NOT NULL
);

CREATE TABLE product_audit_events (
  id text PRIMARY KEY,
  product_id text NOT NULL,
  draft_id text NOT NULL REFERENCES product_drafts(id) ON DELETE RESTRICT,
  action text NOT NULL CHECK (action IN ('draft_created', 'draft_updated', 'draft_validated', 'draft_validation_failed', 'onboarding_attached', 'version_published')),
  actor_id text NOT NULL,
  draft_revision integer NOT NULL CHECK (draft_revision >= 1),
  product_version_id text REFERENCES product_versions(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL
);
CREATE INDEX product_audit_events_draft_idx ON product_audit_events(draft_id, created_at, id);
CREATE INDEX product_audit_events_product_idx ON product_audit_events(product_id, created_at, id);

CREATE TABLE operator_grants (
  user_id text NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  permission text NOT NULL CHECK (permission IN ('products:read', 'products:edit', 'products:validate', 'products:publish', 'templates:read', 'templates:edit', 'templates:publish', 'assets:upload', 'onboarding:run')),
  granted_by text NOT NULL,
  granted_at timestamptz NOT NULL,
  PRIMARY KEY (user_id, permission)
);
CREATE INDEX operator_grants_permission_idx ON operator_grants(permission, user_id);

CREATE TABLE production_artifacts (
  id text PRIMARY KEY,
  project_id text NOT NULL,
  project_revision integer NOT NULL CHECK (project_revision >= 1),
  product_version_id text NOT NULL REFERENCES product_versions(id) ON DELETE RESTRICT,
  configuration_id text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('pdf', 'svg')),
  mime_type text NOT NULL CHECK ((kind = 'pdf' AND mime_type = 'application/pdf') OR (kind = 'svg' AND mime_type = 'image/svg+xml')),
  filename text NOT NULL,
  byte_size bigint NOT NULL CHECK (byte_size > 0),
  sha256 text NOT NULL CHECK (length(sha256) = 64),
  storage_key text NOT NULL UNIQUE,
  preflight_report_json jsonb NOT NULL,
  created_at timestamptz NOT NULL,
  FOREIGN KEY (project_id, project_revision) REFERENCES project_revisions(project_id, revision) ON DELETE RESTRICT,
  UNIQUE(project_id, project_revision, kind)
);

CREATE TABLE price_quotes (
  id text PRIMARY KEY,
  owner_type text NOT NULL CHECK (owner_type IN ('guest', 'user')),
  owner_id text NOT NULL,
  request_key text NOT NULL,
  request_fingerprint text NOT NULL CHECK (length(request_fingerprint) = 64),
  product_id text NOT NULL,
  product_version_id text NOT NULL REFERENCES product_versions(id) ON DELETE RESTRICT,
  configuration_id text NOT NULL,
  option_selection_json jsonb NOT NULL,
  quantity integer NOT NULL CHECK (quantity BETWEEN 1 AND 1000000),
  quote_kind text NOT NULL CHECK (quote_kind IN ('estimate', 'contract')),
  currency char(3) NOT NULL,
  line_items_json jsonb NOT NULL,
  total_amount_minor bigint NOT NULL CHECK (total_amount_minor >= 0),
  tax_included boolean NOT NULL,
  shipping_included boolean NOT NULL,
  pricing_version text NOT NULL,
  provider_id text NOT NULL,
  provider_reference text,
  created_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  UNIQUE(owner_type, owner_id, request_key)
);

CREATE TABLE personalization_datasets (
  id text PRIMARY KEY,
  domain_dataset_id text NOT NULL,
  owner_type text NOT NULL CHECK (owner_type IN ('guest', 'user')),
  owner_id text NOT NULL,
  template_version_id text NOT NULL REFERENCES design_template_versions(id) ON DELETE RESTRICT,
  sha256 text NOT NULL CHECK (length(sha256) = 64),
  payload_sha256 text NOT NULL CHECK (length(payload_sha256) = 64),
  storage_key text NOT NULL UNIQUE,
  row_count integer NOT NULL CHECK (row_count BETWEEN 1 AND 10000),
  columns_json jsonb NOT NULL,
  report_json jsonb NOT NULL,
  created_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL
);
CREATE INDEX personalization_datasets_owner_created_idx ON personalization_datasets(owner_type, owner_id, created_at DESC);
CREATE INDEX personalization_datasets_expiry_idx ON personalization_datasets(expires_at, id);

CREATE TABLE personalization_jobs (
  id text PRIMARY KEY,
  owner_type text NOT NULL CHECK (owner_type IN ('guest', 'user')),
  owner_id text NOT NULL,
  dataset_id text NOT NULL REFERENCES personalization_datasets(id) ON DELETE CASCADE,
  template_version_id text NOT NULL REFERENCES design_template_versions(id) ON DELETE RESTRICT,
  status text NOT NULL CHECK (status IN ('queued', 'running', 'completed', 'failed', 'cancelled')),
  processed integer NOT NULL CHECK (processed >= 0),
  total integer NOT NULL CHECK (total BETWEEN 1 AND 10000),
  failed integer NOT NULL CHECK (failed >= 0),
  attempt integer NOT NULL CHECK (attempt BETWEEN 0 AND 3),
  max_attempts integer NOT NULL CHECK (max_attempts BETWEEN 1 AND 3),
  idempotency_key text NOT NULL,
  output_storage_key text UNIQUE,
  output_sha256 text CHECK (output_sha256 IS NULL OR length(output_sha256) = 64),
  output_byte_size bigint CHECK (output_byte_size IS NULL OR output_byte_size > 0),
  error_code text,
  created_at timestamptz NOT NULL,
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz NOT NULL,
  CHECK (processed <= total),
  CHECK (failed <= total)
);
CREATE INDEX personalization_jobs_owner_created_idx ON personalization_jobs(owner_type, owner_id, created_at DESC);
CREATE INDEX personalization_jobs_status_created_idx ON personalization_jobs(status, created_at);
CREATE INDEX personalization_jobs_dataset_idx ON personalization_jobs(dataset_id, created_at);

CREATE TABLE production_fonts (
  id text PRIMARY KEY,
  family text NOT NULL,
  weight integer NOT NULL CHECK (weight BETWEEN 100 AND 900 AND weight % 100 = 0),
  style text NOT NULL CHECK (style IN ('normal', 'italic')),
  format text NOT NULL CHECK (format IN ('ttf', 'otf')),
  filename text NOT NULL,
  mime_type text NOT NULL CHECK (mime_type IN ('font/ttf', 'font/otf')),
  byte_size bigint NOT NULL CHECK (byte_size > 0),
  sha256 text NOT NULL CHECK (length(sha256) = 64),
  storage_key text NOT NULL UNIQUE,
  license_name text NOT NULL,
  license_reference text NOT NULL,
  approved_by text NOT NULL,
  created_at timestamptz NOT NULL
);
CREATE INDEX production_fonts_family_idx ON production_fonts(family, weight, style, created_at DESC, id DESC);

CREATE TABLE template_drafts (
  id text PRIMARY KEY,
  template_id text NOT NULL,
  base_version_id text REFERENCES design_template_versions(id) ON DELETE RESTRICT,
  status text NOT NULL CHECK (status IN ('draft', 'validated', 'published')),
  revision integer NOT NULL CHECK (revision >= 1),
  document_json jsonb NOT NULL,
  validation_json jsonb,
  published_version_id text REFERENCES design_template_versions(id) ON DELETE RESTRICT,
  created_by text NOT NULL,
  updated_by text NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);
CREATE INDEX template_drafts_template_updated_idx ON template_drafts(template_id, updated_at DESC, id DESC);

CREATE TABLE template_draft_events (
  id text PRIMARY KEY,
  template_id text NOT NULL,
  draft_id text NOT NULL REFERENCES template_drafts(id) ON DELETE RESTRICT,
  action text NOT NULL CHECK (action IN ('draft_created', 'draft_updated', 'draft_validated', 'draft_validation_failed', 'version_published')),
  actor_id text NOT NULL,
  draft_revision integer NOT NULL CHECK (draft_revision >= 1),
  template_version_id text REFERENCES design_template_versions(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL
);
CREATE INDEX template_draft_events_draft_idx ON template_draft_events(draft_id, created_at, id);

INSERT INTO schema_migrations(version) VALUES (16);
