import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

const SCHEMA_VERSION = 2;

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
  singleton ??= openVortexDatabase();
  return singleton;
}
