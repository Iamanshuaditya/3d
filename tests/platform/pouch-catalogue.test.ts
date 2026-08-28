import assert from "node:assert/strict";
import { test } from "node:test";
import { POUCHES, generatedPouchSpecs } from "@/lib/configurator/pouch-spec";
import { PRODUCTS } from "@/lib/configurator/product-config";
import { resolveSurfaceDieline } from "@/lib/configurator/resolve-dieline";

/**
 * The parametric pouch factory is the supported way to add a SKU: one
 * makePouchSpec call has to reach the spec registry, the product catalogue and
 * a correct print web without touching any generic component.
 *
 * These assertions exist so that contract stays true. A SKU that registers but
 * produces a web whose panels do not sum to the physical pouch would still
 * render something plausible in 3D while being wrong on press.
 */

const COFFEE_1KG = "pouch-fb-coffee-1kg";
const CENTRE_INFLATED = "pouch-su-centre-150";

test("every generated pouch spec reaches both registries", () => {
  for (const spec of generatedPouchSpecs) {
    assert.ok(POUCHES[spec.id], `${spec.id} is missing from POUCHES`);
    assert.ok(PRODUCTS[spec.id], `${spec.id} is missing from PRODUCTS`);
    assert.equal(PRODUCTS[spec.id].family, "pouch");
    assert.equal(PRODUCTS[spec.id].pouchSpecId, spec.id);
  }
});

test("pouch SKU ids are unique", () => {
  const ids = generatedPouchSpecs.map((spec) => spec.id);
  assert.equal(new Set(ids).size, ids.length, "duplicate pouch SKU id");
});

test("centre-inflated pouch is a white registered Studio asset with its exact web", () => {
  const spec = POUCHES[CENTRE_INFLATED];
  const product = PRODUCTS[CENTRE_INFLATED];
  assert.equal(spec.proceduralModel?.kind, "centre-inflated-v1");
  assert.equal(spec.proceduralModel?.materialId, "matte-film");
  assert.equal(product.modelYOffset, 0);

  const surface = product.editableSurfaces[0];
  assert.equal(surface.defaultBackground, "#ffffff");
  assert.equal(surface.editorWidth, 696);
  assert.equal(surface.editorHeight, 2024);
  assert.equal(surface.physicalWidthCm * 10, 174);
  assert.equal(surface.physicalHeightCm * 10, 506);
  assert.deepEqual(surface.presentation, { kind: "continuous-web", order: 1 });
  assert.deepEqual(
    surface.sections?.map(({ id, yCm, widthCm, heightCm }) => ({
      id,
      yMm: yCm * 10,
      widthMm: widthCm * 10,
      heightMm: heightCm * 10,
    })),
    [
      { id: "back", yMm: 12, widthMm: 174, heightMm: 210 },
      { id: "gusset", yMm: 222, widthMm: 174, heightMm: 62 },
      { id: "front", yMm: 284, widthMm: 174, heightMm: 210 },
    ],
  );
  const dieline = resolveSurfaceDieline(product, surface);
  assert.deepEqual(
    dieline.references?.filter((reference) => reference.id.includes("side-seal")),
    [
      {
        id: "left-side-seal",
        label: "12 mm left side-seal boundary",
        points: [48, 0, 48, 2024],
      },
      {
        id: "right-side-seal",
        label: "12 mm right side-seal boundary",
        points: [648, 0, 648, 2024],
      },
    ],
  );
});

test("the 1 kg flat-bottom coffee pouch carries its authored dimensions", () => {
  const spec = POUCHES[COFFEE_1KG];
  assert.ok(spec, `${COFFEE_1KG} is not registered`);
  assert.equal(spec.style, "flat_bottom");
  assert.equal(spec.width, 190);
  assert.equal(spec.height, 290);
  assert.equal(spec.depth, 75);
  assert.equal(spec.resealableZip, true, "a 1 kg coffee bag is resealable");
});

test("the coffee pouch web wraps front | right | back | left at true size", () => {
  const product = PRODUCTS[COFFEE_1KG];
  const surface = product.editableSurfaces[0];
  const sections = surface.sections ?? [];

  assert.deepEqual(
    sections.map((section) => section.id),
    ["front", "right", "back", "left"],
    "flat-bottom pouches wrap in this panel order",
  );

  // Panels are authored in millimetres and presented in centimetres; the faces
  // must still measure the physical pouch rather than an arbitrary canvas.
  const widthOf = (id: string): number => {
    const section = sections.find((candidate) => candidate.id === id);
    assert.ok(section, `panel ${id} is missing from the web`);
    return section.widthCm;
  };
  assert.equal(widthOf("front"), 19, "front face is the 190 mm width");
  assert.equal(widthOf("back"), 19, "back face is the 190 mm width");
  assert.equal(widthOf("left"), 7.5, "left gusset is the 75 mm depth");
  assert.equal(widthOf("right"), 7.5, "right gusset is the 75 mm depth");
  for (const section of sections) {
    assert.equal(section.heightCm, 29, "every panel is the 290 mm pouch height");
  }

  // The printed web must be wide enough to hold the wrap plus its margins.
  const wrapCm = sections.reduce((total, section) => total + section.widthCm, 0);
  assert.ok(
    surface.physicalWidthCm > wrapCm,
    `web ${surface.physicalWidthCm} cm must exceed the ${wrapCm} cm wrap to carry bleed`,
  );
  assert.ok(surface.editorWidth > 0 && surface.editorHeight > 0);
});

test("pouch products declare generic guides or exact measured production regions", () => {
  for (const spec of generatedPouchSpecs) {
    const surface = PRODUCTS[spec.id].editableSurfaces[0];
    if (spec.productionWeb) {
      const dieline = resolveSurfaceDieline(PRODUCTS[spec.id], surface);
      assert.equal(
        dieline.regions?.length,
        spec.productionWeb.segments.length,
        `${spec.id} must expose every measured web region`,
      );
      continue;
    }
    const guides = surface.guides;
    assert.ok(guides, `${spec.id} has no print guides`);
    const { bleed, safeArea } = guides;
    assert.ok(typeof bleed === "number" && bleed > 0, `${spec.id} has no bleed`);
    assert.ok(
      typeof safeArea === "number" && safeArea > bleed,
      `${spec.id} safe area must sit inside the bleed`,
    );
  }
});
