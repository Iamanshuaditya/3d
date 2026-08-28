import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SCHEMA_VERSION } from "../database";
import type { PostgresDatabase } from "./connection";

/**
 * Schema application for PostgreSQL (#25).
 *
 * The whole DDL is applied in one transaction against an empty database. A
 * half-applied schema is the one state nothing downstream can reason about, so
 * it is not a state this can leave behind.
 *
 * The version is checked against the SQLite runtime's `SCHEMA_VERSION`, which
 * keeps a single number honest across both adapters: a database that is behind
 * or ahead of the running code is refused rather than used.
 */
export function targetSchemaSql(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  // Resolved from the repository root so the same file serves the runtime and
  // the documented migration target, rather than the two drifting apart.
  const candidates = [
    join(here, "../../../../docs/platform/postgresql/schema.sql"),
    join(process.cwd(), "docs/platform/postgresql/schema.sql"),
  ];
  for (const candidate of candidates) {
    try {
      return readFileSync(candidate, "utf8");
    } catch {
      continue;
    }
  }
  throw new Error(
    "The PostgreSQL target schema (docs/platform/postgresql/schema.sql) could not be read.",
  );
}

export async function currentSchemaVersion(
  database: PostgresDatabase,
): Promise<number | null> {
  const [existing] = await database.query<{ exists: boolean }>(
    "SELECT to_regclass('public.schema_migrations') IS NOT NULL AS exists",
  );
  if (!existing?.exists) return null;
  const [row] = await database.query<{ version: number | null }>(
    "SELECT MAX(version)::int AS version FROM schema_migrations",
  );
  return row?.version ?? null;
}

export type MigrationOutcome = {
  applied: boolean;
  version: number;
};

export async function migratePostgres(
  database: PostgresDatabase,
): Promise<MigrationOutcome> {
  const current = await currentSchemaVersion(database);

  if (current === null) {
    await database.transaction(async (executor) => {
      await executor.execute(targetSchemaSql());
    });
    return { applied: true, version: SCHEMA_VERSION };
  }

  if (current > SCHEMA_VERSION) {
    throw new Error(
      `The PostgreSQL database is at schema ${current}, which is newer than this runtime (${SCHEMA_VERSION}). Deploy the matching version rather than downgrading the database.`,
    );
  }
  if (current < SCHEMA_VERSION) {
    // Incremental migration of an existing PostgreSQL database is a separate,
    // data-bearing exercise. Guessing at it would risk live customer data, so
    // it refuses and says exactly what is missing.
    throw new Error(
      `The PostgreSQL database is at schema ${current}, but this runtime expects ${SCHEMA_VERSION}. Incremental PostgreSQL migrations are not implemented; apply the missing DDL deliberately and record the version.`,
    );
  }

  return { applied: false, version: current };
}
