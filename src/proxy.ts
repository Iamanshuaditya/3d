import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { frameAncestors } from "@/platform/embed/resolve-embed";
import { getEmbedClientRegistry } from "@/server/embed/embed-client-registry";
import { isSecureRequest } from "@/server/http/request-security";

/**
 * Framing and transport policy (#27, #26).
 *
 * Framing is decided per request because it is per client: the embedded
 * configurator must be frameable by exactly the origins a manufacturer
 * registered, and nothing else in the application may be framed at all. A
 * static `next.config` header cannot express that, and `X-Frame-Options` has
 * no multi-origin form, so `frame-ancestors` is the authority and
 * `X-Frame-Options: DENY` is sent only where it agrees.
 */
const EMBED_PATH = /^\/embed\/([^/]+)\/([^/]+)/;

function applyBaselineHeaders(response: NextResponse, request: NextRequest) {
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  if (isSecureRequest(request)) {
    response.headers.set(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains",
    );
  }
  return response;
}

export function proxy(request: NextRequest) {
  const response = applyBaselineHeaders(NextResponse.next(), request);
  const match = EMBED_PATH.exec(request.nextUrl.pathname);

  if (!match) {
    // The Studio and the operator console hold session and publishing controls.
    // Nothing outside the embed surface has any reason to be framed.
    response.headers.set("Content-Security-Policy", "frame-ancestors 'none'");
    response.headers.set("X-Frame-Options", "DENY");
    return response;
  }

  const clientId = decodeURIComponent(match[1]);
  const client = getEmbedClientRegistry().find(clientId);
  const origins = client && client.status === "active" ? frameAncestors(client) : [];

  // An unknown, disabled or origin-less client falls back to no framing at all.
  // The page itself still renders its rejection message for a direct visit.
  response.headers.set(
    "Content-Security-Policy",
    origins.length ? `frame-ancestors ${origins.join(" ")}` : "frame-ancestors 'none'",
  );
  if (!origins.length) response.headers.set("X-Frame-Options", "DENY");
  return response;
}

export const config = {
  // Static assets and image optimization carry no framing decision, and running
  // the registry lookup for every one of them would be pure overhead.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
