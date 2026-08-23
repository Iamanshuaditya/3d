import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import Database from "better-sqlite3";
import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFNumber,
  PDFRawStream,
} from "pdf-lib";
import sharp from "sharp";
import * as THREE from "three";
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
import { SvgProductionExporter } from "@/server/production/svg-production-exporter";
import { ProductionService } from "@/server/production/production-service";
import { SqliteProductionArtifactRepository } from "@/server/production/sqlite-production-artifact-repository";
import { FilesystemObjectStore } from "@/server/storage/filesystem-object-store";
import { resolveCartonSpec } from "@/lib/configurator/carton-spec";
import { applyHingeAngles, buildCartonTree } from "@/lib/configurator/carton-geometry";
import { createEmptyDocument } from "@/lib/configurator/design-state";
import { mailerBoxProduct } from "@/lib/configurator/product-config";
import { anglesAtStage, cartonUnfoldPlan } from "@/lib/configurator/unfold-plan";
import { normalizePrintJob } from "@/lib/print/normalize-job";
import {
  normalizeManufacturingGeometry,
  supportsManufacturingSvg,
} from "@/lib/print/manufacturing-geometry";

const guest: ProjectOwner = {
  type: "guest",
  id: "0e272686-d645-4af8-bf15-cbc85a6b60b1",
};
const otherGuest: ProjectOwner = {
  type: "guest",
  id: "8caf6d89-0522-4f90-a009-5ba19238a356",
};

async function fixture(
  t: TestContext,
  exporters: ProductionExporter[] = [
    new PdfProductionExporter(),
    new SvgProductionExporter(),
  ],
) {
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
    exporters,
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
    catalog,
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
  assert.ok(Math.abs((box.height * 25.4) / 72 - 552) < 0.01);

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
    supports: () => true,
    async export({ job }) {
      return {
        bytes: new TextEncoder().encode(`%PDF-1.6\n${job.product.id}\n%%EOF`),
        filename: "fixture.pdf",
      };
    },
  };
  const { projects, production, artifactsRepository } = await fixture(t, [fakeExporter]);
  const project = await projects.create(guest, "bottle-001", "Concurrent artifact");

  const [first, second] = await Promise.all([
    production.generate(guest, project.id),
    production.generate(guest, project.id),
  ]);
  assert.equal(first.id, second.id);
  assert.equal((await artifactsRepository.list(project.id, guest)).length, 1);
});

test("one parameterized mailer structure drives rulers, 3D unfolding, PDF, and SVG", async (t) => {
  const { projects, production, catalog } = await fixture(t);
  const optionSelection = {
    length: 200,
    width: 150,
    depth: 70,
    board_thickness: 1.5,
  };
  const project = await projects.create(
    guest,
    "mailer-box-001",
    "Parameterized mailer",
    undefined,
    optionSelection,
  );
  assert.equal(project.productVersionId, "mailer-box-001@3");
  const resolved = await catalog.resolve(
    project.productId,
    project.productVersionId,
    project.optionSelection,
  );
  const config = resolved.productConfig;
  const spec = resolveCartonSpec(config);
  assert.ok(spec);
  assert.equal(spec.width, 356);
  assert.equal(spec.height, 568);
  assert.equal(spec.boardThickness, 1.5);
  assert.deepEqual(
    spec.panels.find((candidate) => candidate.id === "BASE")?.rect,
    { x: 78, y: 277, w: 200, h: 150 },
  );

  const surface = config.editableSurfaces[0];
  assert.equal(surface.physicalWidthCm * 10, spec.width);
  assert.equal(surface.physicalHeightCm * 10, spec.height);
  assert.equal(surface.editorWidth, spec.width * 3);
  assert.equal(surface.editorHeight, spec.height * 3);
  const manufacturing = normalizeManufacturingGeometry(
    normalizePrintJob(config, project.design),
  );
  assert.equal(manufacturing.sheets[0].widthMm, spec.width);
  assert.equal(manufacturing.sheets[0].heightMm, spec.height);
  assert.equal(
    manufacturing.sheets[0].paths.filter((path) => path.operation === "cut").length,
    spec.dieline?.cuts.length,
  );
  assert.equal(
    manufacturing.sheets[0].paths.filter((path) => path.operation === "crease").length,
    spec.dieline?.creases.length,
  );

  const plan = cartonUnfoldPlan(spec);
  assert.ok(plan?.reachesFlat);
  const material = new THREE.MeshBasicMaterial();
  const tree = buildCartonTree(spec, material, material, material);
  applyHingeAngles(tree, anglesAtStage(plan, plan.steps.length));
  tree.root.updateMatrixWorld(true);
  for (const mesh of Object.values(tree.meshes)) {
    const world = mesh.getWorldPosition(new THREE.Vector3());
    assert.ok(Math.abs(world.y) < 1e-3, `${mesh.name} did not reach the flat structure`);
  }
  tree.dispose();
  material.dispose();

  const pdfArtifact = await production.generate(guest, project.id, "pdf");
  const pdfObject = await production.read(guest, pdfArtifact.id);
  const pdf = await PDFDocument.load(pdfObject.object.bytes);
  const media = pdf.getPage(0).getMediaBox();
  assert.ok(Math.abs((media.width * 25.4) / 72 - spec.width) < 0.01);
  assert.ok(Math.abs((media.height * 25.4) / 72 - spec.height) < 0.01);

  const svgArtifact = await production.generate(guest, project.id, "svg");
  assert.equal(svgArtifact.mimeType, "image/svg+xml");
  assert.equal(svgArtifact.projectRevision, pdfArtifact.projectRevision);
  const svgObject = await production.read(guest, svgArtifact.id);
  const svg = Buffer.from(svgObject.object.bytes).toString("utf8");
  assert.match(svg, /width="356mm" height="568mm" viewBox="0 0 356 568"/);
  assert.match(svg, /<g id="cut" data-operation="cut"/);
  assert.match(svg, /<g id="crease" data-operation="crease"/);
  assert.match(svg, /<g id="bleed" data-operation="bleed"/);
  assert.match(svg, /&quot;productVersionId&quot;:&quot;mailer-box-001@3&quot;/);
  assert.notEqual(svgArtifact.sha256, pdfArtifact.sha256);
  assert.equal((await production.list(guest, project.id)).length, 2);
});

test("manufacturing SVG fails closed for the historical Mailer surface/spec drift", () => {
  const spec = resolveCartonSpec(mailerBoxProduct);
  assert.ok(spec);
  assert.equal(spec.height, 552);
  assert.equal(mailerBoxProduct.editableSurfaces[0].physicalHeightCm * 10, 554);
  assert.equal(supportsManufacturingSvg(mailerBoxProduct), false);
  assert.throws(
    () => normalizeManufacturingGeometry(
      normalizePrintJob(mailerBoxProduct, createEmptyDocument(mailerBoxProduct)),
    ),
    /does not match structural blank 376×552 mm/,
  );
});

test("later schemas preserve immutable PDFs while adding one SVG per revision", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "vortex-v6-migration-test-"));
  const filename = join(directory, "vortex.sqlite");
  const oldDatabase = new Database(filename);
  oldDatabase.exec(`
    CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
    INSERT INTO schema_migrations VALUES (5, '2026-08-23T00:00:00.000Z');

    CREATE TABLE project_revisions (
      project_id TEXT NOT NULL,
      revision INTEGER NOT NULL,
      design_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (project_id, revision)
    );
    INSERT INTO project_revisions VALUES ('project-1', 1, '{}', '2026-08-23T00:00:00.000Z');
    INSERT INTO project_revisions VALUES ('project-1', 2, '{}', '2026-08-23T00:00:01.000Z');

    CREATE TABLE production_artifacts (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      project_revision INTEGER NOT NULL,
      product_version_id TEXT NOT NULL,
      configuration_id TEXT NOT NULL,
      kind TEXT NOT NULL CHECK (kind IN ('pdf')),
      mime_type TEXT NOT NULL CHECK (mime_type IN ('application/pdf')),
      filename TEXT NOT NULL,
      byte_size INTEGER NOT NULL,
      sha256 TEXT NOT NULL,
      storage_key TEXT NOT NULL UNIQUE,
      preflight_report_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(project_id, project_revision, kind)
    );
    INSERT INTO production_artifacts VALUES (
      'pdf-1', 'project-1', 1, 'mailer-box-001@2', 'mailer-box-001@2|',
      'pdf', 'application/pdf', 'legacy.pdf', 4,
      '${"a".repeat(64)}', 'production/project-1/pdf-1.pdf', '{}',
      '2026-08-23T00:00:01.000Z'
    );
  `);
  oldDatabase.close();

  const database = openVortexDatabase(filename);
  t.after(async () => {
    database.close();
    await rm(directory, { recursive: true, force: true });
  });
  const preserved = database.prepare(
    "SELECT kind, mime_type, sha256 FROM production_artifacts WHERE id = 'pdf-1'",
  ).get() as { kind: string; mime_type: string; sha256: string };
  assert.deepEqual(preserved, {
    kind: "pdf",
    mime_type: "application/pdf",
    sha256: "a".repeat(64),
  });
  assert.equal(
    (database.prepare("SELECT MAX(version) AS version FROM schema_migrations").get() as {
      version: number;
    }).version,
    7,
  );
  assert.doesNotThrow(() => database.prepare(`
    INSERT INTO production_artifacts VALUES (
      'svg-1', 'project-1', 1, 'mailer-box-001@2', 'mailer-box-001@2|',
      'svg', 'image/svg+xml', 'legacy.svg', 4, ?,
      'production/project-1/svg-1.svg', '{}', '2026-08-23T00:00:02.000Z'
    )
  `).run("b".repeat(64)));
  assert.throws(
    () => database.prepare(`
      INSERT INTO production_artifacts VALUES (
        'bad-svg', 'project-1', 2, 'mailer-box-001@2', 'mailer-box-001@2|',
        'svg', 'application/pdf', 'bad.svg', 4, ?,
        'production/project-1/bad.svg', '{}', '2026-08-23T00:00:03.000Z'
      )
    `).run("c".repeat(64)),
    /CHECK constraint failed/,
  );
});
