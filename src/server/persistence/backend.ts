export type PersistenceBackend = "sqlite" | "postgresql";

export function configuredPersistenceBackend(): PersistenceBackend {
  const value = process.env.VORTEX_DATABASE?.trim() || "sqlite";
  if (value === "sqlite") return value;
  if (value === "postgresql") {
    throw new Error(
      "VORTEX_DATABASE=postgresql is not runnable yet. The target schema and verification harness exist, but repository and Better Auth adapters must be implemented before deployment.",
    );
  }
  throw new Error(`Unsupported VORTEX_DATABASE value: ${value}.`);
}
