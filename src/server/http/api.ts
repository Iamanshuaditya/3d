import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { PlatformError, ValidationError } from "@/platform/projects/errors";
import { ProductDomainError } from "@/platform/products/errors";
import { TemplateDomainError } from "@/platform/templates/errors";
import type { OwnerContext } from "@/server/auth/owner-context";
import { applyOwnerCookie, resolveOwnerContext } from "@/server/auth/owner-context";

const MAX_JSON_BYTES = 5 * 1024 * 1024;

export function assertSameOriginMutation(request: NextRequest) {
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite === "cross-site") {
    throw new PlatformError("CROSS_SITE_REQUEST", "Cross-site mutation is not allowed.", 403);
  }
  const origin = request.headers.get("origin");
  const protocol = request.headers.get("x-forwarded-proto")?.split(",")[0].trim()
    || request.nextUrl.protocol.replace(":", "");
  const hosts = [
    request.headers.get("host"),
    request.headers.get("x-forwarded-host")?.split(",")[0].trim(),
  ].filter((host): host is string => Boolean(host));
  const allowedOrigins = new Set([
    request.nextUrl.origin,
    ...hosts.map((host) => `${protocol}://${host}`),
  ]);
  if (origin && !allowedOrigins.has(origin)) {
    throw new PlatformError("ORIGIN_MISMATCH", "Request origin is not allowed.", 403);
  }
}

export async function readJson(request: NextRequest): Promise<unknown> {
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_JSON_BYTES) {
    throw new ValidationError("REQUEST_TOO_LARGE", "Request body is too large.");
  }
  const raw = await request.text();
  if (Buffer.byteLength(raw) > MAX_JSON_BYTES) {
    throw new ValidationError("REQUEST_TOO_LARGE", "Request body is too large.");
  }
  try {
    return JSON.parse(raw);
  } catch {
    throw new ValidationError("INVALID_JSON", "Request body must contain valid JSON.");
  }
}

export function json(data: unknown, status = 200) {
  const response = NextResponse.json(data, { status });
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export async function withOwner(
  request: NextRequest,
  handler: (context: OwnerContext) => Promise<NextResponse>,
) {
  let context: OwnerContext | null = null;
  try {
    context = await resolveOwnerContext(request);
    const response = await handler(context);
    return applyOwnerCookie(response, context);
  } catch (error) {
    if (error instanceof PlatformError) {
      const response = json(
        {
          error: {
            code: error.code,
            message: error.message,
            ...(error.details ? { details: error.details } : {}),
          },
        },
        error.status,
      );
      return context ? applyOwnerCookie(response, context) : response;
    }
    console.error(
      JSON.stringify({
        scope: "vortex-platform",
        event: "api.unhandled-error",
        message: error instanceof Error ? error.message : "Unknown error",
      }),
    );
    const response = json(
      { error: { code: "INTERNAL_ERROR", message: "The request could not be completed." } },
      500,
    );
    return context ? applyOwnerCookie(response, context) : response;
  }
}

/** Error boundary for public catalogue/read endpoints that do not need owner state. */
export async function withPublicApi(handler: () => Promise<NextResponse>) {
  try {
    return await handler();
  } catch (error) {
    if (error instanceof PlatformError) {
      return json(
        {
          error: {
            code: error.code,
            message: error.message,
            ...(error.details ? { details: error.details } : {}),
          },
        },
        error.status,
      );
    }
    console.error(JSON.stringify({
      scope: "vortex-platform",
      event: "api.unhandled-error",
      message: error instanceof Error ? error.message : "Unknown error",
    }));
    return json(
      { error: { code: "INTERNAL_ERROR", message: "The request could not be completed." } },
      500,
    );
  }
}

function adminDomainStatus(code: string) {
  if (code.includes("NOT_FOUND")) return 404;
  if (
    code.includes("CONFLICT") ||
    code.includes("STALE") ||
    code.includes("IMMUTABLE") ||
    code.includes("EXISTS") ||
    code.includes("ALREADY_PUBLISHED")
  ) return 409;
  if (code.includes("FORBIDDEN")) return 403;
  return 400;
}

/** Structured error boundary for authenticated operator APIs. */
export async function withAdminApi(handler: () => Promise<NextResponse>) {
  try {
    return await handler();
  } catch (error) {
    if (error instanceof PlatformError) {
      return json({
        error: {
          code: error.code,
          message: error.message,
          ...(error.details ? { details: error.details } : {}),
        },
      }, error.status);
    }
    if (error instanceof ProductDomainError || error instanceof TemplateDomainError) {
      return json({
        error: {
          code: error.code,
          message: error.message,
          ...(error.details ? { details: error.details } : {}),
        },
      }, adminDomainStatus(error.code));
    }
    console.error(JSON.stringify({
      scope: "vortex-platform",
      event: "admin-api.unhandled-error",
      message: error instanceof Error ? error.message : "Unknown error",
    }));
    return json(
      { error: { code: "INTERNAL_ERROR", message: "The request could not be completed." } },
      500,
    );
  }
}
