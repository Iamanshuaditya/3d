# State Machines

Six entities in this system are stateful. Only two have an explicit state
machine module; the rest are implied by status columns plus the SQL predicates
that guard each transition. Those predicates are the real specification.

---

## 1. `DesignProject.status`

```text
                    POST /api/v1/projects
                    POST /api/v1/templates/:id/instantiate
                    POST /api/v1/projects/:id/duplicate
                              │
                              ▼
                         ┌────────┐
                ┌───────▶│ draft  │◀───────┐
                │        └───┬────┘        │
   PATCH status="draft"      │             │ PATCH status="draft"
                │            │ POST …/production/preflight
                │            │   AND report.passed
                │            ▼
                │   ┌────────────────────┐
                └───│ ready_for_preflight│
                    └─────────┬──────────┘
                              │ POST …/production/artifacts
                              │   AND preflight passed
                              │   AND artifact row created (not a race loser)
                              ▼
                    ┌──────────────────┐
                    │ production_ready │
                    └──────────────────┘

   any non-archived state ──DELETE /api/v1/projects/:id──▶ ┌──────────┐
                                                            │ archived │ (terminal)
                                                            └──────────┘
```

**Transition guards (VERIFIED).**

| Transition | Guard | File |
|---|---|---|
| → `ready_for_preflight` | `setStatusForRevision(id, owner, expectedRevision, status)` with `WHERE revision = ? AND status != 'archived'` | `sqlite-project-repository.ts:259` |
| → `production_ready` | same helper, only after `artifacts.create()` reports `created: true` | `production-service.ts:474` |
| → `archived` | `WHERE status != 'archived'`; returns false → 404 | `sqlite-project-repository.ts:239` |
| any edit | `PATCH` rejects `status === "archived"` with `PROJECT_ARCHIVED` before touching anything | `project-service.ts` `update()` |

**Non-obvious behaviours.**

- Status is bound to a **revision**. `setStatusForRevision` only fires when the
  project is still at the revision that was preflighted/exported. A save that
  lands in between leaves the status where it was — the promotion is silently a
  no-op (it returns `false`, and `ProductionService` ignores the return value
  for the preflight case).
- A `production_ready` project can be edited again via `PATCH`, and the client
  may only request `draft` or `ready_for_preflight`. If the client sends no
  `status`, the column keeps its old value — so a project can remain
  `production_ready` while its design has moved on. The artifact stays bound to
  the older revision, so this is safe for output, but the status is then a
  statement about a revision that is no longer current.
- `archived` is a soft delete. Nothing purges archived projects or their objects.

---

## 2. `PersonalizationJob.status`

```text
   POST /api/v1/personalization-jobs
             │
             ▼
        ┌────────┐
        │ queued │◀──────────────────────────────────┐
        └───┬────┘                                   │
            │ runner.markRunning()                   │
            │   WHERE status='queued'                │ recoverInterruptedJobs()
            │     AND attempt < max_attempts         │   WHERE status='running'
            │   SET attempt += 1, processed=0        │   AND attempt < max_attempts
            ▼                                        │
        ┌─────────┐───────────────────────────────────┘
        │ running │
        └──┬───┬──┘
           │   │ finishJob('failed', errorCode)         POST …/retry
           │   └──────────────▶ ┌────────┐  ────────────────────────┐
           │                    │ failed │  WHERE status='failed'    │
           │                    └────────┘  AND attempt<max_attempts │
           │                        ▲                                ▼
           │  recoverInterruptedJobs()                          back to queued
           │  when attempt >= max_attempts                     (progress reset)
           │
           │ finishJob('completed', output*)
           ▼
     ┌───────────┐
     │ completed │ (terminal — output object + sha256 recorded)
     └───────────┘

   queued|running ──POST …/cancel──▶ ┌───────────┐
                                     │ cancelled │ (terminal)
                                     └───────────┘
```

**Guards and side effects.**

| Transition | Guard | Side effect |
|---|---|---|
| `queued → running` | `WHERE id=? AND status='queued' AND attempt < max_attempts` | `attempt+1`, `processed=0`, `failed=0`, `started_at` set, `error_code` cleared |
| `running → completed` | `WHERE id=? AND status='running'` | NDJSON object written first, then `output_storage_key/sha256/byte_size` recorded |
| `running → failed` | same | the partial output object is **deleted** before the row is updated |
| `queued|running → cancelled` | `WHERE … AND status IN ('queued','running')` | the runner notices on its next per-row poll and deletes the output object |
| `failed → queued` (retry) | `WHERE status='failed' AND attempt < max_attempts` | all output/progress fields cleared; else 409 `PERSONALIZATION_JOB_NOT_RETRYABLE` |
| `running → queued` (recovery) | `WHERE status='running'`, at process start | `error_code = 'PERSONALIZATION_WORKER_INTERRUPTED'`, progress reset |
| `running → failed` (recovery) | same, when `attempt >= max_attempts` | `completed_at` set |

**Invariant enforced by the schema:** `processed <= total`, `failed <= total`,
`attempt BETWEEN 0 AND 3`, `max_attempts BETWEEN 1 AND 3`.

**Note:** a cancelled job cannot be retried — `retryJob` requires `failed`.

---

## 3. `OnboardingJob.status`

```text
   POST /api/v1/admin/onboarding/jobs
             │
             ▼
        ┌────────┐
        │ queued │
        └───┬────┘
            │ repository.markRunning(jobId, startedAt)
            ▼
        ┌─────────┐
        │ running │ ──── inspect [→ build → validate] ────┐
        └─────────┘                                        │
             │                                             │
    finally: repository.complete(status, …)                │
             ├──────────────────▶ ┌────────┐               │
             │                    │ passed │ (terminal)  ◀──┘ exit 0 and
             │                    └────────┘                  report.passed===true
             └──────────────────▶ ┌────────┐
                                  │ failed │ (terminal, with an ONBOARDING_* code)
                                  └────────┘

        ┌───────────┐
        │ cancelled │  declared in the CHECK constraint; NO CODE PATH REACHES IT
        └───────────┘
```

- `passed` is reachable early: an inspection-only run (no manifest supplied)
  passes after the `inspect` stage.
- **There is no recovery.** A process restart while a job is `running` leaves
  the row `running` forever. Compare with personalization, which recovers.
- The `cancelled` status exists in the schema and in `OnboardingJob["status"]`
  but nothing writes it. Dead state. (KNOWN_RISKS)

---

## 4. `ProductDraft.status` (and, identically, `TemplateDraft.status`)

```text
   POST /api/v1/admin/products/:productId/drafts
   (createFromCurrent → revision 1, baseVersionId = current version)
             │
             ▼
        ┌───────┐  PATCH …/product-drafts/:id  (revision+1, status back to draft)
        │ draft │◀─────────────────────────────────────────────┐
        └───┬───┘                                              │
            │ POST …/validate                                  │
            │   evaluate(): base not stale, candidate resolves,│
            │   contract validator finds no error issues       │
            ▼                                                  │
      ┌───────────┐   validation fails → stays `draft`, and the │
      │ validated │   failed report is recorded ────────────────┘
      └─────┬─────┘   (audit action draft_validation_failed)
            │ POST …/publish
            │   revision === expectedRevision
            │   validation.passed && validation.draftRevision === expectedRevision
            │   RE-EVALUATION produces an identical canonical report
            ▼
      ┌───────────┐
      │ published │ (terminal; publishedVersionId set; re-publish is idempotent)
      └───────────┘
```

**Rejections on the publish edge, in order:**
`PRODUCT_DRAFT_REVISION_CONFLICT` → `PRODUCT_DRAFT_NOT_VALIDATED` →
`PRODUCT_DRAFT_VALIDATION_FAILED` → `PRODUCT_DRAFT_REVALIDATION_REQUIRED`.
A draft whose `baseVersionId` no longer equals the live current version fails
validation with `PRODUCT_DRAFT_BASE_STALE`.

**Side effects of `→ published`:** a new immutable `product_versions` row
(`${productId}@${n+1}`), `product_definitions.current_version_id` updated, and a
`version_published` audit event — all in one transaction.

Every edge writes exactly one `product_audit_events` row:
`draft_created`, `draft_updated`, `draft_validated`,
`draft_validation_failed`, `onboarding_attached`, `version_published`.
`onboarding_attached` is a **self-loop** on `draft` — it changes provenance
columns and bumps the revision without changing status.

---

## 5. `BackgroundJob.status` (implemented, dormant)

```text
   enqueue()  ── UNIQUE(queue, idempotency_key); a duplicate returns
        │        { created: false } instead of a second row
        ▼
   ┌────────┐
   │ queued │◀───────────────────────────────────────┐
   └───┬────┘                                        │
       │ claim(): SELECT oldest WHERE run_after<=now │ fail() with attempts
       │          then UPDATE WHERE status='queued'  │ remaining →
       │          attempts+1, lease_owner, lease_exp │ run_after = now+backoff
       ▼                                             │
   ┌─────────┐────────────────────────────────────────┘
   │ running │  heartbeat(jobId, workerId, expiry) extends the lease
   └──┬───┬──┘
      │   │ complete()  WHERE status='running' AND lease_owner=?
      │   └──────────────────────▶ ┌───────────┐
      │                            │ succeeded │ (terminal)
      │                            └───────────┘
      │ fail() with attempts >= max_attempts
      ├──────────────────────────▶ ┌────────┐
      │                            │ failed │ (terminal)
      │                            └────────┘
      │ recoverExpiredLeases(): lease_expires_at <= now
      ├── attempts <  max ──▶ back to queued (run_after = now)
      └── attempts >= max ──▶ ┌───────────┐
                              │ abandoned │ (terminal — presumed poisonous)
                              └───────────┘
```

**The key design point:** `lease_owner` is part of the predicate of *every*
mutating statement. A worker that stalled past its lease, then woke and tried to
`complete()`, gets `changes === 0`; `JobWorker` reports `{kind:"lease-lost"}`
rather than lying about success.

Backoff: `min(60 000, 1000 · 2^(attempts−1))`. Default lease 30 000 ms, default
`max_attempts` 3.

**Nothing in production code drives this machine.** See `BACKGROUND_JOBS.md`.

---

## 6. Client-side project save state (`ProjectSaveState`)

Not persisted; it drives the Studio's save indicator.

```text
                       ┌─────────┐
     mount ───────────▶│ loading │
                       └────┬────┘
              open/create ok│           failure
                            ▼               │
                       ┌───────┐            ▼
              ┌───────▶│ saved │       ┌────────┐
              │        └───┬───┘       │ failed │
              │            │ edit      └────┬───┘
              │            ▼                │ retrySave() / online event
              │      ┌──────────┐           │
              │      │ unsaved  │◀──────────┘
              │      └────┬─────┘
              │           │ 700 ms debounce, navigator.onLine
              │           ▼
              │      ┌────────┐   PATCH ok, and no newer commit queued
              └──────│ saving │
                     └───┬────┘
                         │ PATCH failed
                         ▼
                    failed | offline   (offline when navigator.onLine === false)
```

- `saved` schedules a preview render 1 500 ms later. Preview failure never moves
  the state.
- A newer commit queued while a save was in flight returns to `unsaved` and
  re-flushes via `queueMicrotask`.
- A `beforeunload` guard fires whenever `pendingRef` or `savingRef` is set.
- `preview-only` products short-circuit straight to `saved` — they have no
  catalogue row to own a project.

File: `src/lib/projects/use-project-session.ts`.

---

## 7. Unfold stage (structural, in-memory)

Not a status enum but a genuine state machine:

```text
UnfoldState = { stage: number }        stage ∈ [0, plan.steps.length]
stage 0 = assembled pose
stage N = the pose after applying steps 0..N-1

actions: next | previous | reset | goTo(stage)   — all clamped, all integer
pose    = anglesAtStage(plan, stage)             — pure function, recomputed
```

Because the pose is recomputed rather than accumulated, an animation in flight
holds no state and rapid clicking cannot corrupt the model.
`UnfoldStatus.isFlat` is true only when the plan genuinely terminates flat and
the stage is at the end.

Files: `src/lib/configurator/unfold-state.ts`, `unfold-plan.ts`,
`hinge-animation.ts`.
