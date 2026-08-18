import fs from "node:fs";
import path from "node:path";

const sourcePath = path.resolve(
  process.cwd(),
  process.argv[2] ?? "public/models/Meshy_AI_A_stand_up_pouch_pack_0106083317_texture.glb",
);
const outputPath = path.resolve(
  process.cwd(),
  process.argv[3] ?? "public/models/meshy-stand-up-pouch-print-ready.glb",
);

const source = fs.readFileSync(sourcePath);
if (source.readUInt32LE(0) !== 0x46546c67) throw new Error("Source is not a GLB");

const jsonLength = source.readUInt32LE(12);
const gltf = JSON.parse(source.subarray(20, 20 + jsonLength).toString("utf8"));
const binaryHeaderOffset = 20 + jsonLength;
const binaryLength = source.readUInt32LE(binaryHeaderOffset);
const binary = source.subarray(binaryHeaderOffset + 8, binaryHeaderOffset + 8 + binaryLength);

const primitive = gltf.meshes?.[0]?.primitives?.[0];
if (!primitive) throw new Error("Expected one source mesh primitive");

const componentReaders = {
  5121: { bytes: 1, read: (buffer, offset) => buffer.readUInt8(offset) },
  5123: { bytes: 2, read: (buffer, offset) => buffer.readUInt16LE(offset) },
  5125: { bytes: 4, read: (buffer, offset) => buffer.readUInt32LE(offset) },
  5126: { bytes: 4, read: (buffer, offset) => buffer.readFloatLE(offset) },
};
const typeSize = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };

function readAccessor(index) {
  const accessor = gltf.accessors[index];
  const view = gltf.bufferViews[accessor.bufferView];
  const reader = componentReaders[accessor.componentType];
  const components = typeSize[accessor.type];
  if (!reader || !components) throw new Error(`Unsupported accessor ${index}`);
  const stride = view.byteStride ?? reader.bytes * components;
  const start = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const values = new Array(accessor.count);
  for (let item = 0; item < accessor.count; item += 1) {
    const offset = start + item * stride;
    if (components === 1) {
      values[item] = reader.read(binary, offset);
      continue;
    }
    values[item] = Array.from(
      { length: components },
      (_, component) => reader.read(binary, offset + component * reader.bytes),
    );
  }
  return values;
}

const positions = readAccessor(primitive.attributes.POSITION);
const normals = readAccessor(primitive.attributes.NORMAL);
const indices = readAccessor(primitive.indices);
const positionAccessor = gltf.accessors[primitive.attributes.POSITION];
const [minX, minY, minZ] = positionAccessor.min;
const [maxX, maxY, maxZ] = positionAccessor.max;
const spanX = maxX - minX;
const spanY = maxY - minY;
const spanZ = maxZ - minZ;
// One continuous production web, matching the existing pouch configurator:
// bleed | front panel | bottom gusset | back panel | bleed.
const bleedMm = 2;
const panelHeightMm = 240;
const gussetMm = 90;
const totalWebMm = bleedMm * 2 + panelHeightMm * 2 + gussetMm;
const frontStartMm = bleedMm;
const bottomStartMm = frontStartMm + panelHeightMm;
const backStartMm = bottomStartMm + gussetMm;

const regions = {
  front: { meshName: "FRONT_PRINT", positions: [], normals: [], uvs: [], indices: [], sourceVertices: new Map() },
  back: { meshName: "BACK_PRINT", positions: [], normals: [], uvs: [], indices: [], sourceVertices: new Map() },
  bottom: { meshName: "BOTTOM_PRINT", positions: [], normals: [], uvs: [], indices: [], sourceVertices: new Map() },
};

function projectedUv(regionName, [x, y, z]) {
  if (regionName === "front") {
    return [
      (frontStartMm + ((y - minY) / spanY) * panelHeightMm) / totalWebMm,
      1 - (x - minX) / spanX,
    ];
  }
  if (regionName === "back") {
    return [
      (backStartMm + ((maxY - y) / spanY) * panelHeightMm) / totalWebMm,
      1 - (x - minX) / spanX,
    ];
  }
  return [
    (bottomStartMm + ((maxZ - z) / spanZ) * gussetMm) / totalWebMm,
    1 - (x - minX) / spanX,
  ];
}

function addVertex(regionName, sourceIndex) {
  const region = regions[regionName];
  const existing = region.sourceVertices.get(sourceIndex);
  if (existing !== undefined) return existing;
  const next = region.positions.length / 3;
  const position = positions[sourceIndex];
  region.positions.push(...position);
  region.normals.push(...normals[sourceIndex]);
  region.uvs.push(...projectedUv(regionName, position));
  region.sourceVertices.set(sourceIndex, next);
  return next;
}

const classification = {
  positionFront: 0,
  normalFront: 0,
  positionNormalDisagreements: 0,
};

for (let offset = 0; offset < indices.length; offset += 3) {
  const ia = indices[offset];
  const ib = indices[offset + 1];
  const ic = indices[offset + 2];
  const a = positions[ia];
  const b = positions[ib];
  const c = positions[ic];
  const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const faceNormal = [
    ab[1] * ac[2] - ab[2] * ac[1],
    ab[2] * ac[0] - ab[0] * ac[2],
    ab[0] * ac[1] - ab[1] * ac[0],
  ];
  const centroidY = (a[1] + b[1] + c[1]) / 3;
  const centroidZ = (a[2] + b[2] + c[2]) / 3;
  const [faceX, faceY, faceZ] = faceNormal.map(Math.abs);
  const averageNormalY = (normals[ia][1] + normals[ib][1] + normals[ic][1]) / 3;
  const averageNormalZ = (normals[ia][2] + normals[ib][2] + normals[ic][2]) / 3;

  // Only the downward-facing geometry in the lower 22% is the gusset. Front
  // wrinkles that reach the floor stay on the front/back artwork rather than
  // tearing across to the bottom canvas.
  const isBottom =
    centroidY < minY + spanY * 0.22 &&
    faceY > faceZ * 0.7 &&
    faceY > faceX * 0.55 &&
    averageNormalY < -0.08;

  // Surface position is not a reliable front/back discriminator on a deeply
  // wrinkled pouch: folds can cross the centre plane. The exported outward
  // normal is authoritative about which side a triangle faces. Position is
  // used only for near-edge triangles whose normal is almost perpendicular to
  // the viewer.
  const normalFront = Math.abs(averageNormalZ) > 0.035
    ? averageNormalZ > 0
    : centroidZ >= 0;
  if (centroidZ >= 0) classification.positionFront += 1;
  if (normalFront) classification.normalFront += 1;
  if ((centroidZ >= 0) !== normalFront) classification.positionNormalDisagreements += 1;

  const regionName = isBottom ? "bottom" : normalFront ? "front" : "back";
  const region = regions[regionName];
  region.indices.push(
    addVertex(regionName, ia),
    addVertex(regionName, ib),
    addVertex(regionName, ic),
  );
}

const binaryParts = [];
const bufferViews = [];
const accessors = [];
let binaryByteLength = 0;

function appendBuffer(buffer, target) {
  const padding = (4 - (binaryByteLength % 4)) % 4;
  if (padding) {
    binaryParts.push(Buffer.alloc(padding));
    binaryByteLength += padding;
  }
  const bufferView = bufferViews.length;
  bufferViews.push({ buffer: 0, byteOffset: binaryByteLength, byteLength: buffer.length, target });
  binaryParts.push(buffer);
  binaryByteLength += buffer.length;
  return bufferView;
}

function floatBuffer(values) {
  const result = Buffer.allocUnsafe(values.length * 4);
  values.forEach((value, index) => result.writeFloatLE(value, index * 4));
  return result;
}

function uintBuffer(values) {
  const result = Buffer.allocUnsafe(values.length * 4);
  values.forEach((value, index) => result.writeUInt32LE(value, index * 4));
  return result;
}

function vectorBounds(values, size) {
  const min = Array(size).fill(Infinity);
  const max = Array(size).fill(-Infinity);
  for (let index = 0; index < values.length; index += size) {
    for (let component = 0; component < size; component += 1) {
      min[component] = Math.min(min[component], values[index + component]);
      max[component] = Math.max(max[component], values[index + component]);
    }
  }
  return { min, max };
}

function addAccessor(values, type, target, includeBounds = false) {
  const components = typeSize[type];
  const buffer = target === 34963 ? uintBuffer(values) : floatBuffer(values);
  const bufferView = appendBuffer(buffer, target);
  const accessor = {
    bufferView,
    componentType: target === 34963 ? 5125 : 5126,
    count: values.length / components,
    type,
  };
  if (includeBounds) Object.assign(accessor, vectorBounds(values, components));
  const index = accessors.length;
  accessors.push(accessor);
  return index;
}

const regionEntries = Object.entries(regions);
const meshes = regionEntries.map(([regionName, region], materialIndex) => ({
  name: region.meshName,
  primitives: [{
    attributes: {
      POSITION: addAccessor(region.positions, "VEC3", 34962, true),
      NORMAL: addAccessor(region.normals, "VEC3", 34962),
      TEXCOORD_0: addAccessor(region.uvs, "VEC2", 34962, true),
    },
    indices: addAccessor(region.indices, "SCALAR", 34963),
    material: materialIndex,
    mode: 4,
  }],
  extras: { printSurface: regionName },
}));

const outputJson = {
  asset: {
    version: "2.0",
    generator: "Nexibles print-ready pouch UV pipeline",
    extras: {
      source: path.basename(sourcePath),
      mapping: "shared front/gusset/back production web UVs",
    },
  },
  scene: 0,
  scenes: [{ name: "Print-ready stand-up pouch", nodes: [0, 1, 2] }],
  nodes: regionEntries.map(([, region], mesh) => ({ name: region.meshName, mesh })),
  meshes,
  materials: regionEntries.map(([regionName]) => ({
    name: `Gloss laminate ${regionName}`,
    pbrMetallicRoughness: {
      baseColorFactor: [1, 1, 1, 1],
      metallicFactor: 0.04,
      roughnessFactor: 0.26,
    },
    doubleSided: true,
  })),
  accessors,
  bufferViews,
  buffers: [{ byteLength: binaryByteLength }],
};

const jsonBuffer = Buffer.from(JSON.stringify(outputJson));
const jsonPadding = (4 - (jsonBuffer.length % 4)) % 4;
const paddedJson = Buffer.concat([jsonBuffer, Buffer.alloc(jsonPadding, 0x20)]);
const rawBinary = Buffer.concat(binaryParts);
const binaryPadding = (4 - (rawBinary.length % 4)) % 4;
const paddedBinary = Buffer.concat([rawBinary, Buffer.alloc(binaryPadding)]);
const totalLength = 12 + 8 + paddedJson.length + 8 + paddedBinary.length;
const output = Buffer.allocUnsafe(totalLength);
output.writeUInt32LE(0x46546c67, 0);
output.writeUInt32LE(2, 4);
output.writeUInt32LE(totalLength, 8);
output.writeUInt32LE(paddedJson.length, 12);
output.writeUInt32LE(0x4e4f534a, 16);
paddedJson.copy(output, 20);
const binHeader = 20 + paddedJson.length;
output.writeUInt32LE(paddedBinary.length, binHeader);
output.writeUInt32LE(0x004e4942, binHeader + 4);
paddedBinary.copy(output, binHeader + 8);

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, output);

console.log(`Prepared ${outputPath}`);
for (const [name, region] of regionEntries) {
  console.log(
    `${name}: ${region.positions.length / 3} vertices, ${region.indices.length / 3} triangles`,
  );
}
console.log(`Size: ${(output.length / 1024 / 1024).toFixed(2)} MiB`);
console.log(
  `Normal-based correction: ${classification.positionNormalDisagreements} triangles ` +
    "crossed the centre-plane heuristic",
);
