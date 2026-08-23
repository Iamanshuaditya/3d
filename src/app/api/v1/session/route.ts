import type { NextRequest } from "next/server";
import { json, withOwner } from "@/server/http/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Establish the signed owner cookie before clients issue concurrent mutations.
 * The opaque owner id is intentionally not exposed; callers only need to know
 * whether the active context is anonymous or authenticated.
 */
export async function GET(request: NextRequest) {
  return withOwner(request, async ({ owner }) =>
    json({ owner: { type: owner.type } }),
  );
}
