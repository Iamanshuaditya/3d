# Product, template, and onboarding administration

Status: `/admin/products` is a protected operator surface backed by safe `/api/v1/admin` DTOs. It exposes existing product publishing, immutable template publishing/assets, production-font registration, and the existing Python/CLI onboarding pipeline without sending internal engine configuration or filesystem details to the browser.

## Identity and permissions

Operator identity is a verified Better Auth user session. `OperatorAuthorizationService` loads permission grants server-side; request JSON cannot supply user IDs, roles, or approvals.

Permissions are:

- `products:read`, `products:edit`, `products:validate`, `products:publish`;
- `templates:read`, `templates:edit`, `templates:publish`;
- `assets:upload`;
- `onboarding:run`.

Publish permission implies read/edit/validate within the same product or template domain. It does not imply unrelated asset or onboarding access. Grants live in `operator_grants`. `VORTEX_BOOTSTRAP_OPERATOR_USER_IDS` may provide comma-separated full-access user IDs only for deliberate initial deployment/bootstrap; it is server-only configuration.

Unauthenticated admin API access receives 401, authenticated users without the required grant receive 403, and the protected page does not render catalogue metadata for unauthorized users. Admin mutations also enforce same-origin checks and bounded request parsing.

## Product workflow

```text
immutable current ProductVersion (optional)
        │
        ▼
revisioned ProductDraft
        │ update (CAS) invalidates validation
        ▼
resolve candidate + validate exact default configuration
        │
        ▼
review immutable validation report
        │ re-resolve, compare report, base-version CAS
        ▼
new immutable ProductVersion + audit event
```

Product draft APIs use explicit admin DTOs. They do not serialize arbitrary `ProductConfig`; draft input is allowlisted, bounded to 10 MiB, and parsed at the service boundary. Publishing is a single SQLite transaction covering the version row, current-definition pointer, draft status, and audit event. A stale base version or stale draft revision returns a conflict. Historical versions never change.

An operator may attach one passed onboarding job to a matching product draft. Validation and publication retain `onboardingJobId`, report SHA-256, and tool version so the audit trail can answer which geometry evidence supported a published product version.

## Template and asset workflow

Operators with `assets:upload` may upload bounded, decoded PNG/JPEG/WebP artwork into the immutable private template-asset scope. A revision-checked `TemplateDraft` can clone the current published version or start from a complete normal template document. Validation uses the same exact product-version/configuration and asset checks as the catalogue. Only a validated current draft revision may publish, creating `template@N+1` and an audit event. Existing versions and instantiated projects remain unchanged.

The current operator editor is a safe structured-document editor rather than a second visual design engine. It intentionally consumes the ordinary template/`DesignDocument` schema. Reusing the full Studio visual authoring experience in operator mode remains a UX enhancement, not a domain prerequisite.

## Bounded GLB onboarding

The UI uploads a GLB and optional manifest. The server:

1. requires `onboarding:run` and same-origin context;
2. enforces a 64 MiB GLB limit and 1 MiB manifest limit;
3. validates GLB magic/declared length and sanitizes names by never using them as paths;
4. stores input privately and creates a durable job record;
5. runs the checked-in `product-onboarding` inspect/build/validate commands through an argument array in a per-job work directory;
6. bounds runtime (10 seconds to 30 minutes, default 5 minutes), captured stdout/stderr (256 KiB), individual output (64 MiB), and aggregate output (160 MiB);
7. persists structured status, checksummed reports/artifacts, tool version, error code, and timing;
8. removes the working directory after completion/failure.

No browser string is interpolated into a shell command and no geometry logic was reimplemented in React. Jobs run in the initial modular-monolith runner; moving execution to a sandboxed external worker can retain the same job/repository interface.

## Production font registration

An operator with `assets:upload` can register a bounded private TTF/OTF asset together with family, weight, style, license reference, source reference, and checksum. Registration does not remove preflight warnings: renderer binding and artifact provenance remain explicitly incomplete until a legally approved font is loaded deterministically by the server renderer.

## Audit and observability

Product and template draft events retain actor ID, resource IDs, revision, action, optional published-version ID, and timestamp. Onboarding records retain operator and product/draft identities plus immutable checksums/tool version. Structured logs use stable identifiers and durations and exclude tokens, cookies, object credentials, customer bytes, and CSV values.
