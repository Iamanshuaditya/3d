import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { PDFDocument } from "pdf-lib";
import sharp from "sharp";
import { PlatformError } from "@/platform/projects/errors";
import { DEFAULT_EMBED_FEATURES, DEFAULT_EMBED_THEME, resolveEmbedConfig } from "@/platform/embed/resolve-embed";
import type { EmbedClient } from "@/platform/embed/types";
import { StaticEmbedClientRegistry } from "@/server/embed/embed-client-registry";
import { credentialDigest, authenticateMerchant, verifyEditorToken, assertEditorRequestScope } from "@/server/embed/editor-session-auth";
import { EditorSessionRepository } from "@/server/embed/editor-session-repository";
import { EditorSessionService } from "@/server/embed/editor-session-service";
import { openVortexDatabase } from "@/server/persistence/database";
import { SqliteProjectRepository } from "@/server/persistence/sqlite-project-repository";
import { ProductCatalogService } from "@/server/products/product-catalog-service";
import { SqliteProductCatalogRepository } from "@/server/products/sqlite-product-catalog-repository";
import { ProjectService } from "@/server/projects/project-service";
import { PdfProductionExporter } from "@/server/production/pdf-production-exporter";
import { ProductionService } from "@/server/production/production-service";
import { SqliteProductionArtifactRepository } from "@/server/production/sqlite-production-artifact-repository";
import { FilesystemObjectStore } from "@/server/storage/filesystem-object-store";
import { markEmbedContext, clearEmbedContext, embedRequestHeaders } from "@/lib/embed/embed-request-context";

const KEY = "test-server-key-not-a-real-credential-123456789";
const CLIENT: EmbedClient = {
  id: "test-store", name: "Test store", status: "active",
  allowedOrigins: ["https://shop.example.test"],
  productIds: ["mailer-box-001", "coffee-cup", "blender-pouch-v3-preview"],
  apiKeySha256: credentialDigest(KEY), theme: DEFAULT_EMBED_THEME,
  features: { ...DEFAULT_EMBED_FEATURES, text: true, uploads: true, downloadArtifact: true },
  completion: { mode: "save", ctaLabel: "Finish", confirmationText: "Ready" },
};
const registry = new StaticEmbedClientRegistry([CLIENT]);
const isCode = (code: string) => (error: unknown) => error instanceof PlatformError && error.code === code;
const tokenOf = (editorUrl: string) => new URLSearchParams(new URL(editorUrl).hash.slice(1)).get("token")!;

async function fixture(t: TestContext) {
  const directory = await mkdtemp(join(tmpdir(), "vortex-session-test-"));
  const database = openVortexDatabase(":memory:");
  const projectsRepository = new SqliteProjectRepository(database);
  const catalog = new ProductCatalogService(new SqliteProductCatalogRepository(database));
  const store = new FilesystemObjectStore(directory);
  const projects = new ProjectService(projectsRepository, store, undefined, undefined, catalog);
  const production = new ProductionService(projectsRepository, new SqliteProductionArtifactRepository(database), store, catalog, [new PdfProductionExporter()]);
  const repository = new EditorSessionRepository(database);
  let clock = Date.now();
  const service = new EditorSessionService(repository, registry, projects, catalog, production, () => clock);
  t.after(async () => { database.close(); await rm(directory, { recursive: true, force: true }); });
  return { service, repository, projects, production, catalog, now: () => clock, advance: () => { clock += 3_600_001; } };
}

test("merchant keys authenticate only active clients and never enter resolved browser configuration", () => {
  assert.equal(authenticateMerchant({ headers: new Headers({ Authorization: `Bearer ${KEY}` }) }, registry).id, CLIENT.id);
  for (const authorization of ["", "Bearer wrong", `Basic ${KEY}`, `Bearer ${KEY}x`]) {
    assert.throws(() => authenticateMerchant({ headers: new Headers({ authorization }) }, registry), isCode("INVALID_API_KEY"));
  }
  const disabled = new StaticEmbedClientRegistry([{ ...CLIENT, status: "disabled" }]);
  assert.throws(() => authenticateMerchant({ headers: new Headers({ Authorization: `Bearer ${KEY}` }) }, disabled), isCode("INVALID_API_KEY"));
  const browser = resolveEmbedConfig(registry, { clientId: CLIENT.id, productId: "mailer-box-001", hostOrigin: CLIENT.allowedOrigins[0] });
  assert.equal("apiKeySha256" in browser, false);
  assert.equal(JSON.stringify(browser).includes(KEY), false);
});

test("launches pin a product/project, keep the browser secret in a fragment, and reject unregistered scope", async (t) => {
  const f = await fixture(t);
  const launch = await f.service.create(CLIENT, { productId: "mailer-box-001", referenceId: "cart-line-7" }, "https://vortex.example.test");
  const url = new URL(launch.editorUrl);
  assert.equal(url.pathname, "/editor/test-store/mailer-box-001");
  assert.equal(url.searchParams.has("token"), false);
  assert.equal(launch.mode, "pdf");
  assert.equal(launch.capabilities.pdf, true);
  assert.equal(launch.returnUrl, "https://shop.example.test/");
  const session = verifyEditorToken(tokenOf(launch.editorUrl), f.repository, registry, f.now());
  assert.equal(session.productVersionId, "mailer-box-001@3");
  assert.equal(session.referenceId, "cart-line-7");
  const stored = f.repository.find(session.id)!;
  assert.notEqual(stored.tokenSha256, tokenOf(launch.editorUrl));
  for (const input of [{ productId: "bottle-001" }, { productId: "mailer-box-001", hostOrigin: "https://evil.test" }]) {
    await assert.rejects(() => f.service.create(CLIENT, input, url.origin), isCode("EDITOR_NOT_ALLOWED"));
  }
  await assert.rejects(() => f.service.create(CLIENT, { productId: "mailer-box-001", mode: "anything" }, url.origin), isCode("INVALID_MODE"));
});

test("full-page return URLs stay on the registered host and survive session renewal", async (t) => {
  const f = await fixture(t);
  const launch = await f.service.create(CLIENT, { productId: "coffee-cup", returnUrl: "/cart/design?item=7#saved" }, "https://vortex.example.test");
  assert.equal(launch.returnUrl, "https://shop.example.test/cart/design?item=7#saved");
  const session = verifyEditorToken(tokenOf(launch.editorUrl), f.repository, registry, f.now());
  assert.equal(session.returnUrl, launch.returnUrl);
  const resumed = await f.service.create(CLIENT, { productId: "coffee-cup", resumeSessionId: session.id }, "https://vortex.example.test");
  assert.equal(resumed.returnUrl, launch.returnUrl);
  assert.equal(resumed.sessionId, session.id);
  for (const returnUrl of ["https://evil.test/cart", "//evil.test", "javascript:alert(1)", "https://shop.example.test.evil.test", "https://user@shop.example.test/cart", "data:text/html,hello", 123]) {
    await assert.rejects(() => f.service.create(CLIENT, { productId: "coffee-cup", returnUrl }, "https://vortex.example.test"), isCode("INVALID_RETURN_URL"));
  }
});

test("browser capabilities expire, rotate on resume, and cannot access another project or account mutations", async (t) => {
  const f = await fixture(t);
  const launch = await f.service.create(CLIENT, { productId: "coffee-cup" }, "https://vortex.example.test");
  const token = tokenOf(launch.editorUrl);
  const session = verifyEditorToken(token, f.repository, registry, f.now());
  assertEditorRequestScope(session, `/api/v1/projects/${session.projectId}`, "PATCH");
  assertEditorRequestScope(session, `/api/v1/editor-sessions/${session.id}/complete`, "POST");
  for (const [path, method] of [["/api/v1/projects", "POST"], ["/api/v1/projects/other", "GET"], ["/api/v1/admin/products", "POST"], [`/api/v1/projects/${session.projectId}`, "DELETE"]]) {
    assert.throws(() => assertEditorRequestScope(session, path, method), isCode("EDITOR_SCOPE_FORBIDDEN"));
  }
  assert.throws(() => verifyEditorToken(token.slice(0, -1), f.repository, registry, f.now()), isCode("INVALID_EDITOR_SESSION"));
  f.advance();
  assert.throws(() => verifyEditorToken(token, f.repository, registry, f.now()), isCode("EDITOR_SESSION_EXPIRED"));
  const resumed = await f.service.create(CLIENT, { productId: "coffee-cup", resumeSessionId: session.id }, "https://vortex.example.test");
  assert.equal(resumed.sessionId, session.id);
  const next = verifyEditorToken(tokenOf(resumed.editorUrl), f.repository, registry, f.now());
  assert.equal(next.projectId, session.projectId);
  assert.equal(next.productVersionId, session.productVersionId);
  assert.throws(() => verifyEditorToken(token, f.repository, registry, f.now()), isCode("INVALID_EDITOR_SESSION"));
  const disabled = new StaticEmbedClientRegistry([{ ...CLIENT, features: { ...CLIENT.features, downloadArtifact: false } }]);
  assert.throws(() => verifyEditorToken(tokenOf(resumed.editorUrl), f.repository, disabled, f.now()), isCode("EDITOR_SESSION_DISABLED"));
});

test("finishing generates a verified PDF for the latest revision; edits invalidate completion and cross-client downloads fail", async (t) => {
  const f = await fixture(t);
  const launch = await f.service.create(CLIENT, { productId: "mailer-box-001" }, "https://vortex.example.test");
  const session = verifyEditorToken(tokenOf(launch.editorUrl), f.repository, registry, f.now());
  const owner = { type: "guest" as const, id: session.ownerId };
  const project = await f.projects.open(owner, session.projectId);
  const design = structuredClone(project.design);
  Object.values(design.surfaces)[0].background = "#2d6a4f";
  const saved = await f.projects.update(owner, project.id, { expectedRevision: project.revision, design });
  await assert.rejects(() => f.service.complete(session, project.revision), isCode("EDITOR_REVISION_CONFLICT"));
  const result = await f.service.complete(session, saved.revision);
  assert.equal(result.status, "ready");
  assert.equal(result.revision, saved.revision);
  assert.ok(result.artifact);
  const download = await f.service.artifact(CLIENT.id, session.id);
  assert.equal(Buffer.from(download.object.bytes).subarray(0, 5).toString(), "%PDF-");
  assert.equal(createHash("sha256").update(download.object.bytes).digest("hex"), result.artifact.sha256);
  const pdf = await PDFDocument.load(download.object.bytes);
  assert.ok(pdf.getPageCount() > 0);
  assert.ok(pdf.getPage(0).getWidth() > 500);
  const repeated = await f.service.complete(session, saved.revision);
  assert.equal(repeated.artifact?.id, result.artifact.id);
  f.advance();
  assert.equal((await f.service.status(CLIENT.id, session.id)).status, "ready");
  await assert.rejects(() => f.service.artifact("another-store", session.id), isCode("EDITOR_SESSION_NOT_FOUND"));
  await f.projects.update(owner, project.id, { expectedRevision: saved.revision, design: { ...design, surfaces: { ...design.surfaces } } });
  assert.equal((await f.service.status(CLIENT.id, session.id)).result, null);
  await assert.rejects(() => f.service.artifact(CLIENT.id, session.id), isCode("EDITOR_ARTIFACT_NOT_READY"));
});

test("the original pouch can save a preview but cannot bypass PDF preflight or generation", async (t) => {
  const f = await fixture(t);
  const launch = await f.service.create(CLIENT, { productId: "blender-pouch-v3-preview" }, "https://vortex.example.test");
  assert.equal(launch.mode, "preview");
  assert.deepEqual(launch.capabilities, { pdf: false, svg: false });
  const session = verifyEditorToken(tokenOf(launch.editorUrl), f.repository, registry, f.now());
  const owner = { type: "guest" as const, id: session.ownerId };
  const project = await f.projects.open(owner, session.projectId);
  assert.equal((await f.service.complete(session, project.revision)).status, "saved");
  assert.equal((await f.service.status(CLIENT.id, session.id)).result?.artifact, null);
  await assert.rejects(() => f.service.create(CLIENT, { productId: session.productId, mode: "pdf" }, "https://vortex.example.test"), isCode("PRINT_EXPORT_UNAVAILABLE"));
  await assert.rejects(() => f.production.preflight(owner, project.id, project.revision), isCode("PRODUCT_PREVIEW_ONLY"));
  await assert.rejects(() => f.production.generate(owner, project.id, "pdf", project.revision), isCode("PRODUCT_PREVIEW_ONLY"));
  assert.throws(() => assertEditorRequestScope(session, `/api/v1/projects/${project.id}/production/artifacts`, "POST"), isCode("EDITOR_SCOPE_FORBIDDEN"));
});

test("missing fragment credentials fail closed instead of falling back to an anonymous cookie", () => {
  markEmbedContext("test-store", { id: "test-session", token: "" });
  assert.equal(embedRequestHeaders()["x-vortex-session"], "");
  clearEmbedContext();
  assert.deepEqual(embedRequestHeaders(), {});
});

test("session-owned artwork survives reopening and stays inaccessible to another session", async (t) => {
  const f = await fixture(t);
  const first = await f.service.create(CLIENT, { productId: "coffee-cup" }, "https://vortex.example.test");
  const session = verifyEditorToken(tokenOf(first.editorUrl), f.repository, registry, f.now());
  const owner = { type: "guest" as const, id: session.ownerId };
  const bytes = await sharp({ create: { width: 1200, height: 800, channels: 3, background: "#0f4c5c" } }).png().toBuffer();
  const asset = await f.projects.uploadArtwork(owner, session.projectId, "brand-artwork.png", bytes);
  const reopened = await f.service.create(CLIENT, { productId: "coffee-cup", resumeSessionId: session.id }, "https://vortex.example.test");
  const resumed = verifyEditorToken(tokenOf(reopened.editorUrl), f.repository, registry, f.now());
  const saved = await f.projects.readAsset({ type: "guest", id: resumed.ownerId }, resumed.projectId, asset.id);
  assert.equal(saved.asset.sha256, asset.sha256);
  assert.equal(saved.object.byteSize, asset.byteSize);
  const other = await f.service.create(CLIENT, { productId: "coffee-cup" }, "https://vortex.example.test");
  const otherSession = verifyEditorToken(tokenOf(other.editorUrl), f.repository, registry, f.now());
  await assert.rejects(() => f.projects.readAsset({ type: "guest", id: otherSession.ownerId }, session.projectId, asset.id));
});

test("resuming preserves the saved product version after a new version is published", async (t) => {
  const f = await fixture(t);
  const launch = await f.service.create(CLIENT, { productId: "coffee-cup" }, "https://vortex.example.test");
  const session = verifyEditorToken(tokenOf(launch.editorUrl), f.repository, registry, f.now());
  const definition = (await f.catalog.listDefinitions()).find((entry) => entry.id === "coffee-cup")!;
  const original = (await f.catalog.listVersions("coffee-cup")).find((entry) => entry.id === session.productVersionId)!;
  const next = structuredClone(original);
  next.id = "coffee-cup@2";
  next.version = 2;
  next.publishedAt = new Date(f.now()).toISOString();
  await f.catalog.publish(definition, next);
  assert.equal((await f.catalog.resolve("coffee-cup", null, {})).productVersionId, next.id);
  const resume = await f.service.create(CLIENT, { productId: "coffee-cup", resumeSessionId: session.id }, "https://vortex.example.test");
  const frame = f.service.frameSession(resume.sessionId, CLIENT.id, "coffee-cup", CLIENT.allowedOrigins[0]);
  assert.equal(frame.productVersionId, session.productVersionId);
  assert.equal(frame.projectId, session.projectId);
});
