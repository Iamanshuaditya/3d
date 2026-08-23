import assert from "node:assert/strict";
import { test } from "node:test";
import { PRODUCTS } from "@/lib/configurator/product-config";
import { resolveStudioPresentation } from "@/platform/presentation/resolve-studio-presentation";
import type { ProductConfig } from "@/types/configurator";

function frontBackProduct(): ProductConfig {
  const source = structuredClone(PRODUCTS.tshirt);
  const base = source.editableSurfaces[0];
  return {
    ...source,
    id: "flat-card",
    name: "Flat card",
    editableSurfaces: [
      {
        ...structuredClone(base),
        id: "card-back-art",
        label: "Back",
        meshName: "BACK_PREVIEW_MESH",
        presentation: { kind: "page", pageNumber: 2, side: "back" },
      },
      {
        ...structuredClone(base),
        id: "card-front-art",
        label: "Front",
        meshName: "FRONT_PREVIEW_MESH",
        presentation: { kind: "page", pageNumber: 1, side: "front" },
      },
    ],
  };
}

test("front/back pages are ordered views onto surfaces, not mesh identities", () => {
  const resolved = resolveStudioPresentation(frontBackProduct(), "2d-first");
  assert.equal(resolved.previewKind, "2d-proof");
  assert.equal(resolved.navigationLabel, "Pages");
  assert.deepEqual(
    resolved.targets.map((target) => ({
      surfaceId: target.surfaceId,
      label: target.label,
      pageNumber: target.pageNumber,
      side: target.side,
    })),
    [
      { surfaceId: "card-front-art", label: "Front", pageNumber: 1, side: "front" },
      { surfaceId: "card-back-art", label: "Back", pageNumber: 2, side: "back" },
    ],
  );
  assert.notEqual(resolved.targets[0].surfaceId, "FRONT_PREVIEW_MESH");
});

test("page numbers are validated independently of surface ids", () => {
  const product = frontBackProduct();
  product.editableSurfaces[1].presentation = {
    kind: "page",
    pageNumber: 2,
    side: "front",
  };
  assert.throws(
    () => resolveStudioPresentation(product, "2d-first"),
    /Page number 2 is duplicated/,
  );
});

test("existing packaging webs and independent print areas keep their real semantics", () => {
  const mailer = resolveStudioPresentation(PRODUCTS["mailer-box-001"], "packaging");
  assert.equal(mailer.targets.length, 1);
  assert.equal(mailer.targets[0].kind, "continuous-web");
  assert.equal(mailer.previewKind, "3d-product");

  const counter = resolveStudioPresentation(PRODUCTS["counter-display"], "2d-3d-split");
  assert.equal(counter.targets.length, 2);
  assert.equal(counter.navigationLabel, "Print areas");
  assert.deepEqual(counter.targets.map((target) => target.kind), ["print-area", "print-area"]);
});

test("garment presentation does not invent unsupported back or sleeve pages", () => {
  const shirt = resolveStudioPresentation(PRODUCTS.tshirt, "garment");
  assert.equal(shirt.previewKind, "3d-product");
  assert.deepEqual(shirt.targets.map((target) => target.surfaceId), ["front-chest"]);
});
