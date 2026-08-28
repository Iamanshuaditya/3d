export type PersistenceBackend = "sqlite" | "postgresql";

/**
 * Database selection (#25).
 *
 * The PostgreSQL foundation is real and verified — target schema, pooled
 * connections with bounded timeouts, transactions, and the shared rate-limit
 * and job-queue stores that make more than one instance possible. The twelve
 * domain repositories and the Better Auth adapter are not ported, so the
 * application as a whole still cannot run on it.
 *
 * That gap fails closed rather than degrading. A deployment that booted and
 * then could not read a project would look like data loss.
 */
export function configuredPersistenceBackend(): PersistenceBackend {
  const value = process.env.VORTEX_DATABASE?.trim() || "sqlite";
  if (value === "sqlite") return value;
  if (value === "postgresql") {
    throw new Error(
      [
        "VORTEX_DATABASE=postgresql cannot serve the application yet.",
        "Runnable on PostgreSQL today: the target schema, the connection pool and transactions,",
        "the shared rate-limit store and the distributed job queue.",
        "Still to port: the project, product, template, pricing, production, onboarding,",
        "personalization and operator repositories, plus the Better Auth adapter.",
        "See docs/platform/POSTGRESQL.md.",
      ].join(" "),
    );
  }
  throw new Error(`Unsupported VORTEX_DATABASE value: ${value}.`);
}
