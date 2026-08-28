import type { NextRequest } from "next/server";
import { PlatformError } from "@/platform/projects/errors";
import {
  clearGuestCookie,
  resolveAuthenticatedOwner,
  resolveSignedGuestOwner,
} from "@/server/auth/owner-context";
import { assertSameOriginMutation, json, withPublicApi } from "@/server/http/api";
import { assertRateLimit } from "@/server/http/rate-limit";
import { getProjectService } from "@/server/projects/container";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  return withPublicApi(async () => {
    assertSameOriginMutation(request);
    const userOwner = await resolveAuthenticatedOwner(request);
    if (!userOwner) {
      throw new PlatformError(
        "AUTHENTICATION_REQUIRED",
        "Sign in before claiming guest projects.",
        401,
      );
    }
    const guestOwner = resolveSignedGuestOwner(request);
    if (!guestOwner) {
      throw new PlatformError(
        "GUEST_IDENTITY_REQUIRED",
        "A valid signed guest session is required to claim projects.",
        401,
      );
    }
    await assertRateLimit("project-claim", userOwner, { limit: 10, windowMs: 60_000 });
    const claimedProjectCount = await getProjectService().claimGuestProjects(
      guestOwner,
      userOwner,
    );
    return clearGuestCookie(json({ claimedProjectCount }));
  });
}
