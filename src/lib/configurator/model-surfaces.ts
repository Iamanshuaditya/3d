import * as THREE from "three";
import type { EditableSurface } from "@/types/configurator";

export function meshNamesFor(surface: EditableSurface) {
  return surface.meshNames?.length ? surface.meshNames : [surface.meshName];
}

/** glTF splits a Blender object with several materials into child primitives. */
export function editableMeshes(scene: THREE.Object3D, surface: EditableSurface): THREE.Mesh[] {
  const meshes = new Set<THREE.Mesh>();
  for (const name of meshNamesFor(surface)) {
    scene.getObjectByName(name)?.traverse((object) => {
      if (object instanceof THREE.Mesh) meshes.add(object);
    });
  }
  return [...meshes];
}

/** Only the authored shape key changes; UVs and the object's transform stay fixed. */
export function applyInflation(scene: THREE.Object3D, targetName: string, value: number) {
  const amount = Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 1;
  scene.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const index = object.morphTargetDictionary?.[targetName];
    if (index !== undefined && object.morphTargetInfluences) {
      object.morphTargetInfluences[index] = amount;
    }
  });
}
