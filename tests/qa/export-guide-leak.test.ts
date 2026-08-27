import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { PRODUCTS } from "@/lib/configurator/product-config";
import { resolveSurfaceDieline } from "@/lib/configurator/resolve-dieline";
import { PRODUCT_EXPERIENCE_FIXTURES } from "@/lib/qa/product-experience";
import { evaluateExportGuideLeak } from "@/lib/qa/product-experience-gates";
import { renderSurfaceArtworkPng } from "@/server/rendering/render-surface-artwork";
import type { EditableSurface, SurfaceDesign } from "@/types/configurator";

/** A design with real geometry, so a leaked guide would change actual pixels. */
const design: SurfaceDesign = {
  background: "#ffffff",
  elements: [
    {
      id: "block",
      type: "text",
      text: "VORTEX",
      x: 40,
      y: 60,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      opacity: 1,
      fontSize: 48,
      fontFamily: "Helvetica",
      fill: "#101010",
    },
  ],
};

async function digest(surface: EditableSurface): Promise<string> {
  const bytes = await renderSurfaceArtworkPng({
    design,
    surface,
    pixelWidth: 320,
    pixelHeight: 200,
    maximumRasterPixels: 4_000_000,
  });
  return createHash("sha256").update(bytes).digest("hex");
}

/**
 * The strongest available statement that UI chrome cannot reach print: render
 * the same design twice, once with the surface's full dieline attached and once
 * with every guide stripped. Identical bytes mean the production renderer never
 * consulted guide geometry, so no toggle, hover or selection state can leak.
 */
test("production artwork is byte-identical with and without dieline guides", async () => {
  for (const fixture of PRODUCT_EXPERIENCE_FIXTURES) {
    const config = PRODUCTS[fixture.productId];
    const surface = config.editableSurfaces[0];
    const dieline = resolveSurfaceDieline(config, surface);
    assert.ok(dieline, `${fixture.id} must resolve a dieline for this test to mean anything`);

    const withGuides = await digest({ ...surface, dieline, guides: surface.guides });
    const withoutGuides = await digest({ ...surface, dieline: undefined, guides: undefined });

    assert.deepEqual(
      evaluateExportGuideLeak({
        productId: config.id,
        withGuidesDigest: withGuides,
        withoutGuidesDigest: withoutGuides,
      }),
      [],
      `${fixture.id}: attaching dieline guides changed the printed artwork`,
    );
  }
});

/** Guards the guard: the comparison must be capable of detecting a change. */
test("the leak check detects a genuinely different render", async () => {
  const config = PRODUCTS[PRODUCT_EXPERIENCE_FIXTURES[0].productId];
  const surface = config.editableSurfaces[0];
  const plain = await digest(surface);

  const bytes = await renderSurfaceArtworkPng({
    design: { ...design, background: "#00ff00" },
    surface,
    pixelWidth: 320,
    pixelHeight: 200,
    maximumRasterPixels: 4_000_000,
  });
  const altered = createHash("sha256").update(bytes).digest("hex");

  assert.notEqual(plain, altered, "the digest must move when pixels move");
  assert.equal(
    evaluateExportGuideLeak({
      productId: config.id,
      withGuidesDigest: plain,
      withoutGuidesDigest: altered,
    }).length,
    1,
  );
});
