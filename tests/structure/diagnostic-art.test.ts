import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DEFAULT_STRUCTURAL_TOLERANCES,
  IDENTITY_AFFINE_MATRIX,
  buildPlanarGraph,
  createStructuralDiagnosticArtwork,
  extractStructuralPanels,
  type CanonicalDieline,
  type StructuralEntity,
  type StructuralOperation,
  type Vec2,
} from "@/lib/structure";

function entity(
  id: string,
  operation: StructuralOperation,
  points: readonly Vec2[],
  closed: boolean,
): StructuralEntity {
  const provenance = {
    sourceId: "diagnostic-fixture",
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
    id: "diagnostic<&fixture",
    units: "mm",
    coordinateSystem: "x-right-y-down",
    widthMm: 100,
    heightMm: 50,
    source: {
      id: "diagnostic-fixture",
      format: "authored",
      sourceUnits: "mm",
      sha256: "abc<&123",
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
    ],
  };
}

test("diagnostic artwork is deterministic, asymmetric, source-locked, and panel-labelled", () => {
  const dieline = fixture();
  const panels = extractStructuralPanels(dieline, buildPlanarGraph(dieline));
  const first = createStructuralDiagnosticArtwork(dieline, panels);
  const second = createStructuralDiagnosticArtwork(dieline, panels);

  assert.equal(first, second);
  assert.match(first, /width="100mm" height="50mm" viewBox="0 0 100 50"/);
  assert.match(first, /data-dieline-id="diagnostic&lt;&amp;fixture"/);
  assert.match(first, /data-source-sha256="abc&lt;&amp;123"/);
  assert.match(first, /TOP \/ NORTH/);
  assert.match(first, /BOTTOM \/ SOUTH/);
  assert.match(first, /LEFT \/ WEST/);
  assert.match(first, /RIGHT \/ EAST/);
  assert.match(first, /TL CIRCLE/);
  assert.match(first, /TR SQUARE/);
  assert.match(first, /BL TRIANGLE/);
  assert.match(first, /BR X/);
  assert.match(first, /SHEET X RIGHT \/ Y DOWN/);
  assert.match(first, /stroke="#dc2626"/);
  assert.match(first, /stroke="#2563eb"/);

  for (const [index, panel] of panels.entries()) {
    assert.match(first, new RegExp(`diagnostic-panel-${index + 1}`));
    assert.match(first, new RegExp(`data-panel-id="${panel.id}"`));
    assert.match(first, new RegExp(`>P${index + 1}<`));
  }
});

test("diagnostic artwork never emits manufacturing cut or crease authority", () => {
  const dieline = fixture();
  const panels = extractStructuralPanels(dieline, buildPlanarGraph(dieline));
  const svg = createStructuralDiagnosticArtwork(dieline, panels);

  assert.doesNotMatch(svg, /data-operation=/);
  assert.doesNotMatch(svg, /DieCutBlue|DieCutRed|window-cut|operation="cut"/);
});

test("diagnostic artwork fails closed for invalid sheet dimensions", () => {
  const dieline = fixture();
  const panels = extractStructuralPanels(dieline, buildPlanarGraph(dieline));
  assert.throws(
    () => createStructuralDiagnosticArtwork({ ...dieline, widthMm: 0 }, panels),
    /positive finite dieline dimensions/,
  );
  assert.throws(
    () => createStructuralDiagnosticArtwork({ ...dieline, heightMm: Number.NaN }, panels),
    /positive finite dieline dimensions/,
  );
});
