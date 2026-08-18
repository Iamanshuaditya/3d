import fs from "node:fs";
import path from "node:path";

const input = process.argv[2];
if (!input) {
  console.error("Usage: node scripts/inspect-glb.mjs <model.glb>");
  process.exit(1);
}

const file = path.resolve(process.cwd(), input);
const buffer = fs.readFileSync(file);
if (buffer.readUInt32LE(0) !== 0x46546c67) {
  throw new Error(`${file} is not a GLB file`);
}

const jsonLength = buffer.readUInt32LE(12);
const gltf = JSON.parse(buffer.subarray(20, 20 + jsonLength).toString("utf8"));
const accessors = gltf.accessors ?? [];

const accessorSummary = (index) => {
  if (index === undefined) return null;
  const accessor = accessors[index];
  return {
    index,
    count: accessor?.count,
    type: accessor?.type,
    componentType: accessor?.componentType,
    min: accessor?.min,
    max: accessor?.max,
  };
};

console.log(JSON.stringify({
  file,
  bytes: buffer.length,
  asset: gltf.asset,
  extensionsUsed: gltf.extensionsUsed ?? [],
  extensionsRequired: gltf.extensionsRequired ?? [],
  scenes: gltf.scenes,
  nodes: (gltf.nodes ?? []).map((node, index) => ({
    index,
    name: node.name ?? "",
    mesh: node.mesh,
    children: node.children,
    translation: node.translation,
    rotation: node.rotation,
    scale: node.scale,
    matrix: node.matrix,
  })),
  meshes: (gltf.meshes ?? []).map((mesh, index) => ({
    index,
    name: mesh.name ?? "",
    primitives: (mesh.primitives ?? []).map((primitive, primitiveIndex) => ({
      primitiveIndex,
      mode: primitive.mode ?? 4,
      material: primitive.material,
      indices: accessorSummary(primitive.indices),
      attributes: Object.fromEntries(
        Object.entries(primitive.attributes ?? {}).map(([name, accessor]) => [
          name,
          accessorSummary(accessor),
        ]),
      ),
      targets: primitive.targets,
      extensions: primitive.extensions,
    })),
  })),
  materials: (gltf.materials ?? []).map((material, index) => ({
    index,
    name: material.name ?? "",
    pbrMetallicRoughness: material.pbrMetallicRoughness,
    normalTexture: material.normalTexture,
    occlusionTexture: material.occlusionTexture,
    emissiveTexture: material.emissiveTexture,
    alphaMode: material.alphaMode,
    doubleSided: material.doubleSided,
    extensions: material.extensions,
  })),
  textures: gltf.textures ?? [],
  images: (gltf.images ?? []).map((image, index) => ({
    index,
    name: image.name,
    mimeType: image.mimeType,
    uri: image.uri,
    bufferView: image.bufferView,
  })),
}, null, 2));
