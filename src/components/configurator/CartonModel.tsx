"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { CartonSpec } from "@/types/carton";
import type { ProductConfig } from "@/types/configurator";
import type { HingeAngles } from "@/types/unfold";
import {
  applyHingeAngles,
  buildCartonTree,
  setDielineView,
  type CartonTree,
} from "@/lib/configurator/carton-geometry";
import { stepPose } from "@/lib/configurator/hinge-animation";
import { resolveStructuralCarton } from "@/lib/configurator/structural-carton";
import {
  applyStructuralHingeAngles,
  createStructuralTree,
  type StructuralTree,
} from "@/lib/structure";

type CartonModelProps = {
  spec: CartonSpec;
  config: ProductConfig;
  textures: Record<string, THREE.CanvasTexture | null>;
  consumeDirty: (surfaceId: string) => boolean;
  hingeAngles?: HingeAngles;
  dielineView?: boolean;
  onSurfaceClick?: (surfaceId: string) => void;
};

const EMPTY_POSE: HingeAngles = {};

function seededNoise(index: number): number {
  const value = Math.sin(index * 12.9898 + 78.233) * 43758.5453;
  return value - Math.floor(value);
}

type RuntimeTree =
  | Readonly<{ kind: "legacy"; tree: CartonTree }>
  | Readonly<{ kind: "structural"; tree: StructuralTree }>;

function runtimeJoints(runtime: RuntimeTree) {
  return runtime.kind === "structural"
    ? runtime.tree.hinges.map((hinge) => ({
        id: hinge.id,
        restAngleDeg: hinge.assembledAngleDeg,
      }))
    : runtime.tree.hinges.map((hinge) => ({ id: hinge.id, restAngleDeg: hinge.angleDeg }));
}

function applyRuntimePose(runtime: RuntimeTree, pose: Record<string, number>) {
  if (runtime.kind === "structural") applyStructuralHingeAngles(runtime.tree, pose);
  else applyHingeAngles(runtime.tree, pose);
}

function setRuntimeDielineView(runtime: RuntimeTree, enabled: boolean) {
  if (runtime.kind === "legacy") setDielineView(runtime.tree, enabled);
  // Exact structural meshes already share one canonical geometry in flat and
  // folded states. Never swap/rebuild geometry for a terminal flat frame.
}

export function CartonModel({
  spec,
  config,
  textures,
  consumeDirty,
  hingeAngles = EMPTY_POSE,
  dielineView = false,
  onSurfaceClick,
}: CartonModelProps) {
  const surfaceId = config.editableSurfaces[0]?.id ?? "outside";
  const texture = textures[surfaceId] ?? null;
  const isKraft = config.materialProfile === "kraft-corrugated";

  const materials = useMemo(() => {
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
      color: isKraft ? 0xece4d6 : 0xffffff,
      roughness: isKraft ? 0.78 : 0.58,
      metalness: 0,
      clearcoat: isKraft ? 0.04 : 0.2,
      clearcoatRoughness: 0.5,
      side: THREE.DoubleSide,
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

  const runtime = useMemo<RuntimeTree>(() => {
    const structural = resolveStructuralCarton(spec);
    if (structural) {
      const tree = createStructuralTree(
        structural.dieline,
        structural.panels,
        structural.rig,
        [materials.outer, materials.inner, materials.edge],
      );
      return { kind: "structural", tree };
    }
    return {
      kind: "legacy",
      tree: buildCartonTree(spec, materials.outer, materials.inner, materials.edge),
    };
  }, [spec, materials]);

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
      runtime.tree.dispose();
      materials.outer.dispose();
      materials.inner.dispose();
      materials.edge.dispose();
    };
  }, [runtime, materials]);

  const poseRef = useRef<Record<string, number>>({});
  useEffect(() => {
    poseRef.current = {};
  }, [runtime]);

  const [reducedMotion, setReducedMotion] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  useFrame((_, delta) => {
    const pose = poseRef.current;
    const maxDeviation = stepPose(
      pose,
      runtimeJoints(runtime),
      hingeAngles,
      delta,
      reducedMotion,
    );
    applyRuntimePose(runtime, pose);
    setRuntimeDielineView(runtime, dielineView && maxDeviation < 6);

    /* eslint-disable react-hooks/immutability */
    if (texture && consumeDirty(surfaceId)) texture.needsUpdate = true;
    /* eslint-enable react-hooks/immutability */
  });

  return (
    <primitive
      object={runtime.tree.root}
      position={[0, config.modelYOffset ?? 0, 0]}
      onPointerDown={(e: { stopPropagation: () => void }) => {
        if (!onSurfaceClick) return;
        e.stopPropagation();
        onSurfaceClick(surfaceId);
      }}
    />
  );
}
