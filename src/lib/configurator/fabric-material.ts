import * as THREE from "three";

/**
 * Cotton-jersey material response.
 *
 * A garment is not packaging: it has almost no specular lobe, a visible weave
 * at close range, and a soft grazing-angle sheen from the fibre nap. Three.js
 * exposes that last one directly (`sheen`, the Charlie/Estevez-Kulla lobe used
 * for cloth), which is what stops a white T-shirt reading as white plastic.
 *
 * Embroidery rides on top through the normal and roughness maps: the weave is
 * a repeating BUMP map, so the tangent-space normal slot stays free for the
 * stitching, and the two combine rather than compete.
 */

function seeded(index: number): number {
  const value = Math.sin(index * 12.9898 + 78.233) * 43758.5453;
  return value - Math.floor(value);
}

/** One plain-weave cell, tiled across the garment. */
export function createWeaveBumpTexture(repeat = 220): THREE.CanvasTexture {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const context = canvas.getContext("2d")!;
  context.fillStyle = "#808080";
  context.fillRect(0, 0, size, size);

  const cell = size / 8;
  for (let row = 0; row < 8; row += 1) {
    for (let column = 0; column < 8; column += 1) {
      // Over-under alternation: the classic plain weave, with a little
      // per-cell variation so it does not read as a checkerboard.
      const over = (row + column) % 2 === 0;
      const jitter = seeded(row * 8 + column) * 18;
      const value = Math.round((over ? 150 : 108) + jitter);
      context.fillStyle = `rgb(${value},${value},${value})`;
      context.fillRect(column * cell, row * cell, cell, cell);
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeat, repeat);
  texture.colorSpace = THREE.NoColorSpace;
  return texture;
}

export type FabricMaterialOptions = {
  name: string;
  colour?: number;
  /** Design artwork; absent for the parts of the garment nobody prints on. */
  map?: THREE.Texture | null;
  /** Embroidery relief. Absent means the panel is flat cloth. */
  normalMap?: THREE.Texture | null;
  roughnessMap?: THREE.Texture | null;
  weave: THREE.Texture;
  /** Peak relief of the stitching, in tangent-space units. */
  reliefScale?: number;
};

export function createFabricMaterial(options: FabricMaterialOptions) {
  const material = new THREE.MeshPhysicalMaterial({
    name: options.name,
    color: options.colour ?? 0xffffff,
    roughness: 0.94,
    metalness: 0,
    // Cloth sheen: broad and deliberately low. Measured against a crimson
    // test logo, sheen above ~0.15 lifts the thread's green channel by 25
    // levels — the difference between crimson and pink — for very little
    // added cloth character. Same reason envMapIntensity stays well under 1.
    sheen: 0.1,
    sheenRoughness: 0.78,
    sheenColor: new THREE.Color(0xfff6ec),
    envMapIntensity: 0.25,
    bumpMap: options.weave,
    bumpScale: 0.06,
    side: THREE.DoubleSide,
  });
  if (options.map) material.map = options.map;
  if (options.normalMap) {
    material.normalMap = options.normalMap;
    const relief = options.reliefScale ?? 1;
    material.normalScale = new THREE.Vector2(relief, relief);
  }
  if (options.roughnessMap) material.roughnessMap = options.roughnessMap;
  return material;
}
