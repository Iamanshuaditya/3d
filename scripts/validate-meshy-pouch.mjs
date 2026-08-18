import fs from "node:fs";
import path from "node:path";

const file = path.resolve(
  process.cwd(),
  process.argv[2] ?? "public/models/meshy-stand-up-pouch-print-ready.glb",
);
const expectedMeshes = ["FRONT_PRINT", "BACK_PRINT", "BOTTOM_PRINT"];
const expectedUvSlots = {
  FRONT_PRINT: [2 / 574, 242 / 574],
  BOTTOM_PRINT: [242 / 574, 332 / 574],
  BACK_PRINT: [332 / 574, 572 / 574],
};
const buffer = fs.readFileSync(file);
if (buffer.readUInt32LE(0) !== 0x46546c67) throw new Error("Not a GLB file");
const jsonLength = buffer.readUInt32LE(12);
const gltf = JSON.parse(buffer.subarray(20, 20 + jsonLength).toString("utf8"));
const failures = [];
let triangles = 0;

for (const meshName of expectedMeshes) {
  const node = gltf.nodes?.find((candidate) => candidate.name === meshName);
  if (!node || node.mesh === undefined) {
    failures.push(`Missing named print mesh ${meshName}`);
    continue;
  }
  const primitives = gltf.meshes?.[node.mesh]?.primitives ?? [];
  if (primitives.length !== 1) failures.push(`${meshName} must contain exactly one primitive`);
  for (const primitive of primitives) {
    const uvIndex = primitive.attributes?.TEXCOORD_0;
    if (uvIndex === undefined) {
      failures.push(`${meshName} has no TEXCOORD_0`);
    } else {
      const uv = gltf.accessors[uvIndex];
      if (
        uv.min?.[0] < -0.0001 ||
        uv.min?.[1] < -0.0001 ||
        uv.max?.[0] > 1.0001 ||
        uv.max?.[1] > 1.0001
      ) {
        failures.push(`${meshName} UVs are outside 0–1`);
      }
      const [slotMin, slotMax] = expectedUvSlots[meshName];
      if (uv.min?.[0] < slotMin - 0.0001 || uv.max?.[0] > slotMax + 0.0001) {
        failures.push(
          `${meshName} leaks outside its production-web slot ` +
            `(${uv.min?.[0]}..${uv.max?.[0]}, expected ${slotMin}..${slotMax})`,
        );
      }
    }
    if (primitive.indices === undefined) failures.push(`${meshName} is not indexed`);
    else triangles += gltf.accessors[primitive.indices].count / 3;
  }
}

if (triangles !== 440191) {
  failures.push(`Triangle preservation failed: expected 440191, found ${triangles}`);
}

if (failures.length) {
  console.error("FAIL");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(`PASS: ${expectedMeshes.join(", ")}`);
console.log(`PASS: ${triangles} source triangles preserved`);
console.log("PASS: every print surface has bounded 0–1 UV coordinates");
