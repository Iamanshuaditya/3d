import { createHash, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import type { EmbedClient, EmbedClientReader } from "@/platform/embed/types";
import { PlatformError } from "@/platform/projects/errors";
import { getVortexDatabase } from "@/server/persistence/database";
import { getEmbedClientRegistry } from "./embed-client-registry";
import { EditorSessionRepository, type EditorSession } from "./editor-session-repository";

export function credentialDigest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function matchesDigest(value: string, digest: string) {
  const actual = Buffer.from(credentialDigest(value), "hex");
  const expected = Buffer.from(digest, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function authenticateMerchant(request: Pick<Request, "headers">, clients: EmbedClientReader): EmbedClient {
  const key = /^Bearer (\S+)$/.exec(request.headers.get("authorization") ?? "")?.[1];
  const client = key && key.length >= 32
    ? clients.list().find((entry) => entry.apiKeySha256 && matchesDigest(key, entry.apiKeySha256))
    : null;
  if (!client || client.status !== "active") {
    throw new PlatformError("INVALID_API_KEY", "A valid merchant server API key is required.", 401);
  }
  return client;
}

export function verifyEditorToken(
  token: string,
  repository: EditorSessionRepository,
  clients: EmbedClientReader,
  now = Date.now(),
): EditorSession {
  const id = /^vxs_([0-9a-f-]{36})\.[A-Za-z0-9_-]{43}$/.exec(token)?.[1];
  const entry = id ? repository.find(id) : null;
  if (!entry || !matchesDigest(token, entry.tokenSha256)) {
    throw new PlatformError("INVALID_EDITOR_SESSION", "This editor session is invalid. Reopen the editor from the store.", 401);
  }
  const { session } = entry;
  if (Date.parse(session.expiresAt) <= now) {
    throw new PlatformError("EDITOR_SESSION_EXPIRED", "This editor session has expired. Reopen it from the store to continue.", 401);
  }
  const client = clients.find(session.clientId);
  if (!client || client.status !== "active" || !client.productIds.includes(session.productId) || !client.allowedOrigins.includes(session.hostOrigin)
    || (session.mode === "pdf" && !client.features.downloadArtifact)) {
    throw new PlatformError("EDITOR_SESSION_DISABLED", "This editor session is no longer available.", 403);
  }
  return session;
}

/** Browser capabilities can access exactly one project, never account or catalog mutations. */
export function assertEditorRequestScope(session: EditorSession, pathname: string, method: string) {
  const root = `/api/v1/projects/${session.projectId}`;
  const allowed =
    (pathname === "/api/v1/session" && method === "GET") ||
    (pathname === root && ["GET", "PATCH"].includes(method)) ||
    (pathname === `${root}/assets` && ["GET", "POST"].includes(method)) ||
    (pathname.startsWith(`${root}/assets/`) && pathname.endsWith("/content") && method === "GET") ||
    (pathname === `${root}/preview` && method === "POST") ||
    (session.mode === "pdf" && pathname === `${root}/production/preflight` && method === "POST") ||
    (session.mode === "pdf" && pathname === `${root}/production/artifacts` && ["GET", "POST"].includes(method)) ||
    (session.mode === "pdf" && /^\/api\/v1\/production-artifacts\/[0-9a-f-]+(?:\/content)?$/.test(pathname) && method === "GET") ||
    (pathname === `/api/v1/editor-sessions/${session.id}/complete` && method === "POST");
  if (!allowed) throw new PlatformError("EDITOR_SCOPE_FORBIDDEN", "This editor session cannot access that resource.", 403);
}

export function editorRequestSession(request: NextRequest): EditorSession | null {
  const token = request.headers.get("x-vortex-session");
  if (token === null) return null;
  const session = verifyEditorToken(token, new EditorSessionRepository(getVortexDatabase()), getEmbedClientRegistry());
  assertEditorRequestScope(session, request.nextUrl.pathname, request.method);
  return session;
}
