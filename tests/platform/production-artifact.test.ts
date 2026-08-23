import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFNumber,
  PDFRawStream,
} from "pdf-lib";
import sharp from "sharp";
import type { DesignDocument, ImageElement, TextElement } from "@/types/configurator";
import { DEFAULT_EMBROIDERY } from "@/types/embroidery";
import { NotFoundError } from "@/platform/projects/errors";
import type { ProjectOwner } from "@/platform/projects/types";
import { ProductionPreflightError } from "@/platform/production/errors";
import type { ProductionExporter } from "@/platform/production/exporter";
import { openVortexDatabase } from "@/server/persistence/database";
import { SqliteProjectRepository } from "@/server/persistence/sqlite-project-repository";
import { ProductCatalogService } from "@/server/products/product-catalog-service";
import { SqliteProductCatalogRepository } from "@/server/products/sqlite-product-catalog-repository";
import { ProjectService } from "@/server/projects/project-service";
import { PdfProductionExporter } from "@/server/production/pdf-production-exporter";
import { ProductionService } from "@/server/production/production-service";
import { SqliteProductionArtifactRepository } from "@/server/production/sqlite-production-artifact-repository";
import { FilesystemObjectStore } from "@/server/storage/filesystem-object-store";

const guest: ProjectOwner = {
  type: "guest",
  id: "0e272686-d645-4af8-bf15-cbc85a6b60b1",
};
const otherGuest: ProjectOwner = {
  type: "guest",
  id: "8caf6d89-0522-4f90-a009-5ba19238a356",
};

async function fixture(t: TestContext, exporter: ProductionExporter = new PdfProductionExporter()) {
  const directory = await mkdtemp(join(tmpdir(), "vortex-production-test-"));
  const database = openVortexDatabase(":memory:");
  const projectsRepository = new SqliteProjectRepository(database);
  const artifactsRepository = new SqliteProductionArtifactRepository(database);
  const objectStore = new FilesystemObjectStore(directory);
  const catalog = new ProductCatalogService(
    new SqliteProductCatalogRepository(database),
  );
  const projects = new ProjectService(
    projectsRepository,
    objectStore,
    undefined,
    undefined,
    catalog,
  );
  const production = new ProductionService(
    projectsRepository,
    artifactsRepository,
    objectStore,
    catalog,
    [exporter],
  );
  t.after(async () => {
    database.close();
    await rm(directory, { recursive: true, force: true });
  });
  return {
    projects,
    production,
    projectsRepository,
    artifactsRepository,
    objectStore,
  };
}

function addText(document: DesignDocument, id: string, text: string) {
  const next = structuredClone(document);
  const surface = Object.values(next.surfaces)[0];
  const element: TextElement = {
    id,
    type: "text",
    text,
    x: 120,
    y: 80,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
    opacity: 1,
    fontFamily: "Arial, sans-serif",
    fontSize: 54,
    fill: "#14213d",
  };
  surface.elements.push(element);
  return next;
}

test("production artifacts freeze exact revisions and remain immutable after later edits", async (t) => {
  const { projects, production, artifactsRepository } = await fixture(t);
  const created = await projects.create(guest, "bottle-001", "Immutable bottle label");
  const revisionTwo = await projects.update(guest, created.id, {
    expectedRevision: 1,
    design: addText(created.design, "headline", "Revision two"),
  });

  const preflight = await production.preflight(guest, created.id, 2);
  assert.equal(preflight.report.passed, true);
  assert.equal((await projects.open(guest, created.id)).status, "ready_for_preflight");

  const artifactA = await production.generate(guest, created.id, "pdf", 2);
  assert.equal(artifactA.projectRevision, 2);
  assert.equal(artifactA.productVersionId, revisionTwo.productVersionId);
  assert.equal(artifactA.configurationId, revisionTwo.configurationId);
  assert.equal(artifactA.preflightReport.passed, true);
  assert.equal((artifactA as unknown as { storageKey?: string }).storageKey, undefined);
  assert.match(artifactA.sha256, /^[0-9a-f]{64}$/);
  assert.equal((await projects.open(guest, created.id)).status, "production_ready");

  const firstRead = await production.read(guest, artifactA.id);
  assert.equal(createHash("sha256").update(firstRead.object.bytes).digest("hex"), artifactA.sha256);
  assert.equal(Buffer.from(firstRead.object.bytes).subarray(0, 8).toString(), "%PDF-1.6");
  assert.equal((await PDFDocument.load(firstRead.object.bytes)).getPageCount(), 1);
  const source = Buffer.from(firstRead.object.bytes).toString("latin1");
  assert.match(source, /\/CutContour/);
  assert.match(source, /\/Crease/);
  assert.match(source, /\/OutputIntents/);

  const idempotent = await production.generate(guest, created.id, "pdf", 2);
  assert.equal(idempotent.id, artifactA.id);
  assert.equal((await artifactsRepository.list(created.id, guest)).length, 1);

  const revisionThree = await projects.update(guest, created.id, {
    expectedRevision: 2,
    design: addText(revisionTwo.design, "footer", "Revision three"),
  });
  assert.equal(revisionThree.revision, 3);
  assert.equal(revisionThree.status, "draft", "editing invalidates current production readiness");

  const artifactB = await production.generate(guest, created.id, "pdf", 3);
  assert.equal(artifactB.projectRevision, 3);
  assert.notEqual(artifactB.id, artifactA.id);
  assert.equal((await production.list(guest, created.id)).length, 2);

  const unchangedA = await production.read(guest, artifactA.id);
  assert.equal(createHash("sha256").update(unchangedA.object.bytes).digest("hex"), artifactA.sha256);
  assert.equal(artifactA.projectRevision, 2);
  await assert.rejects(() => production.metadata(otherGuest, artifactA.id), NotFoundError);
  await assert.rejects(() => production.read(otherGuest, artifactA.id), NotFoundError);
});

test("server packaging export loads the checked CMYK profile and preserves physical size", async (t) => {
  const { projects, production } = await fixture(t);
  const project = await projects.create(guest, "mailer-box-001", "CMYK mailer");
  const artifact = await production.generate(guest, project.id);
  const { object } = await production.read(guest, artifact.id);
  const pdf = await PDFDocument.load(object.bytes, { updateMetadata: false });
  const page = pdf.getPage(0);
  const box = page.getMediaBox();
  assert.ok(Math.abs((box.width * 25.4) / 72 - 376) < 0.01);
  assert.ok(Math.abs((box.height * 25.4) / 72 - 554) < 0.01);

  const intents = pdf.catalog.lookup(PDFName.of("OutputIntents"), PDFArray);
  const intent = pdf.context.lookup(intents.get(0)) as PDFDict;
  const profile = pdf.context.lookup(
    intent.get(PDFName.of("DestOutputProfile")),
  ) as PDFRawStream;
  assert.equal(profile.dict.lookup(PDFName.of("N"), PDFNumber).asNumber(), 4);
  assert.ok(
    artifact.preflightReport.issues.some(
      (issue) => issue.code === "SIMULATED_CONVERTER_PROFILE" && issue.severity === "warning",
    ),
  );
});

test("server rendering uses owned artwork bytes and preflight detects storage tampering", async (t) => {
  const { projects, production, projectsRepository, objectStore } = await fixture(t);
  const created = await projects.create(guest, "bottle-001", "Artwork integrity");
  const png = await sharp({
    create: {
      width: 256,
      height: 256,
      channels: 4,
      background: { r: 20, g: 120, b: 210, alpha: 1 },
    },
  }).png().toBuffer();
  const asset = await projects.uploadArtwork(guest, created.id, "trusted-logo.png", png);
  const design = structuredClone(created.design);
  const surface = Object.values(design.surfaces)[0];
  const image: ImageElement = {
    id: "logo",
    type: "image",
    assetId: asset.id,
    src: "blob:must-not-be-used-by-server",
    x: 80,
    y: 60,
    width: 128,
    height: 128,
    rotation: 8,
    scaleX: 1,
    scaleY: 1,
    opacity: 0.95,
  };
  surface.elements.push(image);
  const saved = await projects.update(guest, created.id, {
    expectedRevision: 1,
    design,
  });

  const artifact = await production.generate(guest, created.id, "pdf", saved.revision);
  assert.equal(artifact.preflightReport.passed, true);
  assert.match(artifact.downloadUrl, /\/api\/v1\/production-artifacts\/.+\/content$/);

  const storedAsset = (await projectsRepository.listAssets(created.id, guest))
    .find((candidate) => candidate.id === asset.id);
  assert.ok(storedAsset);
  const tampered = await sharp({
    create: {
      width: 256,
      height: 256,
      channels: 4,
      background: { r: 220, g: 30, b: 20, alpha: 1 },
    },
  }).png().toBuffer();
  await objectStore.put(storedAsset.storageKey, tampered, "image/png");

  const next = await projects.update(guest, created.id, {
    expectedRevision: saved.revision,
    design: addText(saved.design, "changed", "Changed after artifact"),
  });
  const failed = await production.preflight(guest, created.id, next.revision);
  assert.equal(failed.report.passed, false);
  assert.ok(
    failed.report.issues.some((issue) => issue.code === "PRODUCTION_ASSET_INTEGRITY_FAILED"),
  );
  await assert.rejects(
    () => production.generate(guest, created.id, "pdf", next.revision),
    (error) =>
      error instanceof ProductionPreflightError &&
      error.details?.report !== undefined,
  );
});

test("visual embroidery treatment cannot be mislabeled as production output", async (t) => {
  const { projects, production } = await fixture(t);
  const created = await projects.create(guest, "tshirt", "Embroidery preview only");
  const png = await sharp({
    create: {
      width: 256,
      height: 256,
      channels: 4,
      background: { r: 40, g: 80, b: 180, alpha: 1 },
    },
  }).png().toBuffer();
  const asset = await projects.uploadArtwork(guest, created.id, "mark.png", png);
  const design = structuredClone(created.design);
  design.surfaces["front-chest"].elements.push({
    id: "embroidered-mark",
    type: "image",
    assetId: asset.id,
    x: 100,
    y: 100,
    width: 50,
    height: 50,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
    opacity: 1,
    treatment: { mode: "embroidery", settings: { ...DEFAULT_EMBROIDERY } },
  });
  const saved = await projects.update(guest, created.id, {
    expectedRevision: 1,
    design,
  });

  const preflight = await production.preflight(guest, created.id, saved.revision);
  assert.equal(preflight.report.passed, false);
  assert.ok(
    preflight.report.issues.some(
      (issue) => issue.code === "EMBROIDERY_PRODUCTION_UNSUPPORTED" && issue.severity === "error",
    ),
  );
  await assert.rejects(
    () => production.generate(guest, created.id, "pdf", saved.revision),
    ProductionPreflightError,
  );
});

test("concurrent generation creates one owner-scoped artifact for a revision", async (t) => {
  const fakeExporter: ProductionExporter = {
    kind: "pdf",
    mimeType: "application/pdf",
    async export({ job }) {
      return {
        bytes: new TextEncoder().encode(`%PDF-1.6\n${job.product.id}\n%%EOF`),
        filename: "fixture.pdf",
      };
    },
  };
  const { projects, production, artifactsRepository } = await fixture(t, fakeExporter);
  const project = await projects.create(guest, "bottle-001", "Concurrent artifact");

  const [first, second] = await Promise.all([
    production.generate(guest, project.id),
    production.generate(guest, project.id),
  ]);
  assert.equal(first.id, second.id);
  assert.equal((await artifactsRepository.list(project.id, guest)).length, 1);
});
