/**
 * Verifies /public/models/bottle.glb satisfies the Blender-to-Web contract (§34)
 * by parsing the GLB JSON chunk directly — no DOM/loader shims required.
 *
 * Run: node scripts/validate-bottle-glb.mjs
 */
import fs from "node:fs";
import path from "node:path";

const REQUIRED_MESHES = ["BODY", "CAP", "PRINT_AREA"];
const UV_REQUIRED = ["PRINT_AREA"];

const file = path.join(process.cwd(), "public", "models", "bottle.glb");
if (!fs.existsSync(file)) {
  console.error(`FAIL: ${file} does not exist. Run: node scripts/generate-bottle-glb.mjs`);
  process.exit(1);
}

const buf = fs.readFileSync(file);
if (buf.readUInt32LE(0) !== 0x46546c67) {
  console.error("FAIL: not a GLB (bad magic).");
  process.exit(1);
}

// chunk 0 is always JSON
const jsonLength = buf.readUInt32LE(12);
const json = JSON.parse(buf.subarray(20, 20 + jsonLength).toString("utf8"));

const nodeNames = (json.nodes ?? []).map((n) => n.name);
const materialNames = (json.materials ?? []).map((m) => m.name);
const failures = [];

for (const name of REQUIRED_MESHES) {
  if (!nodeNames.includes(name)) failures.push(`missing required node "${name}"`);
}

// UV presence: node -> mesh -> primitive.attributes.TEXCOORD_0
for (const name of UV_REQUIRED) {
  const node = (json.nodes ?? []).find((n) => n.name === name);
  if (!node || node.mesh === undefined) continue;
  const prims = json.meshes[node.mesh].primitives ?? [];
  const hasUv = prims.every((p) => p.attributes.TEXCOORD_0 !== undefined);
  if (!hasUv) failures.push(`"${name}" has no TEXCOORD_0 (UV) attribute`);

  // UVs must occupy 0..1 without overlap-by-tiling
  for (const p of prims) {
    const acc = json.accessors[p.attributes.TEXCOORD_0];
    const [minU, minV] = acc.min ?? [];
    const [maxU, maxV] = acc.max ?? [];
    if (minU < -0.001 || minV < -0.001 || maxU > 1.001 || maxV > 1.001) {
      failures.push(
        `"${name}" UVs outside 0..1 (u ${minU}..${maxU}, v ${minV}..${maxV})`,
      );
    }
  }
}

let tris = 0;
for (const mesh of json.meshes ?? []) {
  for (const p of mesh.primitives ?? []) {
    if (p.indices !== undefined) tris += json.accessors[p.indices].count / 3;
  }
}

console.log("nodes:      ", nodeNames.join(", "));
console.log("materials:  ", materialNames.join(", "));
console.log("triangles:  ", tris);
for (const name of UV_REQUIRED) {
  const node = (json.nodes ?? []).find((n) => n.name === name);
  if (node?.mesh === undefined) continue;
  const acc = json.accessors[json.meshes[node.mesh].primitives[0].attributes.TEXCOORD_0];
  console.log(`${name} UV range: u ${acc.min[0]}..${acc.max[0]}  v ${acc.min[1]}..${acc.max[1]}`);
}

if (failures.length) {
  console.error("\nFAIL:");
  failures.forEach((f) => console.error("  - " + f));
  process.exit(1);
}
console.log("\nPASS: bottle.glb satisfies the Blender-to-Web contract.");
