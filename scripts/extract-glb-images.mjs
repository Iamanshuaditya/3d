import fs from "node:fs";
import path from "node:path";

const input = process.argv[2];
const outputDir = process.argv[3] ?? "./tmp/glb-images";
if (!input) {
  console.error("Usage: node scripts/extract-glb-images.mjs <model.glb> [output-dir]");
  process.exit(1);
}

const source = fs.readFileSync(path.resolve(input));
const jsonLength = source.readUInt32LE(12);
const json = JSON.parse(source.subarray(20, 20 + jsonLength).toString("utf8"));
const binaryHeaderOffset = 20 + jsonLength;
const binaryLength = source.readUInt32LE(binaryHeaderOffset);
const binaryType = source.readUInt32LE(binaryHeaderOffset + 4);
if (binaryType !== 0x004e4942) throw new Error("GLB has no BIN chunk");
const binary = source.subarray(binaryHeaderOffset + 8, binaryHeaderOffset + 8 + binaryLength);

fs.mkdirSync(outputDir, { recursive: true });
for (const [index, image] of (json.images ?? []).entries()) {
  if (image.bufferView === undefined) continue;
  const view = json.bufferViews[image.bufferView];
  const start = view.byteOffset ?? 0;
  const extension = image.mimeType === "image/png" ? "png" : "jpg";
  const output = path.join(outputDir, `${index}-${image.name ?? "texture"}.${extension}`);
  fs.writeFileSync(output, binary.subarray(start, start + view.byteLength));
  console.log(output);
}
