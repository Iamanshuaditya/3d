import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { NextRequest, NextResponse } from "next/server";
import type { ProjectOwner } from "@/platform/projects/types";

const COOKIE_NAME = "vortex_guest";
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export interface AuthenticationProvider {
  authenticatedOwner(request: NextRequest): Promise<Extract<ProjectOwner, { type: "user" }> | null>;
}

type SessionResolver = (
  headers: Headers,
) => Promise<{ user: { id: string } } | null>;

export class BetterAuthAuthenticationProvider implements AuthenticationProvider {
  constructor(
    private readonly resolveSession: SessionResolver = async (headers) => {
      const { getAuth } = await import("@/server/auth/better-auth");
      return getAuth().api.getSession({ headers });
    },
  ) {}

  async authenticatedOwner(request: NextRequest) {
    const session = await this.resolveSession(request.headers);
    const userId = session?.user.id;
    if (!userId) return null;
    console.info(JSON.stringify({
      scope: "vortex-platform",
      event: "auth.user-resolved",
      userId,
    }));
    return { type: "user" as const, id: userId };
  }
}

export type OwnerContext = {
  owner: ProjectOwner;
  pendingGuestCookie: string | null;
};

export class GuestIdentityCodec {
  constructor(private readonly secret: Uint8Array) {
    if (secret.byteLength < 32) throw new Error("Guest identity secret must be at least 32 bytes.");
  }

  private signature(id: string) {
    return createHmac("sha256", this.secret).update(id).digest("base64url");
  }

  issue(id = crypto.randomUUID()) {
    return `${id}.${this.signature(id)}`;
  }

  verify(value: string | undefined): string | null {
    if (!value) return null;
    const separator = value.indexOf(".");
    if (separator < 1) return null;
    const id = value.slice(0, separator);
    const supplied = value.slice(separator + 1);
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        id,
      ) ||
      !supplied
    ) return null;
    const expected = this.signature(id);
    const suppliedBytes = Buffer.from(supplied);
    const expectedBytes = Buffer.from(expected);
    if (
      suppliedBytes.byteLength !== expectedBytes.byteLength ||
      !timingSafeEqual(suppliedBytes, expectedBytes)
    ) {
      return null;
    }
    return id;
  }
}

function dataRoot() {
  return process.env.VORTEX_DATA_DIR || join(process.cwd(), ".data");
}

function loadGuestSecret(): Uint8Array {
  const configured = process.env.VORTEX_GUEST_COOKIE_SECRET;
  if (configured) {
    const secret = Buffer.from(configured, "base64url");
    if (secret.byteLength < 32) {
      throw new Error("VORTEX_GUEST_COOKIE_SECRET must contain at least 32 random bytes.");
    }
    return secret;
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("VORTEX_GUEST_COOKIE_SECRET is required in production.");
  }

  const root = dataRoot();
  const path = join(root, "guest-cookie-secret");
  mkdirSync(root, { recursive: true });
  try {
    writeFileSync(path, randomBytes(32).toString("base64url"), {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  }
  return Buffer.from(readFileSync(path, "utf8").trim(), "base64url");
}

let codec: GuestIdentityCodec | null = null;
let authenticationProvider: AuthenticationProvider = new BetterAuthAuthenticationProvider();

export function setAuthenticationProvider(provider: AuthenticationProvider) {
  authenticationProvider = provider;
}

export function resetAuthenticationProvider() {
  authenticationProvider = new BetterAuthAuthenticationProvider();
}

function guestIdentityCodec() {
  codec ??= new GuestIdentityCodec(loadGuestSecret());
  return codec;
}

export async function resolveAuthenticatedOwner(request: NextRequest) {
  return authenticationProvider.authenticatedOwner(request);
}

export function resolveSignedGuestOwner(
  request: NextRequest,
): Extract<ProjectOwner, { type: "guest" }> | null {
  const guestId = guestIdentityCodec().verify(request.cookies.get(COOKIE_NAME)?.value);
  return guestId ? { type: "guest", id: guestId } : null;
}

export async function resolveOwnerContext(request: NextRequest): Promise<OwnerContext> {
  const authenticated = await resolveAuthenticatedOwner(request);
  if (authenticated) return { owner: authenticated, pendingGuestCookie: null };

  const existingToken = request.cookies.get(COOKIE_NAME)?.value;
  const existingId = guestIdentityCodec().verify(existingToken);
  if (existingId) {
    return { owner: { type: "guest", id: existingId }, pendingGuestCookie: null };
  }

  const token = guestIdentityCodec().issue();
  const guestId = guestIdentityCodec().verify(token)!;
  return {
    owner: { type: "guest", id: guestId },
    pendingGuestCookie: token,
  };
}

export function clearGuestCookie(response: NextResponse) {
  response.cookies.set(COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
    priority: "high",
  });
  return response;
}

export function applyOwnerCookie(response: NextResponse, context: OwnerContext) {
  if (!context.pendingGuestCookie) return response;
  response.cookies.set(COOKIE_NAME, context.pendingGuestCookie, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: COOKIE_MAX_AGE_SECONDS,
    priority: "high",
  });
  return response;
}
