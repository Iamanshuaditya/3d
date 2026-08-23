# Private object storage

The application has one process-wide `ObjectStore` selected by `VORTEX_OBJECT_STORE`. Projects, catalogue template artwork, onboarding inputs/reports, previews, and immutable production artifacts all use that same boundary. Public DTOs never contain object keys.

## Filesystem development adapter

`VORTEX_OBJECT_STORE=filesystem` is the default and stores private objects below `VORTEX_DATA_DIR/objects`. Writes use a temporary file and atomic rename, metadata is stored beside the object, files are mode `0600`, and every key is traversal checked. This adapter is suitable for local development and a deliberately provisioned durable single-node volume only.

## S3-compatible production adapter

Set:

```text
VORTEX_OBJECT_STORE=s3
VORTEX_S3_ENDPOINT=https://<account>.r2.cloudflarestorage.com
VORTEX_S3_REGION=auto
VORTEX_S3_BUCKET=<private-bucket>
VORTEX_S3_ACCESS_KEY_ID=<server-only-key>
VORTEX_S3_SECRET_ACCESS_KEY=<server-only-secret>
```

The adapter uses the S3 REST API with AWS Signature Version 4 and path-style bucket addressing. It supports `put`, `get`, server-side `copy`, and idempotent `delete`, preserving content type. The endpoint must use HTTPS except for an explicitly local test service. Credentials are read only in server modules.

The bucket must remain private: do not attach a public custom domain or anonymous read policy. Customer downloads continue through owner-authorized `/api/v1` handlers. Provider ETags are not trusted as content hashes; application SHA-256 records and verification remain authoritative.

The checked contract suite exercises filesystem and an S3-compatible protocol harness with identical put/read/copy/delete/missing-object/traversal behavior. Live-provider verification is intentionally credential-gated deployment work.

## Deployment checklist

1. Create a private R2 or S3 bucket with versioning/retention appropriate to the business policy.
2. Issue a least-privilege credential limited to object read/write/delete for that bucket.
3. Configure all six `VORTEX_OBJECT_STORE`/`VORTEX_S3_*` server variables.
4. Upload and reopen a project across a process restart.
5. Generate and redownload a production artifact across another restart; verify its recorded SHA-256.
6. Configure provider lifecycle rules only after catalogue assets, customer projects, and legal retention requirements have separate reviewed prefixes/policies.
