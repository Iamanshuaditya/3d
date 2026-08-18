import * as THREE from "three";
import type { ProductConfig, ValidationResult } from "@/types/configurator";

/**
 * Checks a loaded GLB scene against its ProductConfig (§33).
 * Missing meshes must surface loudly rather than rendering an untextured product.
 */
export function validateProductModel(
  scene: THREE.Object3D,
  config: ProductConfig,
): ValidationResult {
  const errors: string[] = [];
  const foundMeshes: string[] = [];

  scene.traverse((obj) => {
    if ((obj as THREE.Mesh).isMesh) foundMeshes.push(obj.name);
  });

  for (const surface of config.editableSurfaces) {
    const meshNames = surface.meshNames?.length ? surface.meshNames : [surface.meshName];
    for (const meshName of meshNames) {
      const mesh = scene.getObjectByName(meshName) as THREE.Mesh | undefined;

      if (!mesh) {
        errors.push(
          `Expected editable mesh "${meshName}" (surface "${surface.id}") was not found.`,
        );
        continue;
      }

      if (!(mesh as THREE.Mesh).isMesh) {
        errors.push(`"${meshName}" exists but is not a mesh.`);
        continue;
      }

      if (!mesh.geometry?.getAttribute("uv")) {
        errors.push(`"${meshName}" has no UV coordinates — artwork cannot be mapped.`);
      }
    }
  }

  return { ok: errors.length === 0, errors, foundMeshes };
}

export type SceneDebugInfo = {
  name: string;
  type: string;
  materialName: string | null;
  hasUV: boolean;
  triangles: number;
  size: [number, number, number];
};

/** Scene-graph introspection for the developer debug panel (§35). */
export function inspectScene(scene: THREE.Object3D): SceneDebugInfo[] {
  const rows: SceneDebugInfo[] = [];
  const box = new THREE.Box3();
  const size = new THREE.Vector3();

  scene.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;

    const geometry = mesh.geometry;
    const index = geometry.getIndex();
    const position = geometry.getAttribute("position");
    const triangles = index ? index.count / 3 : position ? position.count / 3 : 0;

    box.setFromObject(mesh);
    box.getSize(size);

    const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;

    rows.push({
      name: mesh.name || "(unnamed)",
      type: mesh.type,
      materialName: material?.name ?? null,
      hasUV: Boolean(geometry.getAttribute("uv")),
      triangles: Math.round(triangles),
      size: [
        Number(size.x.toFixed(3)),
        Number(size.y.toFixed(3)),
        Number(size.z.toFixed(3)),
      ],
    });
  });

  return rows;
}
