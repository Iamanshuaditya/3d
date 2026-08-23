import assert from "node:assert/strict";
import { test } from "node:test";
import { ValidationError } from "@/platform/projects/errors";
import { parseDesignDocument } from "@/platform/projects/design-document";

function text(id: string) {
  return {
    id,
    type: "text",
    text: "Safe text",
    x: 0,
    y: 0,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
    opacity: 1,
    fontFamily: "Arial",
    fontSize: 24,
    fill: "#111111",
  };
}

function design(elements: unknown[], background: unknown = null) {
  return {
    productId: "test-product",
    surfaces: { front: { background, elements } },
  };
}

function invalidDesign(error: unknown) {
  return error instanceof ValidationError && error.code === "INVALID_DESIGN";
}

test("project documents reject duplicate element identities", () => {
  assert.throws(() => parseDesignDocument(design([text("same"), text("same")])), invalidDesign);
});

test("project documents bound render-sensitive numeric values", () => {
  assert.throws(
    () => parseDesignDocument(design([{ ...text("huge"), fontSize: 1e100 }])),
    invalidDesign,
  );
  assert.throws(
    () => parseDesignDocument(design([{ ...text("opacity"), opacity: 1.1 }])),
    invalidDesign,
  );
  assert.throws(() => parseDesignDocument(design([text("safe")], "x".repeat(129))), invalidDesign);
});

test("embroidery settings reject unsafe ranges and non-integer colour counts", () => {
  const image = {
    id: "image",
    type: "image",
    assetId: "asset",
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
    opacity: 1,
    treatment: {
      mode: "embroidery",
      settings: {
        densityMm: 0.45,
        threadWidthMm: 0.4,
        stitchLengthMm: 2.6,
        maxColours: 2.5,
        sheen: 0.55,
        satinMaxWidthMm: 6,
        reliefMm: 0.7,
      },
    },
  };
  assert.throws(() => parseDesignDocument(design([image])), invalidDesign);
});
