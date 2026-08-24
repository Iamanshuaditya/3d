import assert from "node:assert/strict";
import { test } from "node:test";
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
import { cartonCanFlatten, cartonHinges } from "@/lib/configurator/carton-topology";
import {
  resolveStructuralCarton,
  structuralCartonOverlay,
} from "@/lib/configurator/structural-carton";
import { resolveSurfaceDieline } from "@/lib/configurator/resolve-dieline";
import type { CartonSpec } from "@/types/carton";
import type { ProductConfig } from "@/types/configurator";

const SOURCE_SHA = "d".repeat(64);

function entity(
  id: string,
  operation: StructuralOperation,
  points: readonly Vec2[],
  closed: boolean,
): StructuralEntity {
  const provenance = {
    sourceId: "integration-fixture",
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

function dieline(): CanonicalDieline {
  return {
    schemaVersion: 2,
    id: "structural-carton-integration",
    units: "mm",
    coordinateSystem: "x-right-y-down",
    widthMm: 100,
    heightMm: 50,
    source: {
      id: "integration-fixture",
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
    ],
  };
}

function spec(): CartonSpec {
  const canonical = dieline();
  const panels = [...extractStructuralPanels(canonical, buildPlanarGraph(canonical))].sort(
    (left, right) => left.bounds.minX - right.bounds.minX,
  );
  return {
    id: "structural-carton",
    name: "Structural carton",
    width: 100,
    height: 50,
    boardThickness: 0.5,
    // Deliberately meaningless legacy geometry: exact structural authority must
    // win everywhere tested below.
    panels: [{ id: "legacy", rect: { x: 0, y: 0, w: 1, h: 1 } }],
    lidClosedAngle: 90,
    lidOpenAngle: 180,
    structural: {
      dieline: canonical,
      construction: {
        schemaVersion: 1,
        sourceLock: {
          canonicalSchemaVersion: 2,
          dielineId: canonical.id,
          sha256: SOURCE_SHA,
        },
        rootPanelId: panels[0].id,
        boardThicknessMm: 0.5,
        hinges: [
          {
            id: "exact-center-fold",
            parentPanelId: panels[0].id,
            childPanelId: panels[1].id,
            source: [{ entityId: "crease", pathId: "crease-path" }],
            assembledAngleDeg: 90,
          },
        ],
      },
    },
  };
}

test("canonical structural authority drives carton articulation instead of legacy rectangles", () => {
  const carton = spec();
  const resolved = resolveStructuralCarton(carton)!;
  assert.equal(resolved.panels.length, 2);
  assert.equal(cartonCanFlatten(carton), true);
  const hinges = cartonHinges(carton);
  assert.equal(hinges.length, 1);
  assert.equal(hinges[0].id, "exact-center-fold");
  assert.equal(hinges[0].flatAngleDeg, 0);
});

test("canonical structural overlay preserves cut/window/crease geometry in editor coordinates", () => {
  const overlay = structuralCartonOverlay(spec(), 200, 100)!;
  assert.equal(overlay.cuts.length, 2);
  assert.equal(overlay.creases.length, 1);
  assert.deepEqual(overlay.creases[0].points, [100, 0, 100, 100]);
  assert.equal(overlay.cuts.filter((path) => path.closed).length, 2);
});

test("surface resolver gives canonical structural authority precedence over stale surface overlays", () => {
  const carton = spec();
  const product: ProductConfig = {
    id: "exact-product",
    name: "Exact product",
    family: "folded-carton",
    modelUrl: "",
    cartonSpec: carton,
    editableSurfaces: [
      {
        id: "outside",
        label: "Outside",
        meshName: "unused",
        editorWidth: 200,
        editorHeight: 100,
        physicalWidthCm: 10,
        physicalHeightCm: 5,
        dieline: { cuts: [], creases: [] },
      },
    ],
    camera: {
      initial: [0, 1, 2],
      target: [0, 0, 0],
      minDistance: 1,
      maxDistance: 5,
      presets: [],
    },
  };
  const overlay = resolveSurfaceDieline(product, product.editableSurfaces[0]);
  assert.equal(overlay.cuts.length, 2);
  assert.deepEqual(overlay.creases[0].points, [100, 0, 100, 100]);
});

test("structural carton refuses legacy dimensions that disagree with canonical authority", () => {
  const carton = { ...spec(), width: 99 };
  assert.throws(() => resolveStructuralCarton(carton), /disagree with canonical structural bounds/);
});
