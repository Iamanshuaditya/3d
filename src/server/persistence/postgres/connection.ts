import { Pool, type PoolClient, type PoolConfig } from "pg";

/**
 * PostgreSQL connection layer (#25).
 *
 * Bounded on every axis on purpose: an unbounded pool turns a slow query into
 * a connection-exhaustion outage across every instance at once, and a query
 * with no timeout can hold a transaction open indefinitely.
 */
export type PostgresSettings = {
  connectionString: string;
  maxConnections: number;
  connectionTimeoutMs: number;
  statementTimeoutMs: number;
  idleTimeoutMs: number;
  ssl: boolean;
};

export function postgresSettings(env: NodeJS.ProcessEnv = process.env): PostgresSettings {
  const connectionString = env.VORTEX_POSTGRES_URL?.trim();
  if (!connectionString) {
    throw new Error("VORTEX_POSTGRES_URL is required when VORTEX_DATABASE=postgresql.");
  }
  const number = (name: string, fallback: number) => {
    const raw = env[name]?.trim();
    if (!raw) return fallback;
    const value = Number(raw);
    if (!Number.isFinite(value) || value <= 0) {
      throw new Error(`${name} must be a positive number.`);
    }
    return value;
  };
  return {
    connectionString,
    maxConnections: number("VORTEX_POSTGRES_MAX_CONNECTIONS", 10),
    connectionTimeoutMs: number("VORTEX_POSTGRES_CONNECT_TIMEOUT_MS", 5_000),
    statementTimeoutMs: number("VORTEX_POSTGRES_STATEMENT_TIMEOUT_MS", 15_000),
    idleTimeoutMs: number("VORTEX_POSTGRES_IDLE_TIMEOUT_MS", 30_000),
    // TLS is the default; opting out has to be deliberate and is only sane on
    // a private network or a local test container.
    ssl: (env.VORTEX_POSTGRES_SSL?.trim() || "require") !== "disable",
  };
}

export function poolConfig(settings: PostgresSettings): PoolConfig {
  return {
    connectionString: settings.connectionString,
    max: settings.maxConnections,
    connectionTimeoutMillis: settings.connectionTimeoutMs,
    idleTimeoutMillis: settings.idleTimeoutMs,
    statement_timeout: settings.statementTimeoutMs,
    ...(settings.ssl ? { ssl: { rejectUnauthorized: true } } : {}),
  };
}

export type SqlParameter = string | number | boolean | null | Date | Buffer;

export interface SqlExecutor {
  query<TRow>(text: string, values?: SqlParameter[]): Promise<TRow[]>;
  /** Rows affected by the last statement. Drives compare-and-swap results. */
  execute(text: string, values?: SqlParameter[]): Promise<number>;
}

class ClientExecutor implements SqlExecutor {
  constructor(private readonly client: PoolClient) {}

  async query<TRow>(text: string, values: SqlParameter[] = []): Promise<TRow[]> {
    const result = await this.client.query(text, values);
    return result.rows as TRow[];
  }

  async execute(text: string, values: SqlParameter[] = []): Promise<number> {
    const result = await this.client.query(text, values);
    return result.rowCount ?? 0;
  }
}

export class PostgresDatabase implements SqlExecutor {
  private readonly pool: Pool;

  constructor(settings: PostgresSettings) {
    this.pool = new Pool(poolConfig(settings));
    // An idle client erroring out is normal (a database restart, a failover).
    // Without a handler `pg` turns it into an unhandled 'error' event and the
    // process exits, which converts a recoverable blip into an outage.
    this.pool.on("error", (error) => {
      console.error(
        JSON.stringify({
          scope: "vortex-platform",
          event: "postgres.idle-client-error",
          message: error.message,
        }),
      );
    });
  }

  async query<TRow>(text: string, values: SqlParameter[] = []): Promise<TRow[]> {
    const result = await this.pool.query(text, values);
    return result.rows as TRow[];
  }

  async execute(text: string, values: SqlParameter[] = []): Promise<number> {
    const result = await this.pool.query(text, values);
    return result.rowCount ?? 0;
  }

  /**
   * Runs `work` inside one transaction on one connection.
   *
   * The SQLite repositories rely on `database.transaction()` for compare-and-
   * swap updates, guest claiming and atomic publication. Those semantics have
   * to survive the port exactly, which means every statement in a unit of work
   * must run on the same client rather than being scattered across the pool.
   */
  async transaction<T>(work: (executor: SqlExecutor) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await work(new ClientExecutor(client));
      await client.query("COMMIT");
      return result;
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // The connection is already unusable; the original error is what matters.
      }
      throw error;
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
