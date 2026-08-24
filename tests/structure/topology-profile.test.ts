import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DEFAULT_STRUCTURAL_TOLERANCES,
  IDENTITY_AFFINE_MATRIX,
  buildPlanarGraph,
  buildProfiledPlanarGraph,
  extractStructuralPanels,
  type CanonicalDieline,
  type StructuralEntity,
  type StructuralOperation,
  type Vec2,
} from "@/lib/structure";

const SOURCE_SHA = "a".repeat(64);

function entity(
  id: string,
  operation: StructuralOperation,
  points: readonly Vec2[],
  closed: boolean,
): StructuralEntity {
  const provenance = {
    sourceId: "topology-profile-fixture",
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

function fixture(): CanonicalDieline {
  return {
    schemaVersion: 2,
    id: "topology-profile-fixture",
    units: "mm",
    coordinateSystem: "x-right-y-down",
    widthMm: 100,
    heightMm: 50,
    source: {
      id: "topology-profile-fixture",
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
      // Deliberately 0.015 mm short of the top cut: too large for the global
      // 0.01 mm endpoint snap, but inside this fixture's explicit 0.02 mm
      // endpoint-to-span profile.
      entity("near-crease", "crease", [{ x: 50, y: 0.015 }, { x: 50, y: 50 }], false),
    ],
  };
}

test("reviewed endpoint-to-span profile splits panels without mutating canonical vectors", () => {
  const source = fixture();
  const unprofiled = extractStructuralPanels(source, buildPlanarGraph(source));
  assert.equal(unprofiled.length, 1);

  const profiled = buildProfiledPlanarGraph(source, {
    id: "fixture-0.02mm",
    sourceSha256: SOURCE_SHA,
    endpointToSpanSnapMm: 0.02,
    expectedRepairCount: 1,
  });
  assert.equal(profiled.repairs.length, 1);
  assert.ok(Math.abs(profiled.repairs[0].distanceMm - 0.015) < 1e-9);
  assert.deepEqual(profiled.repairs[0].from, { x: 50, y: 0.015 });
  assert.deepEqual(profiled.repairs[0].to, { x: 50, y: 0 });
  assert.equal(extractStructuralPanels(source, profiled.graph).length, 2);

  const originalCrease = source.entities.find((candidate) => candidate.id === "near-crease")!;
  const originalStart = originalCrease.path.segments[0];
  assert.equal(originalStart.kind, "line");
  if (originalStart.kind === "line") assert.deepEqual(originalStart.start, { x: 50, y: 0.015 });
});

test("profile refuses the wrong source hash and unexpected repair counts", () => {
  const source = fixture();
  assert.throws(
    () =>
      buildProfiledPlanarGraph(source, {
        id: "wrong-source",
        sourceSha256: "b".repeat(64),
        endpointToSpanSnapMm: 0.02,
      }),
    /does not match the canonical source SHA-256/,
  );
  assert.throws(
    () =>
      buildProfiledPlanarGraph(source, {
        id: "wrong-count",
        sourceSha256: SOURCE_SHA,
        endpointToSpanSnapMm: 0.02,
        expectedRepairCount: 2,
      }),
    /expected 2 endpoint-to-span repairs; found 1/,
  );
});
