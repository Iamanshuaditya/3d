import { NextResponse } from "next/server";
import { validateDeploymentConfig } from "@/server/config/environment";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CheckResult = { name: string; ok: boolean; detail: string };

async function check(name: string, run: () => Promise<string> | string): Promise<CheckResult> {
  try {
    return { name, ok: true, detail: await run() };
  } catch (error) {
    return {
      name,
      ok: false,
      detail: error instanceof Error ? error.message : "Check failed.",
    };
  }
}

/**
 * Readiness (#26).
 *
 * Answers the only question a load balancer needs: can this instance serve a
 * real request right now? Each dependency reports separately so a failing probe
 * says which one is down instead of just "not ready".
 */
export async function GET() {
  const checks = await Promise.all([
    check("configuration", () => {
      const config = validateDeploymentConfig();
      return `${config.mode}, ${config.database}, ${config.objectStore}`;
    }),
    check("database", async () => {
      const { getVortexDatabase } = await import("@/server/persistence/database");
      const row = getVortexDatabase().prepare("select 1 as ok").get() as { ok: number };
      if (row.ok !== 1) throw new Error("Database did not answer a trivial query.");
      return "reachable";
    }),
    check("object-store", async () => {
      const { getObjectStore } = await import("@/server/storage/container");
      const store = getObjectStore();
      // Reading a key that cannot exist proves the store is addressable
      // without writing anything into a live bucket on every probe.
      await store.get(`readiness/${crypto.randomUUID()}`);
      return "addressable";
    }),
  ]);

  const ready = checks.every((entry) => entry.ok);
  return NextResponse.json(
    { status: ready ? "ready" : "not-ready", checks },
    { status: ready ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
