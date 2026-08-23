# PostgreSQL migration boundary

PostgreSQL is a reviewed target, not a runnable runtime adapter in this changeset. Set `VORTEX_DATABASE=sqlite` in every deployment. Selecting `postgresql` fails immediately with an actionable error so a deployment cannot silently use SQLite assumptions against another database.

## Why the adapter is gated

Current SQLite repositories use synchronous prepared statements and `better-sqlite3` transactions. Better Auth is also configured directly against that SQLite connection. Replacing only the connection object would break transaction semantics, compare-and-swap updates, guest claiming, idempotency, and atomic product publication. A safe adapter requires PostgreSQL implementations of every existing repository plus a PostgreSQL Better Auth adapter; it is not a mechanical SQL-dialect substitution.

The target schema is [schema.sql](./postgresql/schema.sql). It maps SQLite schema v15 to PostgreSQL types and preserves the important foreign keys, immutable revision/version keys, idempotency keys, owner indexes, artifact uniqueness, checksums, onboarding provenance, bulk lifecycle state, and font provenance.

## Disposable schema verification

With `psql` available and a disposable PostgreSQL connection:

```bash
VORTEX_POSTGRES_TEST_URL=postgresql://... node scripts/verify-postgresql-schema.mjs
```

The harness opens a transaction, creates a uniquely named schema, applies the complete target DDL, checks critical tables and schema version, then rolls the transaction back. It does not leave tables behind. Without the environment variable it reports an explicit skip.

## Required implementation sequence

1. Add an async PostgreSQL connection/pool with bounded timeouts and TLS policy.
2. Implement the existing repository contracts one bounded module at a time; do not leak SQL into domain or route code.
3. Configure Better Auth through its PostgreSQL adapter and migrate auth timestamps/column mapping deliberately.
4. Port transaction-critical tests first: guest claim, revision CAS, product publish, quote idempotency, one artifact per revision/kind, onboarding provenance, and personalization recovery.
5. Add a data-copy tool that snapshots SQLite, verifies row counts/checksums/foreign keys in PostgreSQL, and only then permits cutover.
6. Run dual-environment integration tests and a rollback rehearsal before setting `VORTEX_DATABASE=postgresql` in production.

Until those gates pass, PostgreSQL support must not be advertised as runnable.
