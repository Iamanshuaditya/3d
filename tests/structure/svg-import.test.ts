import assert from "node:assert/strict";
import { test } from "node:test";
import {
  applyAffine,
  evaluateVectorSegment,
  importStructuralSvg,
  segmentEnd,
  segmentStart,
} from "@/lib/structure";

const SVG_NS = "http://www.w3.org/2000/svg";

function near(actual: number, expected: number, tolerance = 1e-9): void {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `expected ${actual} to be within ${tolerance} of ${expected}`,
  );
}

test("SVG import normalizes viewBox coordinates to millimetres and retains source transforms", () => {
  const svg = `
    <svg xmlns="${SVG_NS}"
      xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape"
      width="200mm" height="100mm" viewBox="0 0 400 200">
      <g inkscape:groupmode="layer" inkscape:label="CUT" transform="translate(10 20)">
        <path id="outer" d="M 0 0 H 100 V 50 H 0 Z" />
      </g>
      <line id="fold" data-operation="crease" x1="200" y1="0" x2="200" y2="200" />
    </svg>`;
  const { dieline, issues } = importStructuralSvg(svg, {
    id: "viewbox-mm",
    sourceSha256: "a".repeat(64),
    operationMapping: { layers: { CUT: "cut" } },
  });

  assert.deepEqual(issues, []);
  assert.equal(dieline.widthMm, 200);
  assert.equal(dieline.heightMm, 100);
  assert.equal(dieline.entities.length, 2);
  const outer = dieline.entities[0];
  assert.equal(outer.operation, "cut");
  assert.equal(outer.classification.method, "layer-map");
  assert.equal(outer.provenance.layerName, "CUT");
  assert.equal(outer.path.segments[0].kind, "line");
  assert.deepEqual(segmentStart(outer.path.segments[0]), { x: 0, y: 0 });
  assert.deepEqual(applyAffine(outer.path.transform, segmentStart(outer.path.segments[0])), {
    x: 5,
    y: 10,
  });
  assert.deepEqual(applyAffine(outer.path.transform, segmentEnd(outer.path.segments[0])), {
    x: 55,
    y: 10,
  });
  assert.deepEqual(outer.provenance.sourceTransform, { a: 1, b: 0, c: 0, d: 1, e: 10, f: 20 });
  assert.notDeepEqual(
    outer.provenance.sourceTransform,
    outer.path.transform,
    "source-space transforms remain distinct from canonical millimetre normalization",
  );
  assert.equal(outer.path.segments[0].provenance?.source.entityId, "outer");
  assert.equal(outer.path.segments[0].provenance?.sourceSegmentIndex, 0);

  const fold = dieline.entities[1];
  assert.equal(fold.operation, "crease");
  assert.equal(fold.classification.method, "explicit");
  assert.deepEqual(applyAffine(fold.path.transform, segmentStart(fold.path.segments[0])), {
    x: 100,
    y: 0,
  });
  assert.deepEqual(applyAffine(fold.path.transform, segmentEnd(fold.path.segments[0])), {
    x: 100,
    y: 100,
  });
});

test("SVG path commands retain cubic, quadratic, and elliptical arc semantics", () => {
  const svg = `
    <svg xmlns="${SVG_NS}" width="100mm" height="60mm" viewBox="0 0 100 60">
      <path data-operation="cut"
        d="M 0 0 C 5 0 5 10 10 10 S 15 20 20 10 Q 25 0 30 10 T 40 10 A 5 8 30 0 1 50 20" />
      <path data-operation="window-cut" d="M60 10 l20 0 v20 h-20 z" />
    </svg>`;
  const { dieline } = importStructuralSvg(svg, { id: "curves" });
  const segments = dieline.entities[0].path.segments;

  assert.deepEqual(segments.map((segment) => segment.kind), [
    "cubic",
    "cubic",
    "quadratic",
    "quadratic",
    "elliptical-arc",
  ]);
  assert.deepEqual(segmentEnd(segments[0]), { x: 10, y: 10 });
  assert.deepEqual(
    (segments[1].kind === "cubic" ? segments[1].p1 : null),
    { x: 15, y: 10 },
    "smooth cubic control reflects the prior control around the current point",
  );
  assert.deepEqual(
    (segments[3].kind === "quadratic" ? segments[3].p1 : null),
    { x: 35, y: 20 },
    "smooth quadratic control reflects the prior control around the current point",
  );
  const arc = segments[4];
  assert.equal(arc.kind, "elliptical-arc");
  near(evaluateVectorSegment(arc, 0).x, 40);
  near(evaluateVectorSegment(arc, 0).y, 10);
  near(evaluateVectorSegment(arc, 1).x, 50);
  near(evaluateVectorSegment(arc, 1).y, 20);

  const windowPath = dieline.entities[1].path;
  assert.equal(windowPath.closed, true);
  assert.equal(windowPath.segments.length, 4);
});

test("SVG transform lists, nested transforms, and preserveAspectRatio none compose exactly", () => {
  const svg = `
    <svg xmlns="${SVG_NS}" width="200mm" height="100mm"
      viewBox="0 0 100 100" preserveAspectRatio="none">
      <g transform="translate(10 5) scale(2)">
        <g transform="rotate(90)">
          <line id="axis" data-operation="crease" x1="1" y1="0" x2="2" y2="0" />
        </g>
      </g>
    </svg>`;
  const { dieline } = importStructuralSvg(svg, { id: "transforms" });
  const path = dieline.entities[0].path;
  const start = applyAffine(path.transform, segmentStart(path.segments[0]));
  const end = applyAffine(path.transform, segmentEnd(path.segments[0]));

  // Inner rotate acts first, then scale, then translate, then the viewBox's
  // non-uniform 2 mm/user X and 1 mm/user Y transform.
  near(start.x, 20);
  near(start.y, 7);
  near(end.x, 20);
  near(end.y, 9);
});

test("SVG shape elements preserve closed curves and physical length attributes", () => {
  const svg = `
    <svg xmlns="${SVG_NS}" width="100mm" height="100mm" viewBox="0 0 100 100">
      <line id="line" data-operation="crease" x1="1cm" y1="2mm" x2="20mm" y2="2mm" />
      <polyline id="polyline" data-operation="crease" points="0,0 10-10 20,0" />
      <polygon id="polygon" data-operation="cut" points="0,20 10,30 20,20" />
      <rect id="sharp" data-operation="cut" x="30" y="10" width="20" height="10" rx="0" />
      <rect id="round" data-operation="cut" x="30" y="30" width="20" height="10" rx="2" ry="3" />
      <circle id="circle" data-operation="window-cut" cx="70" cy="20" r="5" />
      <ellipse id="ellipse" data-operation="window-cut" cx="70" cy="50" rx="8" ry="4" />
    </svg>`;
  const { dieline } = importStructuralSvg(svg, { id: "shapes" });
  const byId = new Map(dieline.entities.map((entity) => [entity.id, entity]));

  assert.equal(byId.get("line")?.path.closed, false);
  assert.deepEqual(segmentStart(byId.get("line")!.path.segments[0]), { x: 10, y: 2 });
  assert.equal(byId.get("polyline")?.path.segments.length, 2);
  assert.equal(byId.get("polygon")?.path.closed, true);
  assert.equal(byId.get("sharp")?.path.segments.length, 4);
  assert.deepEqual(
    byId.get("round")?.path.segments.map((segment) => segment.kind),
    ["line", "elliptical-arc", "line", "elliptical-arc", "line", "elliptical-arc", "line", "elliptical-arc"],
  );
  assert.equal(byId.get("circle")?.path.segments[0].kind, "arc");
  assert.equal(byId.get("ellipse")?.path.segments[0].kind, "elliptical-arc");
});

test("semantic classification is normalized and inline style wins over presentation attributes", () => {
  const svg = `
    <svg xmlns="${SVG_NS}" width="10mm" height="10mm" viewBox="0 0 10 10">
      <line id="mapped" stroke="#ff0000" style="stroke: rgb(0, 0, 255)" x1="0" y1="1" x2="10" y2="1" />
      <line id="authored" x1="0" y1="2" x2="10" y2="2" />
      <line id="explicit" style="--structural-operation: perforation" x1="0" y1="3" x2="10" y2="3" />
    </svg>`;
  const { dieline } = importStructuralSvg(svg, {
    id: "classification",
    operationMapping: {
      strokes: { "#ff0000": "cut", "#0000ff": "crease" },
      ids: { authored: "score" },
    },
  });

  assert.deepEqual(dieline.entities.map(({ operation }) => operation), [
    "crease",
    "score",
    "perforation",
  ]);
  assert.deepEqual(dieline.entities.map(({ classification }) => classification.method), [
    "style-map",
    "authored",
    "explicit",
  ]);
  assert.notEqual(dieline.entities[0].operation, dieline.entities[0].provenance.metadata?.stroke);
});

test("unclassified, raster, use, and definitions are reported or excluded honestly", () => {
  const svg = `
    <svg xmlns="${SVG_NS}" width="20mm" height="10mm" viewBox="0 0 20 10">
      <defs><path id="template" data-operation="cut" d="M0 0 L1 0" /></defs>
      <use id="instance" href="#template" />
      <image id="photo" href="data:image/png;base64,AA==" />
      <line id="unknown" x1="0" y1="1" x2="10" y2="1" />
      <line id="known" data-operation="crease" x1="0" y1="2" x2="10" y2="2" />
    </svg>`;
  const { dieline, issues } = importStructuralSvg(svg, { id: "honest-import" });

  assert.deepEqual(dieline.entities.map(({ id }) => id), ["known"]);
  assert.ok(issues.some(({ code }) => code === "use-element-unsupported"));
  assert.ok(issues.some(({ code }) => code === "raster-image-ignored"));
  assert.ok(issues.some(({ code }) => code === "unclassified-operation"));
  assert.throws(
    () => importStructuralSvg(svg, { id: "strict-import", strict: true }),
    /no structural operation matched/,
  );
  assert.throws(
    () => importStructuralSvg(
      `<svg xmlns="${SVG_NS}" width="1mm" height="1mm"><image href="x.png" /></svg>`,
      { id: "raster-only" },
    ),
    /no classified vector geometry/,
  );
});

test("multiple subpaths remain separate entities with stable provenance", () => {
  const svg = `
    <svg xmlns="${SVG_NS}" width="20mm" height="10mm" viewBox="0 0 20 10">
      <path id="two-cuts" data-operation="cut" d="M0 0 H5 V5 H0 Z M10 0 H15 V5 H10 Z" />
    </svg>`;
  const { dieline } = importStructuralSvg(svg, { id: "subpaths", sourceName: "fixture.svg" });

  assert.deepEqual(dieline.entities.map(({ id }) => id), ["two-cuts-1", "two-cuts-2"]);
  assert.ok(dieline.entities.every(({ provenance }) => provenance.entityId === "two-cuts"));
  assert.ok(dieline.entities.every(({ path }) => path.closed));
});

test("invalid or unsupported production geometry fails instead of being silently approximated", () => {
  assert.throws(
    () => importStructuralSvg(
      `<svg xmlns="${SVG_NS}" width="20mm" height="10mm"><rect data-operation="cut" width="5" height="5" rx="-1" /></svg>`,
      { id: "negative-radius" },
    ),
    /corner radii must not be negative/,
  );
  assert.throws(
    () => importStructuralSvg(
      `<svg xmlns="${SVG_NS}" width="20mm" height="10mm"><path data-operation="cut" d="M0 0 A-5 5 0 0 1 10 0" /></svg>`,
      { id: "negative-arc-radius" },
    ),
    /arc radii must not be negative/,
  );
  assert.throws(
    () => importStructuralSvg(
      `<svg xmlns="${SVG_NS}" width="20mm" height="10mm"><svg viewBox="0 0 10 10"><line data-operation="cut" x2="1" /></svg></svg>`,
      { id: "nested-viewport" },
    ),
    /Nested SVG viewports are not supported/,
  );
  assert.throws(
    () => importStructuralSvg(
      `<svg xmlns="${SVG_NS}" viewBox="0 0 20 10"><line data-operation="cut" x2="1" /></svg>`,
      { id: "unknown-physical-scale" },
    ),
    /viewBox alone has no authoritative physical scale/,
  );
});
