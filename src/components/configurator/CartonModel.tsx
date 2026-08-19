"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { CartonSpec } from "@/types/carton";
import type { ProductConfig } from "@/types/configurator";
import { applyFold, buildCartonTree } from "@/lib/configurator/carton-geometry";

type CartonModelProps = {
  spec: CartonSpec;
  config: ProductConfig;
  textures: Record<string, THREE.CanvasTexture | null>;
  consumeDirty: (surfaceId: string) => boolean;
  /** 0 = flat dieline, 1 = assembled. */
  fold: number;
  /** 0 = lid closed, 1 = lid open. */
  lidOpen: number;
  onSurfaceClick?: (surfaceId: string) => void;
};

function seededNoise(index: number): number {
  const value = Math.sin(index * 12.9898 + 78.233) * 43758.5453;
  return value - Math.floor(value);
}

export function CartonModel({
  spec,
  config,
  textures,
  consumeDirty,
  fold,
  lidOpen,
  onSurfaceClick,
}: CartonModelProps) {
  const surfaceId = config.editableSurfaces[0]?.id ?? "outside";
  const texture = textures[surfaceId] ?? null;

  /**
   * The generated panels have distinct printed, inner-board and exposed-edge
   * meshes. The front and rear faces may be double-sided for fold animation,
   * but the opaque inner mesh sits in front when the carton is viewed open, so
   * uploaded artwork never appears mirrored on the food-contact surface.
   */
  const isKraft = config.materialProfile === "kraft-corrugated";

  const materials = useMemo(() => {
    /**
     * Procedural board textures for the kraft profile. Paper fibre grain
     * (bump + roughness variation) and a corrugation flute pattern for cut
     * edges are what make cardboard read as cardboard instead of plastic.
     */
    const makeGrain = () => {
      const size = 256;
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = size;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#808080";
      ctx.fillRect(0, 0, size, size);
      for (let i = 0; i < 6500; i += 1) {
        const v = 108 + Math.floor(seededNoise(i * 4) * 40);
        ctx.fillStyle = `rgb(${v},${v},${v})`;
        ctx.fillRect(
          seededNoise(i * 4 + 1) * size,
          seededNoise(i * 4 + 2) * size,
          1 + seededNoise(i * 4 + 3) * 2.5,
          1,
        );
      }
      for (let i = 0; i < 260; i += 1) {
        const offset = 26000 + i * 4;
        const v = 116 + Math.floor(seededNoise(offset) * 24);
        ctx.strokeStyle = `rgba(${v},${v},${v},0.5)`;
        const y = seededNoise(offset + 1) * size;
        ctx.beginPath();
        ctx.moveTo(seededNoise(offset + 2) * size, y);
        ctx.lineTo(seededNoise(offset + 3) * size, y + (seededNoise(offset + 4) - 0.5) * 3);
        ctx.stroke();
      }
      const texture = new THREE.CanvasTexture(canvas);
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(3, 3);
      return texture;
    };
    const makeFlute = () => {
      const canvas = document.createElement("canvas");
      canvas.width = 128;
      canvas.height = 16;
      const ctx = canvas.getContext("2d")!;
      for (let x = 0; x < 128; x += 1) {
        const wave = 0.5 + 0.5 * Math.sin((x / 128) * Math.PI * 20);
        const r = 176 + wave * 46;
        ctx.fillStyle = `rgb(${r | 0},${(r * 0.82) | 0},${(r * 0.6) | 0})`;
        ctx.fillRect(x, 0, 1, 16);
      }
      const texture = new THREE.CanvasTexture(canvas);
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(10, 1);
      return texture;
    };
    const grain = isKraft ? makeGrain() : null;

    const outer = new THREE.MeshPhysicalMaterial({
      name: "CartonOuter",
      // Slightly below white for kraft so the studio environment cannot blow
      // the lid out to cream; printed artwork still reads true.
      color: isKraft ? 0xece4d6 : 0xffffff,
      roughness: isKraft ? 0.78 : 0.58,
      metalness: 0,
      clearcoat: isKraft ? 0.04 : 0.2,
      clearcoatRoughness: 0.5,
      side: THREE.DoubleSide,
      // Unprinted areas of the dieline are transparent on the canvas. Without
      // this the material ignores alpha and renders them as black RGB; with it,
      // bare areas reveal the white board underneath, which is what real
      // partially-printed packaging looks like.
      transparent: true,
      alphaTest: 0.01,
      ...(grain ? { bumpMap: grain, bumpScale: 0.35, roughnessMap: grain } : {}),
    });
    const inner = new THREE.MeshStandardMaterial({
      name: "CartonInner",
      color: isKraft ? 0xcdb185 : 0xf1eee6,
      roughness: 0.96,
      metalness: 0,
      side: THREE.DoubleSide,
      ...(grain ? { bumpMap: grain, bumpScale: 0.3 } : {}),
    });
    const edge = new THREE.MeshStandardMaterial({
      name: "CartonBoardEdge",
      color: isKraft ? 0xf2e3c8 : 0xd8d0be,
      roughness: 1,
      metalness: 0,
      side: THREE.DoubleSide,
      ...(isKraft ? { map: makeFlute() } : {}),
    });
    return { outer, inner, edge };
  }, [isKraft]);

  const tree = useMemo(
    () => buildCartonTree(spec, materials.outer, materials.inner, materials.edge),
    [spec, materials],
  );

  // Bind the live design texture to the printed face. Assigning `map` mutates
  // an externally-owned three.js material, which the React Compiler cannot know
  // is the required idiom here.
  /* eslint-disable react-hooks/immutability */
  useEffect(() => {
    if (materials.outer.map !== texture) {
      materials.outer.map = texture;
      materials.outer.needsUpdate = true;
    }
  }, [texture, materials]);
  /* eslint-enable react-hooks/immutability */

  useEffect(() => {
    return () => {
      tree.dispose();
      materials.outer.dispose();
      materials.inner.dispose();
      materials.edge.dispose();
    };
  }, [tree, materials]);

  // Smoothly ease toward the requested fold / lid state.
  const current = useRef({ fold: 1, lid: 0 });

  useFrame((_, delta) => {
    const k = Math.min(1, delta * 4.5);
    current.current.fold += (fold - current.current.fold) * k;
    current.current.lid += (lidOpen - current.current.lid) * k;
    applyFold(tree, spec, current.current.fold, current.current.lid);

    /* eslint-disable react-hooks/immutability */
    if (texture && consumeDirty(surfaceId)) {
      texture.needsUpdate = true;
    }
    /* eslint-enable react-hooks/immutability */
  });

  return (
    <primitive
      object={tree.root}
      position={[0, config.modelYOffset ?? 0, 0]}
      onPointerDown={(e: { stopPropagation: () => void }) => {
        if (!onSurfaceClick) return;
        e.stopPropagation();
        onSurfaceClick(surfaceId);
      }}
    />
  );
}
