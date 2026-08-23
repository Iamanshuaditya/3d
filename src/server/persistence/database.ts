import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { configuredPersistenceBackend } from "./backend";

const SCHEMA_VERSION = 16;

export type VortexDatabase = Database.Database;

function defaultDatabasePath(): string {
  const root = process.env.VORTEX_DATA_DIR || join(process.cwd(), ".data");
  return join(root, "vortex.sqlite");
}

function migrate(database: VortexDatabase) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);
  const current = database
    .prepare("SELECT COALESCE(MAX(version), 0) AS version FROM schema_migrations")
    .get() as { version: number };

  if (current.version < 1) {
    database.transaction(() => {
      database.exec(`
        CREATE TABLE design_projects (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          product_id TEXT NOT NULL,
          product_version_id TEXT NOT NULL,
          owner_type TEXT NOT NULL CHECK (owner_type IN ('guest', 'user')),
          owner_id TEXT NOT NULL,
          status TEXT NOT NULL CHECK (
            status IN ('draft', 'ready_for_preflight', 'production_ready', 'archived')
          ),
          design_json TEXT NOT NULL,
          revision INTEGER NOT NULL CHECK (revision >= 1),
          preview_asset_id TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE INDEX design_projects_owner_updated_idx
          ON design_projects(owner_type, owner_id, status, updated_at DESC);

        CREATE TABLE project_revisions (
          project_id TEXT NOT NULL REFERENCES design_projects(id) ON DELETE CASCADE,
          revision INTEGER NOT NULL CHECK (revision >= 1),
          design_json TEXT NOT NULL,
          created_at TEXT NOT NULL,
          PRIMARY KEY (project_id, revision)
        );

        CREATE TABLE project_assets (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL REFERENCES design_projects(id) ON DELETE CASCADE,
          kind TEXT NOT NULL CHECK (kind IN ('artwork', 'preview')),
          filename TEXT NOT NULL,
          mime_type TEXT NOT NULL CHECK (
            mime_type IN ('image/png', 'image/jpeg', 'image/webp')
          ),
          byte_size INTEGER NOT NULL CHECK (byte_size > 0),
          width INTEGER NOT NULL CHECK (width > 0),
          height INTEGER NOT NULL CHECK (height > 0),
          sha256 TEXT NOT NULL,
          storage_key TEXT NOT NULL UNIQUE,
          created_at TEXT NOT NULL
        );

        CREATE INDEX project_assets_project_idx
          ON project_assets(project_id, kind, created_at);

        INSERT INTO schema_migrations(version, applied_at)
          VALUES (1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
      `);
    })();
  }

  if (current.version < 2) {
    database.transaction(() => {
      database.exec(`
        ALTER TABLE design_projects ADD COLUMN creation_key TEXT;

        CREATE UNIQUE INDEX design_projects_owner_creation_key_idx
          ON design_projects(owner_type, owner_id, creation_key);

        INSERT INTO schema_migrations(version, applied_at)
          VALUES (2, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
      `);
    })();
  }

  if (current.version < 3) {
    database.transaction(() => {
      database.exec(`
        ALTER TABLE design_projects ADD COLUMN configuration_id TEXT;
        ALTER TABLE design_projects
          ADD COLUMN option_selection_json TEXT NOT NULL DEFAULT '{}';

        UPDATE design_projects
          SET configuration_id = product_version_id || '|'
          WHERE configuration_id IS NULL;

        CREATE TABLE product_definitions (
          id TEXT PRIMARY KEY,
          status TEXT NOT NULL CHECK (status IN ('draft', 'published')),
          definition_json TEXT NOT NULL,
          current_version_id TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE product_versions (
          id TEXT PRIMARY KEY,
          product_id TEXT NOT NULL REFERENCES product_definitions(id) ON DELETE RESTRICT,
          version_number INTEGER NOT NULL CHECK (version_number >= 1),
          version_json TEXT NOT NULL,
          sha256 TEXT NOT NULL CHECK (length(sha256) = 64),
          published_at TEXT NOT NULL,
          UNIQUE(product_id, version_number)
        );

        CREATE INDEX product_versions_product_idx
          ON product_versions(product_id, version_number DESC);

        INSERT INTO schema_migrations(version, applied_at)
          VALUES (3, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
      `);
    })();
  }

  if (current.version < 4) {
    database.transaction(() => {
      database.exec(`
        ALTER TABLE design_projects ADD COLUMN source_template_version_id TEXT;

        CREATE TABLE design_template_definitions (
          id TEXT PRIMARY KEY,
          status TEXT NOT NULL CHECK (status IN ('draft', 'published')),
          definition_json TEXT NOT NULL,
          current_version_id TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE design_template_versions (
          id TEXT PRIMARY KEY,
          template_id TEXT NOT NULL
            REFERENCES design_template_definitions(id) ON DELETE RESTRICT,
          version_number INTEGER NOT NULL CHECK (version_number >= 1),
          version_json TEXT NOT NULL,
          sha256 TEXT NOT NULL CHECK (length(sha256) = 64),
          published_at TEXT NOT NULL,
          UNIQUE(template_id, version_number)
        );

        CREATE INDEX design_template_versions_template_idx
          ON design_template_versions(template_id, version_number DESC);

        INSERT INTO schema_migrations(version, applied_at)
          VALUES (4, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
      `);
    })();
  }

  if (current.version < 5) {
    database.transaction(() => {
      database.exec(`
        CREATE TABLE production_artifacts (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL,
          project_revision INTEGER NOT NULL CHECK (project_revision >= 1),
          product_version_id TEXT NOT NULL,
          configuration_id TEXT NOT NULL,
          kind TEXT NOT NULL CHECK (kind IN ('pdf')),
          mime_type TEXT NOT NULL CHECK (mime_type IN ('application/pdf')),
          filename TEXT NOT NULL,
          byte_size INTEGER NOT NULL CHECK (byte_size > 0),
          sha256 TEXT NOT NULL CHECK (length(sha256) = 64),
          storage_key TEXT NOT NULL UNIQUE,
          preflight_report_json TEXT NOT NULL,
          created_at TEXT NOT NULL,
          FOREIGN KEY (project_id, project_revision)
            REFERENCES project_revisions(project_id, revision) ON DELETE RESTRICT,
          UNIQUE(project_id, project_revision, kind)
        );

        CREATE INDEX production_artifacts_project_idx
          ON production_artifacts(project_id, created_at DESC);

        INSERT INTO schema_migrations(version, applied_at)
          VALUES (5, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
      `);
    })();
  }

  if (current.version < 6) {
    database.transaction(() => {
      database.exec(`
        CREATE TABLE production_artifacts_v6 (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL,
          project_revision INTEGER NOT NULL CHECK (project_revision >= 1),
          product_version_id TEXT NOT NULL,
          configuration_id TEXT NOT NULL,
          kind TEXT NOT NULL CHECK (kind IN ('pdf', 'svg')),
          mime_type TEXT NOT NULL CHECK (
            (kind = 'pdf' AND mime_type = 'application/pdf') OR
            (kind = 'svg' AND mime_type = 'image/svg+xml')
          ),
          filename TEXT NOT NULL,
          byte_size INTEGER NOT NULL CHECK (byte_size > 0),
          sha256 TEXT NOT NULL CHECK (length(sha256) = 64),
          storage_key TEXT NOT NULL UNIQUE,
          preflight_report_json TEXT NOT NULL,
          created_at TEXT NOT NULL,
          FOREIGN KEY (project_id, project_revision)
            REFERENCES project_revisions(project_id, revision) ON DELETE RESTRICT,
          UNIQUE(project_id, project_revision, kind)
        );

        INSERT INTO production_artifacts_v6
          SELECT * FROM production_artifacts;

        DROP TABLE production_artifacts;
        ALTER TABLE production_artifacts_v6 RENAME TO production_artifacts;

        CREATE INDEX production_artifacts_project_idx
          ON production_artifacts(project_id, created_at DESC);

        INSERT INTO schema_migrations(version, applied_at)
          VALUES (6, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
      `);
    })();
  }

  if (current.version < 7) {
    database.transaction(() => {
      database.exec(`
        CREATE TABLE product_drafts (
          id TEXT PRIMARY KEY,
          product_id TEXT NOT NULL,
          base_version_id TEXT,
          status TEXT NOT NULL CHECK (
            status IN ('draft', 'validated', 'published')
          ),
          revision INTEGER NOT NULL CHECK (revision >= 1),
          document_json TEXT NOT NULL,
          validation_json TEXT,
          published_version_id TEXT,
          created_by TEXT NOT NULL,
          updated_by TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE INDEX product_drafts_product_updated_idx
          ON product_drafts(product_id, updated_at DESC);
        CREATE INDEX product_drafts_status_updated_idx
          ON product_drafts(status, updated_at DESC);

        CREATE TABLE product_audit_events (
          id TEXT PRIMARY KEY,
          product_id TEXT NOT NULL,
          draft_id TEXT NOT NULL REFERENCES product_drafts(id) ON DELETE RESTRICT,
          action TEXT NOT NULL CHECK (
            action IN (
              'draft_created', 'draft_updated', 'draft_validated',
              'draft_validation_failed', 'version_published'
            )
          ),
          actor_id TEXT NOT NULL,
          draft_revision INTEGER NOT NULL CHECK (draft_revision >= 1),
          product_version_id TEXT,
          created_at TEXT NOT NULL
        );

        CREATE INDEX product_audit_events_draft_idx
          ON product_audit_events(draft_id, created_at, id);
        CREATE INDEX product_audit_events_product_idx
          ON product_audit_events(product_id, created_at, id);

        INSERT INTO schema_migrations(version, applied_at)
          VALUES (7, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
      `);
    })();
  }

  if (current.version < 8) {
    database.transaction(() => {
      database.exec(`
        CREATE TABLE price_quotes (
          id TEXT PRIMARY KEY,
          owner_type TEXT NOT NULL CHECK (owner_type IN ('guest', 'user')),
          owner_id TEXT NOT NULL,
          request_key TEXT NOT NULL,
          request_fingerprint TEXT NOT NULL CHECK (length(request_fingerprint) = 64),
          product_id TEXT NOT NULL,
          product_version_id TEXT NOT NULL
            REFERENCES product_versions(id) ON DELETE RESTRICT,
          configuration_id TEXT NOT NULL,
          option_selection_json TEXT NOT NULL,
          quantity INTEGER NOT NULL CHECK (quantity >= 1 AND quantity <= 1000000),
          quote_kind TEXT NOT NULL CHECK (quote_kind IN ('estimate', 'contract')),
          currency TEXT NOT NULL CHECK (length(currency) = 3),
          line_items_json TEXT NOT NULL,
          total_amount_minor INTEGER NOT NULL CHECK (total_amount_minor >= 0),
          tax_included INTEGER NOT NULL CHECK (tax_included IN (0, 1)),
          shipping_included INTEGER NOT NULL CHECK (shipping_included IN (0, 1)),
          pricing_version TEXT NOT NULL,
          provider_id TEXT NOT NULL,
          provider_reference TEXT,
          created_at TEXT NOT NULL,
          expires_at TEXT NOT NULL,
          UNIQUE(owner_type, owner_id, request_key)
        );

        CREATE INDEX price_quotes_owner_created_idx
          ON price_quotes(owner_type, owner_id, created_at DESC);
        CREATE INDEX price_quotes_product_version_idx
          ON price_quotes(product_id, product_version_id, created_at DESC);

        INSERT INTO schema_migrations(version, applied_at)
          VALUES (8, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
      `);
    })();
  }

  if (current.version < 9) {
    database.transaction(() => {
      database.exec(`
        CREATE TABLE auth_users (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          email TEXT NOT NULL UNIQUE,
          emailVerified INTEGER NOT NULL CHECK (emailVerified IN (0, 1)),
          image TEXT,
          createdAt DATE NOT NULL,
          updatedAt DATE NOT NULL
        );

        CREATE TABLE auth_sessions (
          id TEXT PRIMARY KEY,
          expiresAt DATE NOT NULL,
          token TEXT NOT NULL UNIQUE,
          createdAt DATE NOT NULL,
          updatedAt DATE NOT NULL,
          ipAddress TEXT,
          userAgent TEXT,
          userId TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE
        );

        CREATE INDEX auth_sessions_userId_idx ON auth_sessions(userId);

        CREATE TABLE auth_accounts (
          id TEXT PRIMARY KEY,
          issuer TEXT NOT NULL,
          accountId TEXT NOT NULL,
          providerId TEXT NOT NULL,
          userId TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
          accessToken TEXT,
          refreshToken TEXT,
          idToken TEXT,
          accessTokenExpiresAt DATE,
          refreshTokenExpiresAt DATE,
          scope TEXT,
          password TEXT,
          createdAt DATE NOT NULL,
          updatedAt DATE NOT NULL
        );

        CREATE UNIQUE INDEX auth_accounts_issuer_accountId_uidx
          ON auth_accounts(issuer, accountId);
        CREATE INDEX auth_accounts_userId_idx ON auth_accounts(userId);

        CREATE TABLE auth_verifications (
          id TEXT PRIMARY KEY,
          identifier TEXT NOT NULL,
          value TEXT NOT NULL,
          expiresAt DATE NOT NULL,
          createdAt DATE NOT NULL,
          updatedAt DATE NOT NULL
        );

        CREATE INDEX auth_verifications_identifier_idx
          ON auth_verifications(identifier);

        CREATE TABLE project_owner_claims (
          guest_id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          project_count INTEGER NOT NULL CHECK (project_count >= 0),
          claimed_at TEXT NOT NULL
        );

        INSERT INTO schema_migrations(version, applied_at)
          VALUES (9, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
      `);
    })();
  }

  if (current.version < 10) {
    database.transaction(() => {
      database.exec(`
        CREATE TABLE template_assets (
          id TEXT PRIMARY KEY,
          filename TEXT NOT NULL,
          mime_type TEXT NOT NULL CHECK (
            mime_type IN ('image/png', 'image/jpeg', 'image/webp')
          ),
          byte_size INTEGER NOT NULL CHECK (byte_size > 0),
          width INTEGER NOT NULL CHECK (width > 0),
          height INTEGER NOT NULL CHECK (height > 0),
          sha256 TEXT NOT NULL CHECK (length(sha256) = 64),
          storage_key TEXT NOT NULL UNIQUE,
          created_by TEXT NOT NULL,
          created_at TEXT NOT NULL
        );

        CREATE INDEX template_assets_checksum_idx
          ON template_assets(sha256, created_at DESC);

        INSERT INTO schema_migrations(version, applied_at)
          VALUES (10, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
      `);
    })();
  }

  if (current.version < 11) {
    database.transaction(() => {
      database.exec(`
        CREATE TABLE operator_grants (
          user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
          permission TEXT NOT NULL CHECK (permission IN (
            'products:read', 'products:edit', 'products:validate', 'products:publish',
            'templates:read', 'templates:edit', 'templates:publish',
            'assets:upload', 'onboarding:run'
          )),
          granted_by TEXT NOT NULL,
          granted_at TEXT NOT NULL,
          PRIMARY KEY (user_id, permission)
        );

        CREATE INDEX operator_grants_permission_idx
          ON operator_grants(permission, user_id);

        INSERT INTO schema_migrations(version, applied_at)
          VALUES (11, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
      `);
    })();
  }

  if (current.version < 12) {
    database.transaction(() => {
      database.exec(`
        CREATE TABLE onboarding_assets (
          id TEXT PRIMARY KEY,
          job_id TEXT NOT NULL,
          role TEXT NOT NULL CHECK (role IN (
            'input_glb', 'input_manifest', 'inspection', 'validation_report',
            'product_glb', 'product_config', 'regions', 'diagnostic', 'uv_template'
          )),
          filename TEXT NOT NULL,
          mime_type TEXT NOT NULL,
          byte_size INTEGER NOT NULL CHECK (byte_size > 0),
          sha256 TEXT NOT NULL CHECK (length(sha256) = 64),
          storage_key TEXT NOT NULL UNIQUE,
          created_at TEXT NOT NULL
        );

        CREATE TABLE onboarding_jobs (
          id TEXT PRIMARY KEY,
          operator_id TEXT NOT NULL,
          product_id TEXT NOT NULL,
          draft_id TEXT REFERENCES product_drafts(id) ON DELETE SET NULL,
          status TEXT NOT NULL CHECK (
            status IN ('queued', 'running', 'passed', 'failed', 'cancelled')
          ),
          input_asset_id TEXT NOT NULL REFERENCES onboarding_assets(id) ON DELETE RESTRICT,
          manifest_asset_id TEXT REFERENCES onboarding_assets(id) ON DELETE RESTRICT,
          command_version TEXT NOT NULL,
          started_at TEXT,
          completed_at TEXT,
          report_asset_id TEXT REFERENCES onboarding_assets(id) ON DELETE RESTRICT,
          error_code TEXT,
          stdout_text TEXT NOT NULL,
          stderr_text TEXT NOT NULL,
          created_at TEXT NOT NULL
        );

        CREATE INDEX onboarding_jobs_product_created_idx
          ON onboarding_jobs(product_id, created_at DESC);
        CREATE INDEX onboarding_jobs_status_created_idx
          ON onboarding_jobs(status, created_at);
        CREATE INDEX onboarding_assets_job_idx
          ON onboarding_assets(job_id, role, created_at);

        INSERT INTO schema_migrations(version, applied_at)
          VALUES (12, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
      `);
    })();
  }

  if (current.version < 13) {
    database.transaction(() => {
      database.exec(`
        ALTER TABLE product_drafts ADD COLUMN onboarding_job_id TEXT;
        ALTER TABLE product_drafts ADD COLUMN onboarding_report_sha256 TEXT;
        ALTER TABLE product_drafts ADD COLUMN onboarding_tool_version TEXT;

        CREATE TABLE product_version_onboarding_provenance (
          product_version_id TEXT PRIMARY KEY
            REFERENCES product_versions(id) ON DELETE RESTRICT,
          onboarding_job_id TEXT NOT NULL
            REFERENCES onboarding_jobs(id) ON DELETE RESTRICT,
          report_sha256 TEXT NOT NULL CHECK (length(report_sha256) = 64),
          tool_version TEXT NOT NULL CHECK (length(tool_version) = 64),
          recorded_at TEXT NOT NULL
        );

        CREATE TABLE product_audit_events_v13 (
          id TEXT PRIMARY KEY,
          product_id TEXT NOT NULL,
          draft_id TEXT NOT NULL REFERENCES product_drafts(id) ON DELETE RESTRICT,
          action TEXT NOT NULL CHECK (
            action IN (
              'draft_created', 'draft_updated', 'draft_validated',
              'draft_validation_failed', 'onboarding_attached', 'version_published'
            )
          ),
          actor_id TEXT NOT NULL,
          draft_revision INTEGER NOT NULL CHECK (draft_revision >= 1),
          product_version_id TEXT,
          created_at TEXT NOT NULL
        );

        INSERT INTO product_audit_events_v13 SELECT * FROM product_audit_events;
        DROP TABLE product_audit_events;
        ALTER TABLE product_audit_events_v13 RENAME TO product_audit_events;
        CREATE INDEX product_audit_events_draft_idx
          ON product_audit_events(draft_id, created_at, id);
        CREATE INDEX product_audit_events_product_idx
          ON product_audit_events(product_id, created_at, id);

        INSERT INTO schema_migrations(version, applied_at)
          VALUES (13, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
      `);
    })();
  }

  if (current.version < 14) {
    database.transaction(() => {
      database.exec(`
        CREATE TABLE personalization_datasets (
          id TEXT PRIMARY KEY,
          domain_dataset_id TEXT NOT NULL,
          owner_type TEXT NOT NULL CHECK (owner_type IN ('guest', 'user')),
          owner_id TEXT NOT NULL,
          template_version_id TEXT NOT NULL,
          sha256 TEXT NOT NULL CHECK (length(sha256) = 64),
          payload_sha256 TEXT NOT NULL CHECK (length(payload_sha256) = 64),
          storage_key TEXT NOT NULL UNIQUE,
          row_count INTEGER NOT NULL CHECK (row_count BETWEEN 1 AND 10000),
          columns_json TEXT NOT NULL,
          report_json TEXT NOT NULL,
          created_at TEXT NOT NULL,
          expires_at TEXT NOT NULL
        );

        CREATE INDEX personalization_datasets_owner_created_idx
          ON personalization_datasets(owner_type, owner_id, created_at DESC);
        CREATE INDEX personalization_datasets_expiry_idx
          ON personalization_datasets(expires_at, id);

        CREATE TABLE personalization_jobs (
          id TEXT PRIMARY KEY,
          owner_type TEXT NOT NULL CHECK (owner_type IN ('guest', 'user')),
          owner_id TEXT NOT NULL,
          dataset_id TEXT NOT NULL
            REFERENCES personalization_datasets(id) ON DELETE CASCADE,
          template_version_id TEXT NOT NULL,
          status TEXT NOT NULL CHECK (
            status IN ('queued', 'running', 'completed', 'failed', 'cancelled')
          ),
          processed INTEGER NOT NULL CHECK (processed >= 0),
          total INTEGER NOT NULL CHECK (total BETWEEN 1 AND 10000),
          failed INTEGER NOT NULL CHECK (failed >= 0),
          attempt INTEGER NOT NULL CHECK (attempt BETWEEN 0 AND 3),
          max_attempts INTEGER NOT NULL CHECK (max_attempts BETWEEN 1 AND 3),
          idempotency_key TEXT NOT NULL,
          output_storage_key TEXT UNIQUE,
          output_sha256 TEXT CHECK (output_sha256 IS NULL OR length(output_sha256) = 64),
          output_byte_size INTEGER CHECK (output_byte_size IS NULL OR output_byte_size > 0),
          error_code TEXT,
          created_at TEXT NOT NULL,
          started_at TEXT,
          completed_at TEXT,
          updated_at TEXT NOT NULL,
          CHECK (processed <= total),
          CHECK (failed <= total)
        );

        CREATE INDEX personalization_jobs_owner_created_idx
          ON personalization_jobs(owner_type, owner_id, created_at DESC);
        CREATE INDEX personalization_jobs_status_created_idx
          ON personalization_jobs(status, created_at);
        CREATE INDEX personalization_jobs_dataset_idx
          ON personalization_jobs(dataset_id, created_at);

        INSERT INTO schema_migrations(version, applied_at)
          VALUES (14, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
      `);
    })();
  }

  if (current.version < 15) {
    database.transaction(() => {
      database.exec(`
        CREATE TABLE production_fonts (
          id TEXT PRIMARY KEY,
          family TEXT NOT NULL,
          weight INTEGER NOT NULL CHECK (weight BETWEEN 100 AND 900 AND weight % 100 = 0),
          style TEXT NOT NULL CHECK (style IN ('normal', 'italic')),
          format TEXT NOT NULL CHECK (format IN ('ttf', 'otf')),
          filename TEXT NOT NULL,
          mime_type TEXT NOT NULL CHECK (mime_type IN ('font/ttf', 'font/otf')),
          byte_size INTEGER NOT NULL CHECK (byte_size > 0),
          sha256 TEXT NOT NULL CHECK (length(sha256) = 64),
          storage_key TEXT NOT NULL UNIQUE,
          license_name TEXT NOT NULL,
          license_reference TEXT NOT NULL,
          approved_by TEXT NOT NULL,
          created_at TEXT NOT NULL
        );

        CREATE INDEX production_fonts_family_idx
          ON production_fonts(family, weight, style, created_at DESC, id DESC);

        INSERT INTO schema_migrations(version, applied_at)
          VALUES (15, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
      `);
    })();
  }

  if (current.version < 16) {
    database.transaction(() => {
      database.exec(`
        CREATE TABLE template_drafts (
          id TEXT PRIMARY KEY,
          template_id TEXT NOT NULL,
          base_version_id TEXT,
          status TEXT NOT NULL CHECK (status IN ('draft', 'validated', 'published')),
          revision INTEGER NOT NULL CHECK (revision >= 1),
          document_json TEXT NOT NULL,
          validation_json TEXT,
          published_version_id TEXT,
          created_by TEXT NOT NULL,
          updated_by TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE INDEX template_drafts_template_updated_idx
          ON template_drafts(template_id, updated_at DESC, id DESC);

        CREATE TABLE template_draft_events (
          id TEXT PRIMARY KEY,
          template_id TEXT NOT NULL,
          draft_id TEXT NOT NULL REFERENCES template_drafts(id) ON DELETE RESTRICT,
          action TEXT NOT NULL CHECK (action IN (
            'draft_created', 'draft_updated', 'draft_validated',
            'draft_validation_failed', 'version_published'
          )),
          actor_id TEXT NOT NULL,
          draft_revision INTEGER NOT NULL CHECK (draft_revision >= 1),
          template_version_id TEXT,
          created_at TEXT NOT NULL
        );
        CREATE INDEX template_draft_events_draft_idx
          ON template_draft_events(draft_id, created_at, id);

        INSERT INTO schema_migrations(version, applied_at)
          VALUES (16, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
      `);
    })();
  }

  if (current.version > SCHEMA_VERSION) {
    throw new Error(
      `Vortex database schema ${current.version} is newer than this runtime (${SCHEMA_VERSION}).`,
    );
  }
}

export function openVortexDatabase(filename = defaultDatabasePath()): VortexDatabase {
  if (filename !== ":memory:") mkdirSync(dirname(filename), { recursive: true });
  const database = new Database(filename);
  database.pragma("foreign_keys = ON");
  database.pragma("busy_timeout = 5000");
  if (filename !== ":memory:") database.pragma("journal_mode = WAL");
  migrate(database);
  return database;
}

let singleton: VortexDatabase | null = null;

export function getVortexDatabase(): VortexDatabase {
  configuredPersistenceBackend();
  singleton ??= openVortexDatabase();
  return singleton;
}
