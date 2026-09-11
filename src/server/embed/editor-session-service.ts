import { randomBytes, randomUUID } from "node:crypto";
import type { EmbedClient, EmbedClientReader } from "@/platform/embed/types";
import { normalizeOrigin, resolveEmbedConfig } from "@/platform/embed/resolve-embed";
import { PlatformError, ValidationError } from "@/platform/projects/errors";
import type { ProjectService } from "@/server/projects/project-service";
import type { ProductionService } from "@/server/production/production-service";
import type { ProductCatalogService } from "@/server/products/product-catalog-service";
import { supportsManufacturingSvg } from "@/lib/print/manufacturing-geometry";
import { parseOptionSelection } from "@/platform/products/configuration-resolver";
import type { EditorSessionLaunch, EditorSessionResult } from "@/lib/embed/editor-session-types";
import { credentialDigest } from "./editor-session-auth";
import { EditorSessionRepository, type EditorSession } from "./editor-session-repository";

const SESSION_LIFETIME_MS = 60 * 60 * 1000;
const ownerOf = (session: EditorSession) => ({ type: "guest" as const, id: session.ownerId });

export class EditorSessionService {
  constructor(
    private readonly repository: EditorSessionRepository,
    private readonly clients: EmbedClientReader,
    private readonly projects: ProjectService,
    private readonly catalog: ProductCatalogService,
    private readonly production: ProductionService,
    private readonly now: () => number = Date.now,
  ) {}

  private ownedSession(clientId: string, id: string) {
    const entry = this.repository.find(id);
    if (!entry || entry.session.clientId !== clientId) {
      throw new PlatformError("EDITOR_SESSION_NOT_FOUND", "Editor session not found.", 404);
    }
    return entry;
  }

  async create(client: EmbedClient, input: unknown, baseUrl: string): Promise<EditorSessionLaunch> {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      throw new ValidationError("INVALID_REQUEST", "Send a JSON object containing productId.");
    }
    const values = input as Record<string, unknown>;
    if (typeof values.productId !== "string" || !values.productId || values.productId.length > 160) {
      throw new ValidationError("INVALID_PRODUCT", "productId is required.");
    }
    if (values.mode !== undefined && values.mode !== "pdf" && values.mode !== "preview") {
      throw new ValidationError("INVALID_MODE", "mode must be pdf or preview.");
    }
    if (values.referenceId !== undefined && (typeof values.referenceId !== "string" || values.referenceId.length > 200)) {
      throw new ValidationError("INVALID_REFERENCE", "referenceId must be a string of at most 200 characters.");
    }
    const hostOrigin = values.hostOrigin === undefined ? client.allowedOrigins[0]
      : typeof values.hostOrigin === "string" ? normalizeOrigin(values.hostOrigin) : null;
    try {
      resolveEmbedConfig(this.clients, { clientId: client.id, productId: values.productId, hostOrigin });
    } catch {
      throw new PlatformError("EDITOR_NOT_ALLOWED", "This product or host origin is not enabled for your integration.", 403);
    }
    const prior = values.resumeSessionId === undefined ? null
      : typeof values.resumeSessionId === "string" ? this.ownedSession(client.id, values.resumeSessionId).session
        : (() => { throw new ValidationError("INVALID_SESSION", "resumeSessionId must be a string."); })();
    if (prior && (prior.productId !== values.productId || prior.hostOrigin !== hostOrigin)) {
      throw new PlatformError("EDITOR_SESSION_MISMATCH", "Resume the original product and host origin.", 409);
    }
    let returnUrl: URL;
    try {
      const destination = values.returnUrl ?? prior?.returnUrl ?? hostOrigin;
      if (typeof destination !== "string" || destination.length > 2048) throw new Error("Invalid return URL");
      returnUrl = new URL(destination, hostOrigin!);
      if (returnUrl.origin !== hostOrigin || returnUrl.username || returnUrl.password) throw new Error("Invalid return origin");
    } catch {
      throw new ValidationError("INVALID_RETURN_URL", "returnUrl must belong to the registered hostOrigin.");
    }
    const selection = prior?.optionSelection ?? parseOptionSelection(values.optionSelection ?? {});
    const resolved = await this.catalog.resolve(values.productId, prior?.productVersionId ?? null, selection);
    const config = resolved.productConfig;
    const mode = values.mode ?? prior?.mode ?? (config.previewOnly || !client.features.downloadArtifact ? "preview" : "pdf");
    if (mode === "pdf" && (config.previewOnly || !client.features.downloadArtifact)) {
      throw new PlatformError("PRINT_EXPORT_UNAVAILABLE", "This product or integration supports preview saving only. Use mode: preview.", 422);
    }
    const ownerId = prior?.ownerId ?? randomUUID();
    const project = prior ? await this.projects.open(ownerOf(prior), prior.projectId)
      : await this.projects.create({ type: "guest", id: ownerId }, config.id, undefined, randomUUID(), resolved.selection, resolved.productVersionId);
    const session: EditorSession = {
      id: prior?.id ?? randomUUID(), clientId: client.id, projectId: project.id, ownerId,
      productId: config.id, productVersionId: project.productVersionId,
      optionSelection: project.optionSelection, hostOrigin: hostOrigin!, returnUrl: returnUrl.toString(),
      mode, referenceId: typeof values.referenceId === "string" ? values.referenceId : prior?.referenceId ?? null,
      createdAt: prior?.createdAt ?? new Date(this.now()).toISOString(),
      expiresAt: new Date(this.now() + SESSION_LIFETIME_MS).toISOString(),
    };
    const token = `vxs_${session.id}.${randomBytes(32).toString("base64url")}`;
    this.repository.put(session, credentialDigest(token));
    const url = new URL(`/editor/${encodeURIComponent(client.id)}/${encodeURIComponent(config.id)}`, baseUrl);
    url.searchParams.set("host", session.hostOrigin);
    url.searchParams.set("session", session.id);
    // Fragments never reach access logs or the HTTP Referrer header.
    url.hash = new URLSearchParams({ token }).toString();
    return {
      sessionId: session.id, productId: config.id, editorUrl: url.toString(), returnUrl: returnUrl.toString(), expiresAt: session.expiresAt, mode,
      capabilities: { pdf: mode === "pdf",
        svg: mode === "pdf" && supportsManufacturingSvg(config) },
    };
  }

  /** Public product configuration is renderable; project access still requires the fragment capability. */
  frameSession(id: string, clientId: string, productId: string, hostOrigin: string): EditorSession {
    const { session } = this.ownedSession(clientId, id);
    if (session.productId !== productId || session.hostOrigin !== hostOrigin || Date.parse(session.expiresAt) <= this.now()) {
      throw new PlatformError("EDITOR_SESSION_UNAVAILABLE", "Reopen this editor from the store to continue.", 403);
    }
    return session;
  }

  async complete(session: EditorSession, revision: unknown): Promise<EditorSessionResult> {
    if (!Number.isSafeInteger(revision) || Number(revision) < 1) {
      throw new ValidationError("INVALID_REVISION", "Save the design before finishing it.");
    }
    const owner = ownerOf(session);
    const project = await this.projects.open(owner, session.projectId);
    if (project.revision !== revision) {
      throw new PlatformError("EDITOR_REVISION_CONFLICT", "The design changed. Save it and finish again.", 409);
    }
    const artifact = session.mode === "pdf" ? await this.production.generate(owner, project.id, "pdf", project.revision) : null;
    const result: EditorSessionResult = {
      sessionId: session.id, projectId: project.id, productId: session.productId,
      revision: project.revision, mode: session.mode, status: artifact ? "ready" : "saved",
      artifact: artifact ? {
        id: artifact.id, filename: artifact.filename, mimeType: "application/pdf", byteSize: artifact.byteSize,
        sha256: artifact.sha256, downloadUrl: `/api/v1/editor-sessions/${session.id}/artifact`,
      } : null,
      warnings: artifact?.preflightReport.issues.filter((issue) => issue.severity === "warning")
        .map(({ code, message }) => ({ code, message })) ?? [],
    };
    this.repository.complete(session.id, result);
    return result;
  }

  async status(clientId: string, id: string) {
    const { session, result } = this.ownedSession(clientId, id);
    const project = await this.projects.open(ownerOf(session), session.projectId);
    const current = result?.revision === project.revision && result.mode === session.mode ? result : null;
    return {
      sessionId: id, productId: session.productId, projectId: session.projectId,
      referenceId: session.referenceId, revision: project.revision, expiresAt: session.expiresAt,
      status: current?.status ?? (Date.parse(session.expiresAt) <= this.now() ? "expired" : "editing"),
      result: current,
    };
  }

  async artifact(clientId: string, id: string) {
    const { session } = this.ownedSession(clientId, id);
    const status = await this.status(clientId, id);
    if (!status.result?.artifact) throw new PlatformError("EDITOR_ARTIFACT_NOT_READY", "Finish the current design before downloading its PDF.", 409);
    return this.production.read(ownerOf(session), status.result.artifact.id);
  }
}
