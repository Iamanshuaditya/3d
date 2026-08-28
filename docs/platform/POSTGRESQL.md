# PostgreSQL and horizontal scale

Issue #25. `VORTEX_DATABASE=postgresql` still **fails closed**, and this
document says precisely what is built, what is verified, and what is left —
because "PostgreSQL support" is exactly the kind of claim that is easy to make
and expensive to be wrong about.

## What is implemented and verified

Against a real PostgreSQL 17, in
`tests/platform/postgres-integration.test.ts`:

| Piece | File | Verified behaviour |
|---|---|---|
| Target schema | `docs/platform/postgresql/schema.sql` | All 27 tables apply cleanly; version matches the runtime's `SCHEMA_VERSION` |
| Migration runner | `src/server/persistence/postgres/migrate.ts` | Applies in one transaction; re-running is a no-op; a newer database is refused |
| Connection layer | `src/server/persistence/postgres/connection.ts` | Bounded pool and timeouts; transactions roll back completely on failure |
| Shared rate limiter | `postgres-rate-limit-store.ts` | Two instances share one counter; 40 concurrent requests against a limit of 10 admit exactly 10 |
| Distributed job queue | `postgres-job-queue-repository.ts` | Idempotent enqueue under concurrency; six workers claim six distinct jobs via `FOR UPDATE SKIP LOCKED`; a job survives the instance running it |

These tests skip loudly without `VORTEX_POSTGRES_TEST_URL`. They are never run
against a mock — every claim they make is about behaviour PostgreSQL provides,
so a fake would prove nothing.

```bash
docker run -d -e POSTGRES_PASSWORD=vortex -e POSTGRES_DB=vortex -p 55499:5432 postgres:17
VORTEX_POSTGRES_TEST_URL=postgresql://postgres:vortex@127.0.0.1:55499/vortex npm test
```

## What is not implemented

The twelve domain repositories and the Better Auth adapter:

`ProjectRepository`, `ProductCatalogRepository`, `ProductDraftRepository`,
`TemplateCatalogRepository`, `TemplateAssetRepository`, `TemplateDraftRepository`,
`ProductionArtifactRepository`, `ProductionFontRepository`, `PriceQuoteRepository`,
`PersonalizationRepository`, `OnboardingJobRepository`, `OperatorGrantRepository`.

Until those exist, the application cannot serve a request on PostgreSQL, so
selecting it refuses at startup rather than booting into a deployment that
cannot read a project — which would present as data loss, not as a
configuration mistake.

### Why this is not a mechanical translation

The SQLite repositories are synchronous `better-sqlite3` prepared statements
inside `database.transaction()`. Swapping the connection would quietly break
compare-and-swap revision updates, guest claiming, quote idempotency, atomic
product publication, and one-artifact-per-revision uniqueness. Each of those is
a correctness property customers depend on, not a dialect difference.

The repository interfaces are already `Promise`-returning, which is what makes
the port possible at all: a PostgreSQL implementation satisfies the same
contracts without touching domain or route code.

## Remaining sequence

1. Port repositories one bounded module at a time, keeping SQL out of domain
   and route code.
2. Configure Better Auth through its PostgreSQL adapter, mapping auth
   timestamps and columns deliberately.
3. Port the transaction-critical tests first: guest claim, revision CAS,
   product publish, quote idempotency, one artifact per revision/kind,
   onboarding provenance, personalization recovery.
4. Add a data-copy tool that snapshots SQLite and verifies row counts,
   checksums and foreign keys in PostgreSQL before any cutover.
5. Run dual-environment integration tests and a rollback rehearsal.
6. Only then remove the gate in `src/server/persistence/backend.ts`.

## Single-node and scaled modes

| | Single-node (supported) | Scaled (not yet) |
|---|---|---|
| Database | SQLite on a local volume | PostgreSQL |
| Rate limiting | `SqliteRateLimitStore` — durable, shared in-process | `PostgresRateLimitStore` — shared across instances |
| Background jobs | `SqliteJobQueueRepository` — persisted, lease-recovered | `PostgresJobQueueRepository` — claimed with `SKIP LOCKED` |
| Instances | one | many |

Both coordination layers already work in both modes; SQLite on a local volume
is what cannot be shared, along with the unported repositories.
`VORTEX_DEPLOYMENT_MODE=scaled` refuses at startup and says so.

## What changed for single-node deployments

Rate limits are no longer process-local counters. They are stored, so a restart
no longer resets every limit — previously an abusive client only had to wait
for a deploy.

Background jobs are persisted before they run and claimed under a lease. A
worker that dies mid-job no longer loses that work silently: the lease expires,
recovery requeues it, and a job past its attempt budget is marked `abandoned`
so the failure stays visible instead of looping forever. A worker whose lease
expired cannot overwrite the run that replaced it, because `lease_owner` is
part of every state-transition predicate.
