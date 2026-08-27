"use client";

import { useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { ProductConfig } from "@/types/configurator";
import {
  configureFlatSheetPreviewTexture,
  createFlatSheetFrontGeometry,
  flatSheetSceneDimensions,
} from "@/lib/configurator/flat-sheet-mesh";

type FlatSheetModelProps = {
  config: ProductConfig;
  textures: Record<string, THREE.CanvasTexture | null>;
  consumeDirty: (surfaceId: string) => boolean;
  onSurfaceClick?: (surfaceId: string) => void;
};

export function FlatSheetModel({
  config,
  textures,
  consumeDirty,
  onSurfaceClick,
}: FlatSheetModelProps) {
  const spec = config.flatSheetSpec;
  if (!spec) throw new Error(`Flat-sheet product ${config.id} has no physical specification.`);
  const surfaceId = config.editableSurfaces[0]?.id ?? "front";
  const texture = textures[surfaceId] ?? null;
  const dimensions = useMemo(() => flatSheetSceneDimensions(spec), [spec]);
  const frontGeometry = useMemo(() => createFlatSheetFrontGeometry(spec), [spec]);
  const bodyGeometry = useMemo(
    () => new THREE.BoxGeometry(dimensions.width, dimensions.height, dimensions.thickness),
    [dimensions],
  );
  const bodyMaterial = useMemo(
    () => new THREE.MeshStandardMaterial({
      name: "KraftCardstock",
      color: 0xa97943,
      roughness: 0.9,
      metalness: 0,
    }),
    [],
  );
  const frontMaterial = useMemo(
    () => new THREE.MeshStandardMaterial({
      name: `FlatSheetPrint:${surfaceId}`,
      color: 0xffffff,
      roughness: 0.82,
      metalness: 0,
      side: THREE.FrontSide,
      map: texture,
    }),
    [surfaceId, texture],
  );

  useEffect(() => {
    if (texture) configureFlatSheetPreviewTexture(texture, spec);
  }, [spec, texture]);

  useEffect(() => () => {
    frontGeometry.dispose();
    bodyGeometry.dispose();
    bodyMaterial.dispose();
    frontMaterial.dispose();
  }, [bodyGeometry, bodyMaterial, frontGeometry, frontMaterial]);

  /* eslint-disable react-hooks/immutability */
  useFrame(() => {
    if (texture && consumeDirty(surfaceId)) texture.needsUpdate = true;
  });
  /* eslint-enable react-hooks/immutability */

  const handlePointerDown = (event: { stopPropagation: () => void }) => {
    if (!onSurfaceClick) return;
    event.stopPropagation();
    onSurfaceClick(surfaceId);
  };

  return (
    <group
      name="FLAT_SHEET_ROOT"
      position={[0, config.modelYOffset ?? 0, 0]}
      rotation={config.modelRotation ?? [0, 0, 0]}
    >
      <mesh geometry={bodyGeometry} material={bodyMaterial} castShadow receiveShadow />
      <mesh
        name="FRONT_PRINT"
        geometry={frontGeometry}
        material={frontMaterial}
        position={[0, 0, dimensions.thickness / 2 + 0.00005]}
        onPointerDown={handlePointerDown}
      />
    </group>
  );
}
