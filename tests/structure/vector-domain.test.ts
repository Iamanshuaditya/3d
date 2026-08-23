import assert from "node:assert/strict";
import { test } from "node:test";
import {
  IDENTITY_AFFINE_MATRIX,
  InvalidCanonicalDielineError,
  assertCanonicalDieline,
  createStructuralTolerances,
  isStructuralOperation,
  validateCanonicalDieline,
  type CanonicalDieline,
  type StructuralOperation,
} from "@/lib/structure";

function canonicalSquare(): CanonicalDieline {
  const provenance = {
    sourceId: "source-1",
    format: "svg" as const,
    entityId: "path-17",
    layerName: "CUT",
    sourceUnits: "mm" as const,
    sourceTransform: { ...IDENTITY_AFFINE_MATRIX },
    metadata: { stroke: "#000000", sourceIndex: 17 },
  };
  return {
    schemaVersion: 2,
    id: "fixture",
    units: "mm",
    coordinateSystem: "x-right-y-down",
    widthMm: 100,
    heightMm: 80,
    source: {
      id: "source-1",
      format: "svg",
      sourceUnits: "mm",
      name: "fixture.svg",
      sha256: "a".repeat(64),
    },
    tolerances: createStructuralTolerances(),
    entities: [
      {
        id: "cut-1",
        operation: "cut",
        provenance,
        classification: { method: "layer-map", sourceValue: "CUT", confidence: 1 },
        path: {
          id: "cut-path-1",
          closed: true,
          transform: { ...IDENTITY_AFFINE_MATRIX },
          provenance,
          segments: [
            { kind: "line", start: { x: 0, y: 0 }, end: { x: 100, y: 0 } },
            { kind: "line", start: { x: 100, y: 0 }, end: { x: 100, y: 80 } },
            { kind: "line", start: { x: 100, y: 80 }, end: { x: 0, y: 80 } },
            { kind: "line", start: { x: 0, y: 80 }, end: { x: 0, y: 0 } },
          ],
        },
      },
    ],
  };
}

test("canonical vector domain normalizes geometry to millimetres and retains provenance", () => {
  const dieline = canonicalSquare();
  assert.deepEqual(validateCanonicalDieline(dieline), []);
  assert.doesNotThrow(() => assertCanonicalDieline(dieline));
  assert.equal(dieline.units, "mm");
  assert.equal(dieline.coordinateSystem, "x-right-y-down");
  assert.equal(dieline.entities[0].path.provenance.layerName, "CUT");
  assert.deepEqual(dieline.entities[0].path.provenance.sourceTransform, IDENTITY_AFFINE_MATRIX);
});

test("known, finishing, and explicitly namespaced custom operations stay typed", () => {
  for (const operation of [
    "cut",
    "crease",
    "perforation",
    "score",
    "half-cut",
    "window-cut",
    "bleed",
    "safe",
    "glue",
    "varnish",
    "foil",
    "emboss",
    "white-ink",
    "custom:kiss-cut",
  ]) {
    assert.equal(isStructuralOperation(operation), true, operation);
  }
  assert.equal(isStructuralOperation("red"), false);
  assert.equal(isStructuralOperation("custom:"), false);
  assert.equal(isStructuralOperation("custom:bad operation"), false);
});

test("physical tolerances have stringent defaults and reject inconsistent overrides", () => {
  const tolerances = createStructuralTolerances();
  assert.equal(tolerances.topologySnapMm, 0.01);
  assert.equal(tolerances.curveFlatteningMm, 0.05);
  assert.equal(tolerances.boundaryComparisonMm, 0.05);
  assert.equal(tolerances.metricSampleSpacingMm, 0.05);
  assert.throws(
    () => createStructuralTolerances({ curveFlatteningMm: 0.1 }),
    /must not exceed boundaryComparisonMm/,
  );
  assert.throws(() => createStructuralTolerances({ topologySnapMm: 0 }), /finite positive/);
  assert.throws(() => createStructuralTolerances({ maxSubdivisionDepth: 1.5 }), /integer/);
});

test("validation reports transformed physical gaps, duplicate ids, and singular transforms", () => {
  const valid = canonicalSquare();
  const entity = valid.entities[0];
  const broken: CanonicalDieline = {
    ...valid,
    entities: [
      {
        ...entity,
        path: {
          ...entity.path,
          transform: { a: 10, b: 0, c: 0, d: 10, e: 0, f: 0 },
          segments: [
            { kind: "line", start: { x: 0, y: 0 }, end: { x: 1, y: 0 } },
            { kind: "line", start: { x: 1.002, y: 0 }, end: { x: 0, y: 0 } },
          ],
        },
      },
      {
        ...entity,
        operation: "not-a-semantic-operation" as StructuralOperation,
        path: {
          ...entity.path,
          id: "other-path",
          transform: { a: 0, b: 0, c: 0, d: 1, e: 0, f: 0 },
        },
      },
    ],
  };
  const codes = validateCanonicalDieline(broken).map((issue) => issue.code);
  assert.ok(codes.includes("path-gap"), "0.002 local gap scales to 0.02 mm");
  assert.ok(codes.includes("duplicate-entity-id"));
  assert.ok(codes.includes("singular-path-transform"));
  assert.ok(codes.includes("operation"));
  assert.throws(() => assertCanonicalDieline(broken), InvalidCanonicalDielineError);
});

test("inferred manufacturing semantics must expose confidence", () => {
  const valid = canonicalSquare();
  const entity = valid.entities[0];
  const uncertain: CanonicalDieline = {
    ...valid,
    entities: [{ ...entity, classification: { method: "inferred" } }],
  };
  assert.ok(
    validateCanonicalDieline(uncertain).some(
      (issue) => issue.code === "missing-inference-confidence",
    ),
  );
});

test("zero-length geometry and open window cuts cannot enter the canonical model", () => {
  const valid = canonicalSquare();
  const entity = valid.entities[0];
  const broken: CanonicalDieline = {
    ...valid,
    entities: [
      {
        ...entity,
        operation: "window-cut",
        path: {
          ...entity.path,
          closed: false,
          segments: [{ kind: "line", start: { x: 3, y: 4 }, end: { x: 3, y: 4 } }],
        },
      },
    ],
  };
  const codes = validateCanonicalDieline(broken).map((issue) => issue.code);
  assert.ok(codes.includes("open-window-cut"));
  assert.ok(codes.includes("zero-length-segment"));
});

test("arcs keep vector semantics and invalid sweeps fail honestly", () => {
  const valid = canonicalSquare();
  const entity = valid.entities[0];
  const withBadArc: CanonicalDieline = {
    ...valid,
    entities: [
      {
        ...entity,
        path: {
          ...entity.path,
          closed: false,
          segments: [
            {
              kind: "arc",
              center: { x: 10, y: 10 },
              radius: 4,
              startAngleRad: 0,
              sweepAngleRad: Math.PI * 3,
              provenance: {
                source: entity.provenance,
                sourceSegmentIndex: 2,
                sourceParameterRange: [0, 1],
              },
            },
          ],
        },
      },
    ],
  };
  const issue = validateCanonicalDieline(withBadArc).find(
    (candidate) => candidate.code === "invalid-segment",
  );
  assert.match(issue?.message ?? "", /complete revolution/);
  assert.equal(withBadArc.entities[0].path.segments[0].kind, "arc");
});
