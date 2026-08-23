import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const databaseUrl = process.env.VORTEX_POSTGRES_TEST_URL;
if (!databaseUrl) {
  console.log("PostgreSQL schema verification skipped: VORTEX_POSTGRES_TEST_URL is not set.");
  process.exit(0);
}

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const schema = readFileSync(join(root, "docs/platform/postgresql/schema.sql"), "utf8");
const namespace = `vortex_verify_${process.pid}_${Date.now()}`;
const expectedTables = [
  "auth_users",
  "design_projects",
  "project_revisions",
  "project_assets",
  "product_definitions",
  "product_versions",
  "design_template_versions",
  "template_assets",
  "production_artifacts",
  "product_drafts",
  "product_audit_events",
  "price_quotes",
  "onboarding_jobs",
  "personalization_datasets",
  "personalization_jobs",
  "production_fonts",
  "template_drafts",
];
const assertion = `
DO $$
DECLARE missing_table text;
BEGIN
  FOREACH missing_table IN ARRAY ARRAY[${expectedTables.map((name) => `'${name}'`).join(", ")}]
  LOOP
    IF to_regclass(current_schema() || '.' || missing_table) IS NULL THEN
      RAISE EXCEPTION 'missing target table: %', missing_table;
    END IF;
  END LOOP;
  IF (SELECT max(version) FROM schema_migrations) <> 16 THEN
    RAISE EXCEPTION 'unexpected target schema version';
  END IF;
END $$;
`;
const input = `BEGIN; CREATE SCHEMA ${namespace}; SET search_path TO ${namespace};\n${schema}\n${assertion}\nROLLBACK;`;
const result = spawnSync(
  "psql",
  [databaseUrl, "--no-psqlrc", "--set", "ON_ERROR_STOP=1", "--quiet"],
  { input, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
);
if (result.error) {
  console.error(`PostgreSQL schema verification could not launch psql: ${result.error.message}`);
  process.exit(1);
}
if (result.status !== 0) {
  console.error(result.stderr.trim() || "PostgreSQL schema verification failed.");
  process.exit(result.status ?? 1);
}
console.log(`PostgreSQL target schema v16 verified in a rolled-back namespace (${expectedTables.length} critical tables).`);
