"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useCubeTexture, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import type { ProductConfig, ValidationResult } from "@/types/configurator";
import { validateProductModel, inspectScene, type SceneDebugInfo } from "@/lib/configurator/model-validator";

type SurfaceTextures = Record<string, THREE.CanvasTexture | null>;

type ProductModelProps = {
  config: ProductConfig;
  textures: SurfaceTextures;
  /** Returns true once per changed frame; drives needsUpdate. */
  consumeDirty: (surfaceId: string) => boolean;
  onValidated: (result: ValidationResult, debug: SceneDebugInfo[]) => void;
  onSurfaceClick?: (surfaceId: string) => void;
  highlightedMeshName?: string | null;
  onMeshHover?: (meshName: string | null) => void;
  onMeshClick?: (meshName: string) => void;
};

const VISTAPRINT_POUCH_REFLECTION_FACES = Array(6).fill(
  "vistaprint-pouch-reflection.jpg",
) as [string, string, string, string, string, string];

function meshNamesFor(surface: ProductConfig["editableSurfaces"][number]) {
  return surface.meshNames?.length ? surface.meshNames : [surface.meshName];
}

export function ProductModel({
  config,
  textures,
  consumeDirty,
  onValidated,
  onSurfaceClick,
  highlightedMeshName = null,
  onMeshHover,
  onMeshClick,
}: ProductModelProps) {
  // Keep Draco decoding local so production does not depend on Google's CDN.
  const { scene } = useGLTF(config.modelUrl, "/draco/");
  // This is the exact six-face strip-light cube used by Vistaprint's Vortex
  // renderer for this clear-barrier/gloss substrate. Their configuration points
  // all six faces at the same 512px image, so we intentionally do the same.
  const pouchReflectionMap = useCubeTexture(VISTAPRINT_POUCH_REFLECTION_FACES, {
    path: "/textures/",
  });

  // Clone so multiple mounts (or product switches) never mutate the cached GLB.
  const model = useMemo(() => scene.clone(true), [scene]);

  const meshMaterials = useRef<
    Record<string, THREE.MeshPhongMaterial | THREE.MeshStandardMaterial>
  >({});

  useEffect(() => {
    const result = validateProductModel(model, config);
    onValidated(result, inspectScene(model));
  }, [model, config, onValidated]);

  /**
   * Creates the print material AND binds its texture in a single effect.
   *
   * These were previously split in two. Under StrictMode the create-effect runs
   * mount -> cleanup -> mount, so the second pass built fresh materials while
   * the bind-effect stayed put (its deps hadn't changed) and never attached a
   * map — leaving a permanently white label. Keeping both in one effect means
   * they can never desynchronize.
   */
  useEffect(() => {
    const created: THREE.Material[] = [];

    for (const surface of config.editableSurfaces) {
      const isPouch = config.materialProfile === "clear-barrier-gloss";
      const isGlossyLaminate = config.materialProfile === "glossy-laminate";
      const sharedMaterial = isPouch || isGlossyLaminate
        ? null
        : new THREE.MeshStandardMaterial({
              name: `PrintAreaMaterial:${surface.id}`,
              color: 0xffffff,
              roughness: 0.5,
              metalness: 0.0,
              transparent: true,
              // Transparent artwork must not punch a hole through the bottle behind it.
              depthWrite: false,
              polygonOffset: true,
              polygonOffsetFactor: -2,
              polygonOffsetUnits: -2,
              map: textures[surface.id] ?? null,
            });
      if (sharedMaterial) created.push(sharedMaterial);

      for (const meshName of meshNamesFor(surface)) {
        const mesh = model.getObjectByName(meshName) as THREE.Mesh | undefined;
        if (!mesh) continue;
        // Each pouch panel needs its own material instance. Vortex highlights
        // one `surfaceId` by tinting only that material; sharing one instance
        // would incorrectly turn front, gusset and back yellow together.
        const material = isPouch
          ? new THREE.MeshPhongMaterial({
              name: `ClearBarrierGloss:${meshName}`,
              color: 0xffffff,
              map: textures[surface.id] ?? null,
              shininess: 100,
              specular: new THREE.Color(0x111111),
              reflectivity: 0.1,
              envMap: pouchReflectionMap,
              combine: THREE.MixOperation,
              emissive: new THREE.Color(0x000000),
              opacity: 1,
              transparent: true,
              side: THREE.FrontSide,
            })
          : isGlossyLaminate
            ? new THREE.MeshPhysicalMaterial({
                name: `GlossyLaminate:${meshName}`,
                color: 0xffffff,
                roughness: 0.27,
                metalness: 0.04,
                clearcoat: 0.78,
                clearcoatRoughness: 0.16,
                envMapIntensity: 0.9,
                side: THREE.DoubleSide,
                map: textures[surface.id] ?? null,
              })
          : sharedMaterial!;
        mesh.material = material;
        mesh.castShadow = true;
        mesh.receiveShadow = true;

        // The body uses transmission and both meshes share the origin, so
        // distance sorting between them is ambiguous. Pin the label on top.
        mesh.renderOrder = 10;
        if (
          material instanceof THREE.MeshPhongMaterial ||
          material instanceof THREE.MeshStandardMaterial
        ) {
          meshMaterials.current[meshName] = material;
          if (isPouch || isGlossyLaminate) created.push(material);
        }
      }
    }

    return () => {
      created.forEach((m) => m.dispose());
      meshMaterials.current = {};
    };
  }, [model, config, textures, pouchReflectionMap]);

  // Exact Vortex fallback highlight colour: new Color(1, 1, .3).
  useEffect(() => {
    for (const [meshName, material] of Object.entries(meshMaterials.current)) {
      material.color.setHex(meshName === highlightedMeshName ? 0xffff4d : 0xffffff);
    }
  }, [highlightedMeshName, model, textures]);

  // The live-preview heartbeat: upload only when the 2D canvas actually changed.
  // `needsUpdate` is three.js's required re-upload signal and must be written on
  // the texture instance itself; the React Compiler cannot know that a texture
  // passed via props is an externally-owned mutable GPU handle.
  /* eslint-disable react-hooks/immutability */
  useFrame(() => {
    for (const surface of config.editableSurfaces) {
      const texture = textures[surface.id];
      if (texture && consumeDirty(surface.id)) {
        texture.needsUpdate = true;
      }
    }
  });
  /* eslint-enable react-hooks/immutability */

  // Dispose cloned geometry on unmount to avoid GPU leaks (§38).
  useEffect(() => {
    const current = model;
    return () => {
      current.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.geometry?.dispose();
      });
    };
  }, [model]);

  return (
    <group
      position={[0, config.modelYOffset ?? 0, 0]}
      scale={config.modelScale ?? 1}
    >
      <primitive
        object={model}
        onPointerOver={(e: { object: THREE.Object3D; stopPropagation: () => void }) => {
          const surface = config.editableSurfaces.find((s) =>
            meshNamesFor(s).includes(e.object.name),
          );
          if (!surface) return;
          e.stopPropagation();
          onMeshHover?.(e.object.name);
        }}
        onPointerOut={(e: { object: THREE.Object3D; stopPropagation: () => void }) => {
          const surface = config.editableSurfaces.find((s) =>
            meshNamesFor(s).includes(e.object.name),
          );
          if (!surface) return;
          e.stopPropagation();
          onMeshHover?.(null);
        }}
        onPointerDown={(e: { object: THREE.Object3D; stopPropagation: () => void }) => {
          const surface = config.editableSurfaces.find((s) =>
            meshNamesFor(s).includes(e.object.name),
          );
          if (!surface) return;
          e.stopPropagation();
          onSurfaceClick?.(surface.id);
          onMeshClick?.(e.object.name);
        }}
      />
    </group>
  );
}

useGLTF.preload("/models/bottle.glb", "/draco/");
useGLTF.preload("/models/vistaprint-stand-up-pouch-3.25x4.75x2.glb", "/draco/");
useGLTF.preload(
  "/models/meshy-stand-up-pouch-print-ready.glb?uv=normals-v2",
  "/draco/",
);
