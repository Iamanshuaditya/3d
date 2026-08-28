import type { NextRequest } from "next/server";

/**
 * True when the connection reaching the browser is HTTPS.
 *
 * Behind a load balancer the app itself speaks HTTP, so the forwarded protocol
 * is the authority. This decides both HSTS and whether an embedded session may
 * be issued a `SameSite=None; Secure; Partitioned` cookie, so it lives in one
 * place rather than being re-derived per call site.
 */
export function isSecureRequest(request: NextRequest): boolean {
  const forwarded = request.headers.get("x-forwarded-proto")?.split(",")[0].trim();
  return (forwarded ?? request.nextUrl.protocol.replace(":", "")) === "https";
}
