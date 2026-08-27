import * as THREE from "three";
import type { FlatSheetSpec } from "@/types/configurator";
import { deriveFlatSheetGeometry } from "./flat-sheet";

export const SCENE_UNITS_PER_MM = 0.01;

export function flatSheetSceneDimensions(spec: FlatSheetSpec) {
  return {
    width: spec.trimWidthMm * SCENE_UNITS_PER_MM,
    height: spec.trimHeightMm * SCENE_UNITS_PER_MM,
    thickness: spec.previewThicknessMm * SCENE_UNITS_PER_MM,
  };
}

/** Canvas top-left millimetres to the corresponding point on the card face. */
export function artworkMmToCardPosition(
  spec: FlatSheetSpec,
  point: Readonly<{ x: number; y: number }>,
) {
  return {
    x:
      (point.x - spec.bleedMm - spec.trimWidthMm / 2) *
      SCENE_UNITS_PER_MM,
    y:
      (spec.trimHeightMm / 2 - (point.y - spec.bleedMm)) *
      SCENE_UNITS_PER_MM,
  };
}

/** Front geometry with explicit, upright 0..1 UVs (top-left = 0,1). */
export function createFlatSheetFrontGeometry(spec: FlatSheetSpec) {
  const { width, height } = flatSheetSceneDimensions(spec);
  const halfWidth = width / 2;
  const halfHeight = height / 2;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(
      [
        -halfWidth, halfHeight, 0,
        -halfWidth, -halfHeight, 0,
        halfWidth, -halfHeight, 0,
        -halfWidth, halfHeight, 0,
        halfWidth, -halfHeight, 0,
        halfWidth, halfHeight, 0,
      ],
      3,
    ),
  );
  geometry.setAttribute(
    "normal",
    new THREE.Float32BufferAttribute(Array.from({ length: 6 }, () => [0, 0, 1]).flat(), 3),
  );
  geometry.setAttribute(
    "uv",
    new THREE.Float32BufferAttribute(
      [0, 1, 0, 0, 1, 0, 0, 1, 1, 0, 1, 1],
      2,
    ),
  );
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

/** Restricts the live full-bleed canvas texture to the finished trim window. */
export function configureFlatSheetPreviewTexture(
  texture: THREE.CanvasTexture,
  spec: FlatSheetSpec,
) {
  const crop = deriveFlatSheetGeometry(spec).previewUvCrop;
  texture.offset.set(crop.x, crop.y);
  texture.repeat.set(crop.width, crop.height);
  texture.center.set(0, 0);
  texture.rotation = 0;
  texture.needsUpdate = true;
  return texture;
}
