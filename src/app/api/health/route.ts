import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Liveness (#26).
 *
 * Deliberately checks nothing but the process. A liveness probe that touches
 * the database restarts a healthy app during a transient database blip, which
 * turns a small outage into a crash loop. Dependency checks belong in /api/ready.
 */
export function GET() {
  return NextResponse.json(
    { status: "ok", uptimeSeconds: Math.round(process.uptime()) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
