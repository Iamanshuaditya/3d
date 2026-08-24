import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeManufacturingGeometry } from "@/lib/print/manufacturing-geometry";
import {
  DEFAULT_STRUCTURAL_TOLERANCES,
  IDENTITY_AFFINE_MATRIX,
  buildPlanarGraph,
  extractStructuralPanels,
  type CanonicalDieline,
  type StructuralEntity,
  type StructuralOperation,
  type Vec2,
} from "@/lib/structure";
import type { CartonSpec } from "@/types/carton";
import type { ProductConfig } from "@/types/configurator";
import type { NormalizedPrintJob } from "@/lib/print/types";

const SOURCE_SHA = "e".repeat(64);

function entity(
  id: string,
  operation: StructuralOperation,
  points: readonly Vec2[],
  closed: boolean,
): StructuralEntity {
  const provenance = {
    sourceId: "manufacturing-integration",
    format: "authored" as const,
    entityId: id,
    sourceUnits: "mm" as const,
  };
  return {
    id,
    operation,
    provenance,
    classification: { method: "authored", confidence: 1 },
    path: {
      id: `${id}-path`,
      closed,
      transform: IDENTITY_AFFINE_MATRIX,
      provenance,
      segments: Array.from({ length: points.length - 1 + (closed ? 1 : 0) }, (_, index) => ({
        kind: "line" as const,
        start: points[index],
        end: points[(index + 1) % points.length],
      })),
    },
  };
}

function canonical(): CanonicalDieline {
  return {
    schemaVersion: 2,
    id: "manufacturing-canonical",
    units: "mm",
    coordinateSystem: "x-right-y-down",
    widthMm: 100,
    heightMm: 50,
    source: {
      id: "manufacturing-integration",
      format: "authored",
      sourceUnits: "mm",
      sha256: SOURCE_SHA,
    },
    tolerances: DEFAULT_STRUCTURAL_TOLERANCES,
    entities: [
      entity(
        "outer",
        "cut",
        [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
          { x: 100, y: 50 },
          { x: 0, y: 50 },
        ],
        true,
      ),
      entity("crease", "crease", [{ x: 50, y: 0 }, { x: 50, y: 50 }], false),
      entity(
        "window",
        "window-cut",
        [
          { x: 10, y: 10 },
          { x: 20, y: 10 },
          { x: 20, y: 20 },
          { x: 10, y: 20 },
        ],
        true,
      ),
      entity(
        "bleed",
        "bleed",
        [
          { x: 1, y: 1 },
          { x: 99, y: 1 },
          { x: 99, y: 49 },
          { x: 1, y: 49 },
        ],
        true,
      ),
    ],
  };
}

function product(): ProductConfig {
  const dieline = canonical();
  const panels = [...extractStructuralPanels(dieline, buildPlanarGraph(dieline))].sort(
    (a, b) => a.bounds.minX - b.bounds.minX,
  );
  const spec: CartonSpec = {
    id: "structural-manufacturing",
    name: "Structural manufacturing",
    width: 100,
    height: 50,
    boardThickness: 0.5,
    lidClosedAngle: 90,
    lidOpenAngle: 180,
    panels: [{ id: "legacy", rect: { x: 0, y: 0, w: 1, h: 1 } }],
    // Deliberately wrong legacy path. Manufacturing must ignore this when
    // canonical structural authority exists.
    dieline: {
      cuts: [{ points: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }], closed: true }],
      creases: [],
    },
    structural: {
      dieline,
      construction: {
        schemaVersion: 1,
        sourceLock: {
          canonicalSchemaVersion: 2,
          dielineId: dieline.id,
          sha256: SOURCE_SHA,
        },
        rootPanelId: panels[0].id,
        boardThicknessMm: 0.5,
        hinges: [
          {
            id: "center-fold",
            parentPanelId: panels[0].id,
            childPanelId: panels[1].id,
            source: [{ entityId: "crease", pathId: "crease-path" }],
            assembledAngleDeg: 90,
          },
        ],
      },
    },
  };

  return {
    id: "structural-manufacturing-product",
    name: "Structural manufacturing product",
    family: "folded-carton",
    modelUrl: "",
    cartonSpec: spec,
    editableSurfaces: [
      {
        id: "outside",
        label: "Outside",
        meshName: "unused",
        editorWidth: 1000,
        editorHeight: 500,
        physicalWidthCm: 10,
        physicalHeightCm: 5,
      },
    ],
    camera: {
      initial: [0, 1, 2],
      target: [0, 0, 0],
      minDistance: 1,
      maxDistance: 5,
      presets: [],
    },
  } as ProductConfig;
}

test("manufacturing geometry uses canonical structural authority and preserves provenance", () => {
  const config = product();
  const job = { product: config } as NormalizedPrintJob;
  const geometry = normalizeManufacturingGeometry(job);
  assert.equal(geometry.sourceSha256, SOURCE_SHA);
  assert.equal(geometry.sheets.length, 1);
  const sheet = geometry.sheets[0];
  assert.equal(sheet.widthMm, 100);
  assert.equal(sheet.heightMm, 50);

  const cuts = sheet.paths.filter((path) => path.operation === "cut");
  const creases = sheet.paths.filter((path) => path.operation === "crease");
  const bleed = sheet.paths.filter((path) => path.operation === "bleed");
  assert.equal(cuts.length, 2, "outer cut and real window must both reach manufacturing");
  assert.equal(creases.length, 1);
  assert.equal(bleed.length, 1);
  assert.deepEqual(creases[0].points, [
    { xMm: 50, yMm: 0 },
    { xMm: 50, yMm: 50 },
  ]);
  assert.equal(creases[0].sourceEntityId, "crease");
  assert.equal(creases[0].sourcePathId, "crease-path");
  assert.equal(cuts.some((path) => path.sourceEntityId === "window"), true);
  assert.equal(
    cuts.some((path) => path.points.some((point) => point.xMm === 1 && point.yMm === 1)),
    false,
    "stale legacy dieline must not leak into canonical manufacturing",
  );
});
