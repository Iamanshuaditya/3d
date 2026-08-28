"use client";

import { useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { PouchSpec } from "@/types/pouch";
import type { ProductConfig } from "@/types/configurator";
import { buildPouchGeometry } from "@/lib/configurator/pouch-geometry";
import { solvePacdoraLabPouch } from "@/lib/pacdora-lab";
import { ProceduralPouchModel } from "./ProceduralPouchModel";

type PouchModelProps = {
  spec: PouchSpec;
  config: ProductConfig;
  textures: Record<string, THREE.CanvasTexture | null>;
  consumeDirty: (surfaceId: string) => boolean;
  onSurfaceClick?: (surfaceId: string) => void;
};

function ProfiledPouchModel({
  spec,
  config,
  textures,
  consumeDirty,
  onSurfaceClick,
}: PouchModelProps) {
  const surfaceId = config.editableSurfaces[0]?.id ?? "outside";
  const texture = textures[surfaceId] ?? null;

  const { geometry, size, surfaceGroups } = useMemo(() => buildPouchGeometry(spec), [spec]);

  /**
   * PET/EVOH laminate. The base coat carries the print while a restrained,
   * tighter clear coat supplies the moving edge highlights seen in the target
   * without bleaching artwork to white.
   */
  const material = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        name: "PouchLaminate",
        color: 0xffffff,
        roughness: 0.52,
        metalness: 0.0,
        clearcoat: 0.16,
        clearcoatRoughness: 0.42,
        sheen: 0.22,
        sheenRoughness: 0.5,
        sheenColor: new THREE.Color(0xffffff),
        ior: 1.47,
        // Toned down so panel edges and creases stay legible instead of the
        // studio environment washing the film to paper-white.
        envMapIntensity: 0.34,
        // Film is thin; double-sided rendering keeps every wall solid from
        // any orbit angle regardless of grid winding.
        side: THREE.DoubleSide,
      }),
    [],
  );

  // Assigning `map` mutates an externally-owned three.js material, which the
  // React Compiler cannot know is the required idiom here.
  /* eslint-disable react-hooks/immutability */
  useEffect(() => {
    if (material.map !== texture) {
      material.map = texture;
      material.needsUpdate = true;
    }
  }, [texture, material]);
  /* eslint-enable react-hooks/immutability */

  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );

  useFrame(() => {
    /* eslint-disable react-hooks/immutability */
    if (texture && consumeDirty(surfaceId)) {
      texture.needsUpdate = true;
    }
    /* eslint-enable react-hooks/immutability */
  });

  return (
    <mesh
      name="POUCH"
      geometry={geometry}
      material={material}
      castShadow
      receiveShadow
      userData={{ productionSurfaces: surfaceGroups ?? [] }}
      position={[0, config.modelYOffset ?? -size.height / 2, 0]}
      onPointerDown={(e: { stopPropagation: () => void }) => {
        if (!onSurfaceClick) return;
        e.stopPropagation();
        onSurfaceClick(surfaceId);
      }}
    />
  );
}

function CentreInflatedPouchModel({
  spec,
  config,
  textures,
  consumeDirty,
  onSurfaceClick,
}: PouchModelProps) {
  const procedural = spec.proceduralModel;
  if (!procedural) throw new Error(`Pouch ${spec.id} has no procedural model.`);
  const surfaceId = config.editableSurfaces[0]?.id ?? "outside";
  const texture = textures[surfaceId] ?? null;
  const solution = useMemo(
    () => solvePacdoraLabPouch({
      style: "stand-up",
      width: spec.width,
      height: spec.height,
      depth: procedural.targetDepthMm,
      materialId: procedural.materialId,
      inflation: procedural.inflation,
      endSealMm: procedural.endSealMm,
      backSealMm: procedural.backSealMm,
      gussetMm: spec.gusset,
      zipper: spec.resealableZip,
      hangHole: procedural.hangHole,
    }),
    [procedural, spec.gusset, spec.height, spec.resealableZip, spec.width],
  );

  return (
    <ProceduralPouchModel
      solution={solution}
      texture={texture}
      consumeDirty={() => consumeDirty(surfaceId)}
      position={[0, config.modelYOffset ?? 0, 0]}
      onSurfaceClick={onSurfaceClick ? () => onSurfaceClick(surfaceId) : undefined}
    />
  );
}

export function PouchModel(props: PouchModelProps) {
  return props.spec.proceduralModel
    ? <CentreInflatedPouchModel {...props} />
    : <ProfiledPouchModel {...props} />;
}
