import assert from "node:assert/strict";
import test from "node:test";
import {
  commit,
  cancelTransient,
  createHistory,
  reduceHistory,
  redo,
  undo,
} from "@/lib/configurator/design-state";
import {
  contextToolbarPosition,
  transformedElementBounds,
} from "@/lib/configurator/editor-selection";
import { buildSnapTargets, resolveElementSnap } from "@/lib/configurator/snapping";
import { parseDesignDocument } from "@/platform/projects/design-document";
import type { DesignDocument, ImageElement } from "@/types/configurator";

const image: ImageElement = {
  id: "image-1",
  type: "image",
  src: "/artwork.png",
  x: 10,
  y: 20,
  width: 100,
  height: 50,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  opacity: 1,
};

function document(): DesignDocument {
  return {
    productId: "editor-fixture",
    surfaces: {
      front: { background: null, elements: [{ ...image }] },
    },
  };
}

test("a drag gesture creates one undo checkpoint at its initial position", () => {
  const initial = document();
  let history = createHistory(initial);
  history = reduceHistory(
    history,
    { type: "update", surfaceId: "front", id: image.id, patch: { x: 30 } },
    { transient: true },
  );
  history = reduceHistory(
    history,
    { type: "update", surfaceId: "front", id: image.id, patch: { x: 80 } },
    { transient: true },
  );
  history = commit(history);

  assert.equal(history.past.length, 1);
  assert.equal(history.past[0], initial, "history retains the pre-gesture document");
  assert.equal(history.present.surfaces.front.elements[0].x, 80);

  history = undo(history);
  assert.equal(history.present.surfaces.front.elements[0].x, 10);
  history = redo(history);
  assert.equal(history.present.surfaces.front.elements[0].x, 80);
});

test("committing without a transient gesture does not create a noisy undo entry", () => {
  const history = createHistory(document());
  assert.equal(commit(history), history);
});

test("cancelled crop-style transient changes restore the document without history noise", () => {
  const initial = document();
  const transient = reduceHistory(
    createHistory(initial),
    {
      type: "update",
      surfaceId: "front",
      id: image.id,
      patch: { crop: { x: 0.25, y: 0, width: 0.5, height: 1 } },
    },
    { transient: true },
  );
  const cancelled = cancelTransient(transient);
  assert.equal(cancelled.present, initial);
  assert.equal(cancelled.past.length, 0);
  assert.equal(cancelled.future.length, 0);
});

test("selection bounds follow top-left-origin scale and rotation", () => {
  assert.deepEqual(transformedElementBounds(image), { x: 10, y: 20, width: 100, height: 50 });
  const rotated = transformedElementBounds({ ...image, rotation: 90 });
  assert.ok(Math.abs(rotated.x + 40) < 1e-10);
  assert.ok(Math.abs(rotated.y - 20) < 1e-10);
  assert.ok(Math.abs(rotated.width - 50) < 1e-10);
  assert.ok(Math.abs(rotated.height - 100) < 1e-10);
});

test("context toolbar stays visible and moves below selections near the top edge", () => {
  assert.deepEqual(
    contextToolbarPosition({ x: 0, y: 5, width: 100, height: 50 }, 1, 720),
    { left: 150, top: 65, placement: "below" },
  );
  assert.deepEqual(
    contextToolbarPosition({ x: 600, y: 100, width: 100, height: 50 }, 1, 720),
    { left: 570, top: 90, placement: "above" },
  );
});

test("canvas centering snaps independently on both axes", () => {
  const moving = { ...image, x: 0, y: 0, width: 20, height: 20 };
  const targets = buildSnapTargets({ canvasWidth: 100, canvasHeight: 100 });
  assert.deepEqual(
    resolveElementSnap({
      element: moving,
      proposedX: 39,
      proposedY: 41,
      targets,
      stageScale: 1,
    }),
    {
      x: 40,
      y: 40,
      guides: [
        { axis: "x", value: 50, kind: "canvas", label: "Canvas horizontal centre" },
        { axis: "y", value: 50, kind: "canvas", label: "Canvas vertical centre" },
      ],
    },
  );
});

test("snap threshold is screen-space invariant from 25% to 200% zoom", () => {
  const moving = { ...image, x: 0, y: 0, width: 0.001, height: 0.001 };
  const targets = buildSnapTargets({ canvasWidth: 100, canvasHeight: 100 });
  const at25 = resolveElementSnap({
    element: moving,
    proposedX: 30,
    proposedY: 30,
    targets,
    stageScale: 0.25,
  });
  const at200 = resolveElementSnap({
    element: moving,
    proposedX: 47.5,
    proposedY: 47.5,
    targets,
    stageScale: 2,
  });
  assert.ok(Math.abs(at25.x - 50) < 0.01, "20 editor pixels are five CSS pixels at 25%");
  assert.ok(Math.abs(at200.x - 50) < 0.01, "2.5 editor pixels are five CSS pixels at 200%");
  assert.equal(at25.guides[0].value, 50);
  assert.equal(at200.guides[0].value, 50);
});

test("panel edges and other object edges are reusable snap targets", () => {
  const moving = { ...image, id: "moving", width: 20, height: 20 };
  const other = { ...image, id: "other", x: 180, y: 60, width: 20, height: 20 };
  const targets = buildSnapTargets({
    canvasWidth: 300,
    canvasHeight: 200,
    panels: [{ x: 20, y: 20, width: 80, height: 100 }],
    elements: [moving, other],
    excludeElementId: moving.id,
  });
  const panelSnap = resolveElementSnap({
    element: moving,
    proposedX: 101,
    proposedY: 20,
    targets,
    stageScale: 1,
  });
  assert.equal(panelSnap.x, 100);
  assert.equal(panelSnap.guides[0].kind, "panel");

  const objectTargets = buildSnapTargets({
    canvasWidth: 300,
    canvasHeight: 200,
    elements: [moving, other],
    excludeElementId: moving.id,
  });
  const objectSnap = resolveElementSnap({
    element: moving,
    proposedX: 159,
    proposedY: 61,
    targets: objectTargets,
    stageScale: 1,
  });
  assert.equal(objectSnap.x, 160);
  assert.ok(objectSnap.guides.some((guide) => guide.kind === "object"));
});

test("the modifier bypass returns raw coordinates and no guides", () => {
  const targets = buildSnapTargets({ canvasWidth: 100, canvasHeight: 100 });
  assert.deepEqual(
    resolveElementSnap({
      element: { ...image, width: 20, height: 20 },
      proposedX: 39,
      proposedY: 39,
      targets,
      stageScale: 1,
      disabled: true,
    }),
    { x: 39, y: 39, guides: [] },
  );
});

test("object locks survive document validation and reject non-boolean values", () => {
  const locked = document();
  locked.surfaces.front.elements[0].locked = true;
  assert.equal(parseDesignDocument(locked).surfaces.front.elements[0].locked, true);
  const invalid = structuredClone(locked) as unknown as {
    surfaces: { front: { elements: Array<Record<string, unknown>> } };
  };
  invalid.surfaces.front.elements[0].locked = "yes";
  assert.throws(() => parseDesignDocument(invalid), /locked must be a boolean/);
});
