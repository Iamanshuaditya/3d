import assert from "node:assert/strict";
import test from "node:test";
import { PRODUCTS, getProduct } from "@/lib/configurator/product-config";
import {
  buildProductExperienceMatrix,
  findProductExperienceCapture,
  missingFixtureProducts,
  PRODUCT_EXPERIENCE_FIXTURES,
  PRODUCT_EXPERIENCE_STATES,
} from "@/lib/qa/product-experience";
import {
  buildProductExperienceDiagnostics,
  previewOccupancy,
  type ProductExperienceDiagnostics,
} from "@/lib/qa/product-experience-diagnostics";
import {
  contrastRatio,
  evaluateExportGuideLeak,
  evaluateProductExperience,
  PRODUCT_EXPERIENCE_THRESHOLDS,
  relativeLuminance,
} from "@/lib/qa/product-experience-gates";

function diagnosticsFor(fixtureId: string): ProductExperienceDiagnostics {
  const fixture = PRODUCT_EXPERIENCE_FIXTURES.find((entry) => entry.id === fixtureId);
  assert.ok(fixture, `unknown fixture ${fixtureId}`);
  const config = PRODUCTS[fixture.productId];
  assert.ok(config, `fixture ${fixtureId} points at missing product ${fixture.productId}`);
  return buildProductExperienceDiagnostics(config);
}

function gateIds(diagnostics: ProductExperienceDiagnostics): string[] {
  return evaluateProductExperience(diagnostics).map((failure) => failure.gate);
}

// ---------------------------------------------------------------------------
// The benchmark set itself
// ---------------------------------------------------------------------------

test("every benchmark fixture resolves to a real product", () => {
  assert.deepEqual(missingFixtureProducts((id) => getProduct(id)), []);
});

test("the benchmark set represents visiting card, pouch and carton", () => {
  const families = new Set(
    PRODUCT_EXPERIENCE_FIXTURES.map((fixture) => PRODUCTS[fixture.productId].family),
  );
  assert.ok(families.has("flat-sheet"), "a flat visiting card must be represented");
  assert.ok(families.has("pouch"), "a pouch must be represented");
  assert.ok(families.has("folded-carton"), "a carton must be represented");
});

test("the capture matrix is stable, unique and skips inapplicable states", () => {
  const matrix = buildProductExperienceMatrix();
  const ids = matrix.map((capture) => capture.id);
  assert.equal(new Set(ids).size, ids.length, "capture ids must be unique");
  assert.deepEqual(ids, buildProductExperienceMatrix().map((c) => c.id), "order is stable");

  // An unprinted fixture has no artwork state to capture.
  assert.equal(findProductExperienceCapture("light-pouch--artwork-crop"), undefined);
  // A flat sheet does not unfold.
  assert.equal(findProductExperienceCapture("visiting-card--dieline-flat"), undefined);
  // The carton does.
  assert.ok(findProductExperienceCapture("complex-carton--dieline-flat"));

  for (const state of PRODUCT_EXPERIENCE_STATES) {
    assert.ok(
      matrix.some((capture) => capture.stateId === state.id),
      `state ${state.id} is declared but never captured by any fixture`,
    );
  }
});

test("both 3D orientations and an angled view are captured for every fixture", () => {
  const matrix = buildProductExperienceMatrix();
  for (const fixture of PRODUCT_EXPERIENCE_FIXTURES) {
    for (const state of ["3d-front", "3d-back", "3d-angled"]) {
      assert.ok(
        matrix.some((c) => c.fixtureId === fixture.id && c.stateId === state),
        `${fixture.id} is missing the ${state} capture that catches back-rotation drift`,
      );
    }
  }
});

// ---------------------------------------------------------------------------
// The whole benchmark set must pass its own gates
// ---------------------------------------------------------------------------

test("every benchmark fixture passes the objective product-experience gates", () => {
  const failures = PRODUCT_EXPERIENCE_FIXTURES.flatMap((fixture) =>
    evaluateProductExperience(diagnosticsFor(fixture.id)),
  );
  assert.deepEqual(
    failures.map((failure) => `${failure.productId} ${failure.gate}: ${failure.detail}`),
    [],
  );
});

// ---------------------------------------------------------------------------
// Chirality and web mapping
// ---------------------------------------------------------------------------

test("the printed wrap tiles the web with no gap and no overlap", () => {
  const diagnostics = diagnosticsFor("light-pouch");
  const columns = diagnostics.webColumns;
  assert.ok(columns, "a parametric pouch must expose its printed-web columns");
  assert.deepEqual(
    columns.map((column) => column.id),
    ["front", "right", "back", "left"],
    "wrap order decides which artwork lands on which wall",
  );
  for (let index = 1; index < columns.length; index += 1) {
    assert.equal(
      columns[index].startMm,
      columns[index - 1].startMm + columns[index - 1].widthMm,
      `column ${columns[index].id} must start exactly where ${columns[index - 1].id} ends`,
    );
  }
});

/**
 * Locks the left-gusset regression. Before the fix the left column started at
 * bleed + width + 2*gusset, which placed it inside the back panel and left the
 * final band of the web unmapped. This assertion fails against that behaviour.
 */
test("the left gusset follows the back panel rather than overlapping it", () => {
  const columns = diagnosticsFor("light-pouch").webColumns;
  assert.ok(columns);
  const back = columns.find((column) => column.id === "back");
  const left = columns.find((column) => column.id === "left");
  const right = columns.find((column) => column.id === "right");
  assert.ok(back && left && right);
  assert.equal(left.startMm, back.startMm + back.widthMm);
  assert.ok(
    left.startMm >= back.startMm + back.widthMm,
    "the left gusset must not sample artwork from inside the back panel",
  );
  assert.notEqual(
    left.startMm,
    right.startMm + right.widthMm + right.widthMm,
    "the pre-fix bleed + width + 2*gusset origin must not come back",
  );
});

test("the front reads unmirrored and the back reads mirrored", () => {
  for (const fixtureId of ["light-pouch", "dark-pouch"]) {
    const columns = diagnosticsFor(fixtureId).webColumns;
    assert.ok(columns, `${fixtureId} must expose printed-web columns`);
    const front = columns.find((column) => column.id === "front");
    const back = columns.find((column) => column.id === "back");
    assert.equal(front?.mirrored, false, `${fixtureId}: front artwork must read forwards`);
    assert.equal(back?.mirrored, true, `${fixtureId}: back must mirror so the wrap reads outside`);
  }
});

test("the mirroring gates fail against a mirrored front and an unmirrored back", () => {
  const base = diagnosticsFor("light-pouch");
  const columns = base.webColumns;
  assert.ok(columns);

  const mirroredFront = {
    ...base,
    webColumns: columns.map((column) =>
      column.id === "front" ? { ...column, mirrored: true } : column,
    ),
  };
  assert.ok(gateIds(mirroredFront).includes("frontFaceNotMirrored"));

  const unmirroredBack = {
    ...base,
    webColumns: columns.map((column) =>
      column.id === "back" ? { ...column, mirrored: false } : column,
    ),
  };
  assert.ok(gateIds(unmirroredBack).includes("backFaceMirrored"));
});

test("the tiling gate fails against a shifted column", () => {
  const base = diagnosticsFor("light-pouch");
  const columns = base.webColumns;
  assert.ok(columns);
  const shifted = {
    ...base,
    webColumns: columns.map((column) =>
      column.id === "left" ? { ...column, startMm: column.startMm - 70 } : column,
    ),
  };
  assert.ok(gateIds(shifted).includes("webWrapTilesWithoutGap"));
});

// ---------------------------------------------------------------------------
// Guide semantics
// ---------------------------------------------------------------------------

test("printable surfaces present a cut edge and a bleed/safe pair", () => {
  for (const fixtureId of ["visiting-card", "light-pouch", "dark-pouch", "complex-carton"]) {
    const classes = diagnosticsFor(fixtureId).guideClasses;
    assert.ok(classes.includes("cut"), `${fixtureId} must show where it is trimmed`);
    assert.ok(classes.includes("bleed"), `${fixtureId} must show its bleed limit`);
    assert.ok(classes.includes("safe"), `${fixtureId} must show its safe area`);
  }
});

/**
 * The measured Nexibles web has no certified bleed or safe-area semantics. It
 * must therefore declare them unresolved rather than present a guessed
 * boundary a customer would trust.
 */
test("a measured web declares unresolved limits instead of inventing them", () => {
  const diagnostics = diagnosticsFor("measured-pouch-web");
  assert.ok(diagnostics.guideClasses.includes("cut"));
  assert.ok(
    diagnostics.unresolvedReferenceCount > 0,
    "unconfirmed source marks must stay visible as unresolved references",
  );
  assert.deepEqual(evaluateProductExperience(diagnostics), []);

  const invented = {
    ...diagnostics,
    guideClasses: diagnostics.guideClasses.filter((entry) => entry !== "cut"),
  };
  assert.ok(gateIds(invented).includes("cutGuidePresent"));
});

test("a surface with neither resolved limits nor a declared gap fails", () => {
  const base = diagnosticsFor("light-pouch");
  const silent = {
    ...base,
    guideClasses: base.guideClasses.filter(
      (entry) => entry !== "bleed" && entry !== "safe",
    ),
    unresolvedReferenceCount: 0,
  };
  assert.ok(
    gateIds(silent).includes("printableGuidesResolvedOrDeclaredUnresolved"),
    "omitting printable limits without declaring them unresolved must fail closed",
  );
});

// ---------------------------------------------------------------------------
// Editor/print scale
// ---------------------------------------------------------------------------

test("editor pixels map isotropically to millimetres", () => {
  for (const fixture of PRODUCT_EXPERIENCE_FIXTURES) {
    const { surface } = diagnosticsFor(fixture.id);
    const anisotropy =
      Math.abs(surface.pxPerMmX - surface.pxPerMmY) /
      Math.max(surface.pxPerMmX, surface.pxPerMmY);
    assert.ok(
      anisotropy <= PRODUCT_EXPERIENCE_THRESHOLDS.scaleAnisotropy,
      `${fixture.id} scales ${surface.pxPerMmX} across and ${surface.pxPerMmY} down`,
    );
  }
});

test("the scale gate fails against a stretched surface", () => {
  const base = diagnosticsFor("visiting-card");
  const stretched = {
    ...base,
    surface: { ...base.surface, pxPerMmY: base.surface.pxPerMmY * 1.02 },
  };
  assert.ok(gateIds(stretched).includes("surfaceScaleIsotropic"));
});

// ---------------------------------------------------------------------------
// Preview framing and silhouette
// ---------------------------------------------------------------------------

test("framing padding, not distance clamping, decides every fixture's occupancy", () => {
  for (const fixture of PRODUCT_EXPERIENCE_FIXTURES) {
    const preview = diagnosticsFor(fixture.id).preview;
    if (preview === null) continue;
    assert.equal(
      preview.distanceClamped,
      false,
      `${fixture.id} cannot frame itself inside its own orbit limits ` +
        `(${preview.minDistance}..${preview.maxDistance}, needs ${preview.unclampedDistance.toFixed(2)})`,
    );
    assert.ok(
      preview.occupancy >= PRODUCT_EXPERIENCE_THRESHOLDS.minimumPreviewOccupancy &&
        preview.occupancy <= PRODUCT_EXPERIENCE_THRESHOLDS.maximumPreviewOccupancy,
      `${fixture.id} fills ${(preview.occupancy * 100).toFixed(1)}% of the viewport`,
    );
  }
});

/**
 * Locks the mailer regression: its 12-unit orbit ceiling could not reach the
 * 13.81 units the unfolded 376x554 mm blank needs, so the flat pose was clipped.
 */
test("the carton can frame its own unfolded blank", () => {
  const preview = diagnosticsFor("complex-carton").preview;
  assert.ok(preview);
  assert.ok(
    preview.maxDistance >= preview.unclampedDistance,
    `orbit ceiling ${preview.maxDistance} is below the ${preview.unclampedDistance.toFixed(2)} ` +
      "the flat blank needs, so the dieline is clipped when unfolded",
  );
});

test("a clamped orbit ceiling is reported as an occupancy failure", () => {
  const clamped = previewOccupancy({
    radius: 3.34,
    padding: 1.14,
    minDistance: 1.8,
    maxDistance: 12,
    verticalFovDeg: 32,
    aspect: 16 / 10,
  });
  assert.equal(clamped.distanceClamped, true);
  assert.ok(clamped.occupancy > PRODUCT_EXPERIENCE_THRESHOLDS.maximumPreviewOccupancy);

  const base = diagnosticsFor("complex-carton");
  assert.ok(base.preview);
  const regressed = {
    ...base,
    preview: { ...base.preview, occupancy: clamped.occupancy, distanceClamped: true },
  };
  assert.ok(gateIds(regressed).includes("previewOccupancyInRange"));
});

test("a tiny product is caught as well as a clipped one", () => {
  const base = diagnosticsFor("light-pouch");
  assert.ok(base.preview);
  const tiny = { ...base, preview: { ...base.preview, occupancy: 0.12 } };
  const failure = evaluateProductExperience(tiny).find(
    (entry) => entry.gate === "previewOccupancyInRange",
  );
  assert.ok(failure, "a product filling 12% of the viewport must fail");
  assert.match(failure.detail, /below the 35% floor/);
});

test("relative luminance and contrast follow WCAG", () => {
  assert.equal(relativeLuminance("#ffffff"), 1);
  assert.equal(relativeLuminance("#000000"), 0);
  assert.equal(relativeLuminance("not a colour"), null);
  assert.equal(relativeLuminance("#fff"), 1, "shorthand hex is accepted");
  assert.equal(contrastRatio("#ffffff", "#000000"), 21);
  assert.equal(contrastRatio("#ffffff", "oops"), null);
});

test("the silhouette gate fails when substrate and background share a luminance", () => {
  const base = diagnosticsFor("visiting-card");
  const invisible = { ...base, background: base.surface.substrate };
  const failure = evaluateProductExperience(invisible).find(
    (entry) => entry.gate === "productSeparatedFromBackground",
  );
  assert.ok(failure, "a product on its own colour must fail the silhouette gate");
  assert.match(failure.detail, /1\.00:1/);
});

// ---------------------------------------------------------------------------
// UI chrome must not reach printed output
// ---------------------------------------------------------------------------

test("identical export digests prove guides never reached the artwork", () => {
  assert.deepEqual(
    evaluateExportGuideLeak({
      productId: "light-pouch",
      withGuidesDigest: "abc123",
      withoutGuidesDigest: "abc123",
    }),
    [],
  );
});

test("a differing export digest is reported as guide leakage", () => {
  const failures = evaluateExportGuideLeak({
    productId: "light-pouch",
    withGuidesDigest: "aaaaaaaaaaaaaaaa",
    withoutGuidesDigest: "bbbbbbbbbbbbbbbb",
  });
  assert.equal(failures.length, 1);
  assert.equal(failures[0].gate, "noGuideLeakInExport");
  assert.match(failures[0].detail, /reaching the printed output/);
});
