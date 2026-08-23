import assert from "node:assert/strict";
import { test } from "node:test";
import {
  applyAffine,
  evaluateVectorSegment,
  importStructuralDxf,
  segmentEnd,
  segmentStart,
} from "@/lib/structure";

function dxfDocument(
  entities: string,
  { insUnits = 4, layers = ["CUT", "CREASE", "WINDOW"] }: {
    insUnits?: number;
    layers?: readonly string[];
  } = {},
): string {
  const layerRecords = layers.map((layer) => `0
LAYER
2
${layer}
70
0
62
7
6
CONTINUOUS`).join("\n");
  const raw = `0
SECTION
2
HEADER
9
$INSUNITS
70
${insUnits}
0
ENDSEC
0
SECTION
2
TABLES
0
TABLE
2
LAYER
70
${layers.length}
${layerRecords}
0
ENDTAB
0
ENDSEC
0
SECTION
2
ENTITIES
${entities}
0
ENDSEC
0
EOF
`;
  return `${raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).join("\n")}\n`;
}

function line(
  handle: string,
  layer: string,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  extra = "",
): string {
  return `0
LINE
5
${handle}
8
${layer}
${extra}10
${x1}
20
${y1}
30
0
11
${x2}
21
${y2}
31
0
`;
}

function near(actual: number, expected: number, tolerance = 1e-9): void {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `expected ${actual} to be within ${tolerance} of ${expected}`,
  );
}

test("DXF import uses physical units, configurable layers, y-up conversion, and provenance", () => {
  const source = dxfDocument([
    line("A1", "cut", 10, 20, 30, 40),
    line("A2", "CREASE", 10, 40, 10, 20),
  ].join(""));
  const { dieline, issues } = importStructuralDxf(source, {
    id: "basic-dxf",
    sourceSha256: "b".repeat(64),
    operationMapping: { layers: { CUT: "cut", crease: "crease" } },
  });

  assert.deepEqual(issues, []);
  assert.equal(dieline.source.sourceUnits, "mm");
  assert.equal(dieline.widthMm, 20);
  assert.equal(dieline.heightMm, 20);
  assert.deepEqual(dieline.entities.map(({ operation }) => operation), ["cut", "crease"]);
  const cut = dieline.entities[0];
  assert.equal(cut.provenance.entityId, "A1");
  assert.equal(cut.provenance.layerName, "cut");
  assert.equal(cut.classification.method, "layer-map");
  assert.deepEqual(cut.provenance.sourceTransform, {
    a: 1, b: 0, c: 0, d: 1, e: 0, f: 0,
  });
  assert.deepEqual(segmentStart(cut.path.segments[0]), { x: 10, y: 20 });
  assert.deepEqual(applyAffine(cut.path.transform, segmentStart(cut.path.segments[0])), {
    x: 0,
    y: 20,
  });
  assert.deepEqual(applyAffine(cut.path.transform, segmentEnd(cut.path.segments[0])), {
    x: 20,
    y: 0,
  });
  assert.equal(cut.path.segments[0].provenance?.source.entityId, "A1");
  assert.equal(cut.path.segments[0].provenance?.sourceSegmentIndex, 0);
  assert.equal(importStructuralDxf(`${source}\n\n`, {
    id: "trailing-lines",
    operationMapping: { layers: { CUT: "cut", CREASE: "crease" } },
  }).dieline.entities.length, 2);
  assert.throws(
    () => importStructuralDxf(source, {
      id: "conflicting-map",
      operationMapping: { layers: { CUT: "cut", cut: "crease" } },
    }),
    /conflicting case-insensitive rules/,
  );
});

test("LWPOLYLINE retains exact bulge arcs and closed topology", () => {
  const source = dxfDocument(`0
LWPOLYLINE
5
B1
8
CUT
90
4
70
1
10
10
20
0
42
0.41421356237309503
10
0
20
10
10
0
20
20
10
20
20
20
`);
  const { dieline } = importStructuralDxf(source, {
    id: "bulge-dxf",
    operationMapping: { layers: { CUT: "cut" } },
  });
  const path = dieline.entities[0].path;
  assert.equal(path.closed, true);
  assert.deepEqual(path.segments.map(({ kind }) => kind), ["arc", "line", "line", "line"]);
  const arc = path.segments[0];
  assert.equal(arc.kind, "arc");
  near(arc.sweepAngleRad, Math.PI / 2);
  near(evaluateVectorSegment(arc, 0).x, 10);
  near(evaluateVectorSegment(arc, 0).y, 0);
  near(evaluateVectorSegment(arc, 1).x, 0);
  near(evaluateVectorSegment(arc, 1).y, 10);

  const tinyBulge = dxfDocument(`0
LWPOLYLINE
5
TINY
8
CUT
90
4
70
1
10
0
20
0
42
5e-15
10
40000000000000
20
0
10
40000000000000
20
10
10
0
20
10
`);
  assert.throws(
    () => importStructuralDxf(tinyBulge, {
      id: "tiny-nonzero-bulge",
      operationMapping: { layers: { CUT: "cut" } },
    }),
    /nonzero polyline bulge is numerically unrepresentable/,
  );
  assert.throws(
    () => importStructuralDxf(source.replace("70\n1\n10", "70\n1\n39\n2\n10"), {
      id: "nonzero-lwpolyline-thickness",
      operationMapping: { layers: { CUT: "cut" } },
    }),
    /unsupported non-zero thickness/,
  );
  assert.throws(
    () => importStructuralDxf(source.replace("42\n0.41421356237309503", "40\n2\n42\n0.41421356237309503"), {
      id: "nonzero-lwpolyline-width",
      operationMapping: { layers: { CUT: "cut" } },
    }),
    /unsupported non-zero width geometry/,
  );
  for (const declared of [3, 5]) {
    assert.throws(
      () => importStructuralDxf(source.replace("90\n4", `90\n${declared}`), {
        id: `lwpolyline-count-${declared}`,
        operationMapping: { layers: { CUT: "cut" } },
      }),
      new RegExp(`declares ${declared} vertices but contains 4`),
    );
  }
});

test("legacy POLYLINE vertices retain closure and bulge semantics", () => {
  const source = dxfDocument(`0
POLYLINE
5
B2
8
CUT
66
1
70
1
0
VERTEX
8
CUT
10
10
20
0
30
0
42
0.41421356237309503
0
VERTEX
8
CUT
10
0
20
10
30
0
0
VERTEX
8
CUT
10
0
20
20
30
0
0
VERTEX
8
CUT
10
20
20
20
30
0
0
SEQEND
`);
  const { dieline } = importStructuralDxf(source, {
    id: "legacy-polyline",
    operationMapping: { layers: { CUT: "cut" } },
  });
  const path = dieline.entities[0].path;
  assert.equal(path.closed, true);
  assert.deepEqual(path.segments.map(({ kind }) => kind), ["arc", "line", "line", "line"]);
  assert.throws(
    () => importStructuralDxf(source.replace("70\n1\n0\nVERTEX", "70\n1\n30\n2\n0\nVERTEX"), {
      id: "legacy-polyline-elevation",
      operationMapping: { layers: { CUT: "cut" } },
    }),
    /unsupported non-zero header elevation/,
  );
  assert.throws(
    () => importStructuralDxf(source.replace("70\n1\n0\nVERTEX", "70\n1\n40\n2\n0\nVERTEX"), {
      id: "legacy-polyline-width",
      operationMapping: { layers: { CUT: "cut" } },
    }),
    /unsupported non-zero default width/,
  );
  assert.throws(
    () => importStructuralDxf(source.replace("8\nCUT\n10\n10", "8\nCUT\n70\n1\n10\n10"), {
      id: "legacy-special-vertex",
      operationMapping: { layers: { CUT: "cut" } },
    }),
    /unsupported special flags|contains curve-fit, spline, 3D, mesh, or polyface VERTEX semantics/,
  );

  const missingSequenceEnd = dxfDocument(`0
POLYLINE
5
BROKEN
8
CUT
66
1
70
1
0
VERTEX
8
CUT
10
0
20
0
30
0
`);
  assert.throws(
    () => importStructuralDxf(missingSequenceEnd, {
      id: "missing-seqend",
      operationMapping: { layers: { CUT: "cut" } },
    }),
    /POLYLINE sequence is missing SEQEND/,
  );

  const unexpectedNested = missingSequenceEnd.replace(
    "\n0\nENDSEC\n0\nEOF\n",
    "\n0\nLINE\n8\nCUT\n10\n0\n20\n0\n11\n1\n21\n1\n0\nENDSEC\n0\nEOF\n",
  );
  assert.throws(
    () => importStructuralDxf(unexpectedNested, {
      id: "unexpected-polyline-nesting",
      operationMapping: { layers: { CUT: "cut" } },
    }),
    /contains unexpected nested LINE/,
  );
});

test("ARC, CIRCLE, and ELLIPSE remain semantic curves rather than sampled polylines", () => {
  const source = dxfDocument(`0
ARC
5
C1
8
CREASE
10
0
20
0
30
0
40
10
50
350
51
10
0
CIRCLE
5
C2
8
WINDOW
10
30
20
20
30
0
40
5
0
ELLIPSE
5
C3
8
CUT
10
60
20
20
30
0
11
10
21
0
31
0
40
0.5
41
0
42
6.283185307179586
`);
  const { dieline } = importStructuralDxf(source, {
    id: "curve-dxf",
    operationMapping: {
      layers: { CREASE: "crease", WINDOW: "window-cut", CUT: "cut" },
    },
  });
  assert.deepEqual(dieline.entities.map(({ path }) => path.segments[0].kind), [
    "arc",
    "arc",
    "elliptical-arc",
  ]);
  const arc = dieline.entities[0].path.segments[0];
  assert.equal(arc.kind, "arc");
  near(arc.sweepAngleRad, (20 * Math.PI) / 180);
  assert.equal(dieline.entities[1].path.closed, true);
  assert.equal(dieline.entities[2].path.closed, true);
  assert.throws(
    () => importStructuralDxf(source.replace("40\n0.5\n41", "40\n2\n41"), {
      id: "invalid-ellipse-ratio",
      operationMapping: {
        layers: { CREASE: "crease", WINDOW: "window-cut", CUT: "cut" },
      },
    }),
    /axis ratio must be in \(0, 1\]/,
  );
  assert.throws(
    () => importStructuralDxf(source.replace("50\n350\n51\n10", "50\n45\n51\n45"), {
      id: "zero-sweep-arc",
      operationMapping: {
        layers: { CREASE: "crease", WINDOW: "window-cut", CUT: "cut" },
      },
    }),
    /start and end parameters define a zero sweep/,
  );
  assert.throws(
    () => importStructuralDxf(source.replace("42\n6.283185307179586", "42\n100"), {
      id: "multi-turn-ellipse",
      operationMapping: {
        layers: { CREASE: "crease", WINDOW: "window-cut", CUT: "cut" },
      },
    }),
    /parameters must lie within one source revolution/,
  );
});

test("a single clamped DXF SPLINE span becomes an exact canonical Bezier", () => {
  const source = dxfDocument(`0
SPLINE
5
S1
8
CREASE
70
8
71
3
72
8
73
4
74
0
40
0
40
0
40
0
40
0
40
1
40
1
40
1
40
1
10
0
20
0
30
0
10
10
20
0
30
0
10
10
20
20
30
0
10
20
20
20
30
0
`);
  const { dieline } = importStructuralDxf(source, {
    id: "spline-dxf",
    operationMapping: { layers: { CREASE: "crease" } },
  });
  const segment = dieline.entities[0].path.segments[0];
  assert.equal(segment.kind, "cubic");
  assert.deepEqual(segmentStart(segment), { x: 0, y: 0 });
  assert.deepEqual(segmentEnd(segment), { x: 20, y: 20 });
  assert.throws(
    () => importStructuralDxf(source.replace("72\n8\n73\n4", "72\n999\n73\n999"), {
      id: "mismatched-spline-counts",
      operationMapping: { layers: { CREASE: "crease" } },
    }),
    /declares 999 knots but contains 8/,
  );
});

test("general and rational SPLINE geometry fails closed instead of becoming sampled authority", () => {
  const general = dxfDocument(`0
SPLINE
5
S2
8
CUT
70
8
71
3
72
9
73
5
74
0
40
0
40
0
40
0
40
0
40
0.5
40
1
40
1
40
1
40
1
10
0
20
0
10
1
20
2
10
2
20
3
10
3
20
2
10
4
20
0
`);
  assert.throws(
    () => importStructuralDxf(general, {
      id: "general-spline",
      operationMapping: { layers: { CUT: "cut" } },
    }),
    /general B-spline knot spans are not sampled/,
  );

  const hiddenWeights = general
    .replace("73\n5", "73\n4")
    .replace("40\n0.5\n", "")
    .replace("10\n4\n20\n0\n", "")
    .replace("10\n0\n20\n0\n", "41\n1\n10\n0\n20\n0\n");
  assert.throws(
    () => importStructuralDxf(hiddenWeights, {
      id: "hidden-rational-weights",
      operationMapping: { layers: { CUT: "cut" } },
    }),
    /weights require unsupported rational-curve semantics/,
  );
});

test("unitless DXF requires an explicit scale and supported override converts to millimetres", () => {
  const source = dxfDocument([
    line("U1", "CUT", 0, 0, 1, 1),
    line("U2", "CUT", 0, 1, 1, 0),
  ].join(""), { insUnits: 0 });
  const options = { id: "unitless", operationMapping: { layers: { CUT: "cut" as const } } };
  assert.throws(() => importStructuralDxf(source, options), /pass sourceUnits explicitly/);
  const { dieline } = importStructuralDxf(source, { ...options, sourceUnits: "in" });
  near(dieline.widthMm, 25.4);
  near(dieline.heightMm, 25.4);
  assert.equal(dieline.source.sourceUnits, "in");

  const custom = importStructuralDxf(source, {
    ...options,
    sourceUnits: "custom:packaging-cad-unit",
    millimetresPerSourceUnit: 2.5,
  }).dieline;
  near(custom.widthMm, 2.5);
  near(custom.heightMm, 2.5);
  assert.equal(custom.source.sourceUnits, "custom:packaging-cad-unit");
  assert.throws(
    () => importStructuralDxf(source, { ...options, millimetresPerSourceUnit: 0 }),
    /finite and positive/,
  );

  const inches = dxfDocument([
    line("I1", "CUT", 0, 0, 10, 10),
    line("I2", "CUT", 0, 10, 10, 0),
  ].join(""), { insUnits: 1 });
  assert.throws(
    () => importStructuralDxf(inches, {
      ...options,
      id: "header-unit-conflict",
      millimetresPerSourceUnit: 1,
    }),
    /conflicts with source unit in/,
  );
  assert.throws(
    () => importStructuralDxf(source, {
      ...options,
      id: "override-unit-conflict",
      sourceUnits: "in",
      millimetresPerSourceUnit: 1,
    }),
    /conflicts with source unit in/,
  );
});

test("unsupported mapped entities and paper-space geometry fail honestly", () => {
  const insert = dxfDocument(`0
INSERT
5
I1
8
CUT
2
BLOCK_A
10
0
20
0
30
0
`);
  assert.throws(
    () => importStructuralDxf(insert, {
      id: "insert",
      operationMapping: { layers: { CUT: "cut" } },
    }),
    /INSERT is not supported as exact structural geometry/,
  );

  const paper = dxfDocument([
    line("P1", "CUT", 0, 0, 10, 10, "67\n1\n"),
    line("P2", "CUT", 0, 10, 10, 0),
  ].join(""));
  assert.throws(
    () => importStructuralDxf(paper, {
      id: "paper-space",
      operationMapping: { layers: { CUT: "cut" } },
    }),
    /paper-space DXF geometry/,
  );

  const nonPlanarCircle = dxfDocument(`0
CIRCLE
5
N1
8
WINDOW
10
5
20
5
30
0
40
2
210
1
220
0
230
0
`);
  assert.throws(
    () => importStructuralDxf(nonPlanarCircle, {
      id: "non-planar-circle",
      operationMapping: { layers: { WINDOW: "window-cut" } },
    }),
    /unsupported non-default extrusion direction/,
  );

  const tinyExtrusion = dxfDocument([
    line("N2", "CUT", 0, 0, 1e12, 1, "210\n5e-10\n220\n0\n230\n1\n"),
    line("N3", "CUT", 0, 1, 1e12, 0),
  ].join(""));
  assert.throws(
    () => importStructuralDxf(tinyExtrusion, {
      id: "tiny-non-default-extrusion",
      operationMapping: { layers: { CUT: "cut" } },
    }),
    /unsupported non-default extrusion direction/,
  );
});

test("unclassified and invisible entities are reported, with strict classification available", () => {
  const source = dxfDocument([
    line("V1", "CREASE", 0, 0, 10, 10),
    line("H1", "CUT", 0, 10, 10, 0, "60\n1\n"),
    line("X1", "UNKNOWN", 5, 0, 5, 10),
  ].join(""), { layers: ["CUT", "CREASE", "UNKNOWN"] });
  const { dieline, issues } = importStructuralDxf(source, {
    id: "visibility",
    operationMapping: { layers: { CREASE: "crease" } },
  });
  assert.deepEqual(dieline.entities.map(({ provenance }) => provenance.entityId), ["V1"]);
  assert.ok(issues.some(({ code, entityHandle }) => code === "invisible-entity-skipped" && entityHandle === "H1"));
  assert.ok(issues.some(({ code, entityHandle }) => code === "unclassified-operation" && entityHandle === "X1"));
  assert.throws(
    () => importStructuralDxf(source, {
      id: "strict-visibility",
      strict: true,
      operationMapping: { layers: { CREASE: "crease" } },
    }),
    /no structural operation matched/,
  );

  const frozenCase = dxfDocument([
    line("FROZENCASE", "cut", 0, 0, 10, 10),
    line("VISIBLECASE", "CREASE", 0, 10, 10, 0),
  ].join("")).replace("2\nCUT\n70\n0", "2\nCUT\n70\n1");
  const caseResult = importStructuralDxf(frozenCase, {
    id: "case-insensitive-visibility",
    operationMapping: { layers: { CUT: "cut", CREASE: "crease" } },
  });
  assert.deepEqual(
    caseResult.dieline.entities.map(({ provenance }) => provenance.entityId),
    ["VISIBLECASE"],
  );
  assert.ok(caseResult.issues.some(
    ({ code, entityHandle }) => code === "invisible-entity-skipped" && entityHandle === "FROZENCASE",
  ));

  const conflictingLayerTable = dxfDocument(
    line("DUP", "CUT", 0, 0, 10, 10),
    { layers: ["CUT", "cut"] },
  );
  assert.throws(
    () => importStructuralDxf(conflictingLayerTable, {
      id: "duplicate-layer-case",
      operationMapping: { layers: { CUT: "cut" } },
    }),
    /layer table contains conflicting case-insensitive name/,
  );
});
