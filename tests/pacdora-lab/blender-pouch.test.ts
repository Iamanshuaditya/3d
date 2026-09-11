import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { BLENDER_POUCH, blenderPouchConfig, blenderPouchGuideSvg } from "../../src/lib/configurator/blender-pouch";

type Accessor = { bufferView: number; byteOffset?: number; componentType: number; count: number; type: string };
type Primitive = { attributes: Record<string, number>; targets: { POSITION: number }[]; material: number; indices: number };
type Gltf = {
  nodes: { name: string; mesh: number }[];
  meshes: { extras: { targetNames: string[] }; primitives: Primitive[] }[];
  accessors: Accessor[];
  bufferViews: { byteOffset: number; byteStride?: number }[];
};
const bytes = readFileSync(new URL("../../public/models/blender-stand-up-pouch-v3.glb", import.meta.url));
const jsonLength = bytes.readUInt32LE(12);
const gltf = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString()) as Gltf;
const binaryOffset = 28 + jsonLength;
function floats(index: number, dimensions: number): number[][] {
  const accessor = gltf.accessors[index];
  assert.equal(accessor.componentType, 5126);
  const view = gltf.bufferViews[accessor.bufferView];
  const start = binaryOffset + view.byteOffset + (accessor.byteOffset ?? 0);
  const stride = view.byteStride ?? dimensions * 4;
  return Array.from({ length: accessor.count }, (_, i) => Array.from({ length: dimensions }, (_, axis) => bytes.readFloatLE(start + i * stride + axis * 4)));
}
const primitives = gltf.meshes.flatMap((mesh) => mesh.primitives).map((primitive) => ({
  ...primitive,
  positions: floats(primitive.attributes.POSITION, 3),
  uv: floats(primitive.attributes.TEXCOORD_0, 2),
  deltas: floats(primitive.targets[0].POSITION, 3),
}));
const pose = (p: typeof primitives[number], index: number, inflation: number) => p.positions[index].map((v, axis) => v + inflation * p.deltas[index][axis]);

test("Blender export contains only the intended master and a complete inflation morph", () => {
  assert.deepEqual(gltf.nodes.map((node) => node.name), [BLENDER_POUCH.meshName]);
  assert.equal(createHash("sha256").update(bytes).digest("hex"), BLENDER_POUCH.sha256);
  for (const mesh of gltf.meshes) assert.deepEqual(mesh.extras.targetNames, ["Inflation"]);
  for (const primitive of primitives) {
    assert.equal(primitive.positions.length, primitive.deltas.length);
    assert.equal(primitive.uv.length, primitive.positions.length);
  }
});

test("Inflation keeps the side rails straight and the empty pouch thin", () => {
  for (const inflation of [0, 0.5, 1]) {
    let maxDepth = 0;
    const sideSamples: number[] = [];
    for (const p of primitives) p.positions.forEach((_, index) => {
      const [x, y, z] = pose(p, index, inflation);
      assert.ok([x, y, z].every(Number.isFinite));
      maxDepth = Math.max(maxDepth, Math.abs(z) * 2);
      if (y > 0.04 && y < 0.21 && Math.abs(Math.abs(p.positions[index][0]) - 0.09) < 0.00002 && p.material !== 3) sideSamples.push(Math.abs(x));
    });
    assert.ok(sideSamples.length > 20);
    assert.ok(Math.max(...sideSamples) - Math.min(...sideSamples) < 0.00002);
    assert.ok(Math.abs(maxDepth - [0.00087, 0.02235, 0.04408][inflation * 2]) < 0.0002);
  }
});

test("The filled gusset has a deep smooth inset with no centre ridge", () => {
  const gusset = primitives.find((p) => p.material === 3)!;
  const centre = gusset.positions.map((_, i) => pose(gusset, i, 1)).filter(([x, , z]) => Math.abs(x) < 0.0002 && Math.abs(z) < 0.001);
  assert.ok(centre.length > 2);
  for (const [, y] of centre) assert.ok(y > 0.0085 && y < 0.0093);
  assert.ok(Math.max(...centre.map((v) => v[1])) - Math.min(...centre.map((v) => v[1])) < 0.00005);
});

test("The continuous front–gusset–back web keeps both faces upright in 3D", () => {
  let front = 0; let back = 0;
  for (const p of primitives) p.positions.forEach(([x, y, z], index) => {
    if (Math.abs(z) < 0.0002 || y < 0.04 || y > 0.20 || Math.abs(x) > 0.06) return;
    if (p.material === 3) return;
    const [u, v] = p.uv[index];
    if (z > 0) {
      assert.ok(Math.abs(u - ((0.2608 - y) / 0.564)) < 0.00002);
      front++;
    } else {
      assert.ok(Math.abs(u - ((0.3032 + y) / 0.564)) < 0.00002);
      back++;
    }
    assert.ok(Math.abs(v - ((0.09 - x) / 0.18)) < 0.00002);
  });
  assert.ok(front > 100 && back > 100);
  assert.equal(BLENDER_POUCH.textureFlipY, false);
  const surface = blenderPouchConfig.editableSurfaces[0];
  assert.deepEqual(surface.sections?.map((section) => section.id), ["front", "gusset", "back"]);
  assert.deepEqual(surface.sections?.map((section) => [Number(section.widthCm.toFixed(4)), section.heightCm]), [[26, 18], [4.4, 18], [26, 18]]);
  assert.deepEqual(surface.sections?.map((section) => section.contentRotation), [-90, -90, 90]);
  assert.equal(surface.editorWidth / surface.editorHeight, 564 / 180);
  assert.equal(blenderPouchConfig.previewOnly, true);
  const svg = blenderPouchGuideSvg();
  assert.ok(svg.includes('width="564mm" height="180mm"'));
  assert.ok(svg.includes("Not a certified manufacturing dieline"));
  assert.ok(!svg.includes("NaN"));
});

test("Artwork coordinates meet continuously where each face joins the gusset", () => {
  const body = new Map<string, number[]>();
  const key = (position: number[]) => position.map((value) => value.toFixed(7)).join(",");
  for (const p of primitives.filter((primitive) => primitive.material !== 3)) {
    p.positions.forEach((position, i) => body.set(key(position), p.uv[i]));
  }
  const gusset = primitives.find((primitive) => primitive.material === 3)!;
  let matches = 0;
  gusset.positions.forEach((position, index) => {
    if (Math.abs(position[0]) > 0.07) return;
    const uv = body.get(key(position));
    if (!uv) return;
    matches++;
    assert.ok(Math.hypot(uv[0] - gusset.uv[index][0], uv[1] - gusset.uv[index][1]) < 0.000001);
  });
  assert.ok(matches > 100);
  // A single film outline, with two panel joins and the central inward fold.
  assert.equal(BLENDER_POUCH.guides.cuts.length, 1);
  assert.equal(BLENDER_POUCH.guides.cuts[0].closed, true);
  assert.equal(BLENDER_POUCH.guides.creases.length, 3);
  for (const fold of BLENDER_POUCH.guides.creases) {
    const xs = fold.points.filter((_, i) => i % 2 === 0);
    const ys = fold.points.filter((_, i) => i % 2 === 1);
    assert.ok(Math.max(...xs) - Math.min(...xs) < 0.000001);
    assert.ok(Math.max(...ys) - Math.min(...ys) > 0.97);
  }
});

test("The underside UV winding preserves readable artwork", () => {
  const p = primitives.find((primitive) => primitive.material === 3)!;
  const accessor = gltf.accessors[p.indices];
  const view = gltf.bufferViews[accessor.bufferView];
  const start = binaryOffset + view.byteOffset + (accessor.byteOffset ?? 0);
  const size = accessor.componentType === 5123 ? 2 : 4;
  const indexAt = (i: number) => size === 2 ? bytes.readUInt16LE(start + i * size) : bytes.readUInt32LE(start + i * size);
  let area = 0;
  for (let i = 0; i < accessor.count; i += 3) {
    const [a, b, c] = [p.uv[indexAt(i)], p.uv[indexAt(i + 1)], p.uv[indexAt(i + 2)]];
    const signedArea = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    assert.ok(signedArea < 0, `Gusset triangle ${i / 3} mirrors or collapses artwork`);
    area += signedArea;
  }
  // glTF UVs use a top-left origin. Outward faces therefore have negative
  // signed UV area; a positive underside area mirrors uploaded base artwork.
  assert.ok(area < -0.09, `Underside artwork has reversed UV winding: ${area}`);
});

test("Inflation keeps shared face and gusset seams joined throughout the animation", () => {
  const key = (position: number[]) => position.map((value) => value.toFixed(7)).join(",");
  const body = new Map<string, { primitive: typeof primitives[number]; index: number }>();
  for (const primitive of primitives.filter((p) => p.material !== 3)) {
    primitive.positions.forEach((position, index) => body.set(key(position), { primitive, index }));
  }
  const gusset = primitives.find((p) => p.material === 3)!;
  let seamPairs = 0;
  gusset.positions.forEach((position, index) => {
    if (Math.abs(position[0]) > 0.07) return;
    const matching = body.get(key(position));
    if (!matching) return;
    seamPairs++;
    for (const inflation of [0, 0.25, 0.5, 0.75, 1]) {
      const a = pose(gusset, index, inflation);
      const b = pose(matching.primitive, matching.index, inflation);
      const gapMm = Math.hypot(...a.map((value, axis) => value - b[axis])) * 1000;
      assert.ok(gapMm < 0.001, `Inflation ${inflation} opened a ${gapMm} mm artwork seam`);
    }
  });
  assert.ok(seamPairs > 100, "the fixture must include both face/gusset joins");
});
