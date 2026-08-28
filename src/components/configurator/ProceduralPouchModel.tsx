"use client";

import { useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import {
  buildPacdoraLabPouchGeometry,
  getPacdoraLabStandUpHangHole,
  samplePacdoraLabStandUpSurface,
  type PouchLabSolution,
} from "@/lib/pacdora-lab";

const MM = 0.01;

function StandUpZipperRidge({
  solution,
  face,
  offsetMm,
}: {
  solution: PouchLabSolution;
  face: 1 | -1;
  offsetMm: number;
}) {
  const curve = useMemo(() => {
    const v = 1 - solution.input.endSealMm * 1.72 / solution.input.height;
    const points = Array.from({ length: 49 }, (_, index) => {
      const u = 0.055 + index / 48 * 0.89;
      const point = samplePacdoraLabStandUpSurface(solution, u, v, face);
      point.y += offsetMm * MM;
      point.z += face * 0.0048;
      return point;
    });
    return new THREE.CatmullRomCurve3(points);
  }, [face, offsetMm, solution]);

  return (
    <mesh castShadow>
      <tubeGeometry args={[curve, 64, 0.0065, 6, false]} />
      <meshStandardMaterial
        color={solution.material.color}
        roughness={Math.min(0.86, solution.material.roughness + 0.16)}
        metalness={solution.material.metalness}
      />
    </mesh>
  );
}

function StandUpTopSeal({ solution }: { solution: PouchLabSolution }) {
  const sealedWidth = (solution.input.width + solution.input.endSealMm * 2) * MM;
  const laminateThickness = Math.max(solution.material.caliperMm * MM, 0.0012);
  const hangHole = getPacdoraLabStandUpHangHole(solution.input);
  const cutEdgeY = solution.input.height * MM * 0.5;

  return (
    <group>
      {/* The heat-seal band is already part of the textured body surface. Only
          its cut edge and aperture rim need separate geometry. The old full
          rectangle sat coplanar over the artwork and caused shimmer/blur. */}
      <mesh position={[0, cutEdgeY, 0]} castShadow>
        <boxGeometry args={[sealedWidth, 0.0035, laminateThickness * 1.5]} />
        <meshStandardMaterial
          color={solution.material.color}
          roughness={Math.min(0.9, solution.material.roughness + 0.14)}
          metalness={solution.material.metalness}
        />
      </mesh>
      {solution.input.hangHole ? (
        <mesh position={[0, hangHole.centreYmm * MM, 0]}>
          <torusGeometry args={[hangHole.radiusMm * MM, 0.0015, 8, 48]} />
          <meshStandardMaterial
            color={solution.material.color}
            roughness={Math.min(0.9, solution.material.roughness + 0.14)}
            metalness={solution.material.metalness}
            side={THREE.DoubleSide}
          />
        </mesh>
      ) : null}
    </group>
  );
}

export type ProceduralPouchModelProps = {
  solution: PouchLabSolution;
  texture?: THREE.CanvasTexture | null;
  consumeDirty?: () => boolean;
  name?: string;
  position?: [number, number, number];
  rotationY?: number;
  onSurfaceClick?: () => void;
};

/**
 * Shared procedural pouch renderer used by both the research lab and the
 * registered Studio product. Geometry and canonical-web UVs therefore cannot
 * drift between `/test`, the `/` library preview, and the live editor.
 */
export function ProceduralPouchModel({
  solution,
  texture = null,
  consumeDirty,
  name = "POUCH",
  position = [0, 0, 0],
  rotationY = 0,
  onSurfaceClick,
}: ProceduralPouchModelProps) {
  const geometry = useMemo(() => buildPacdoraLabPouchGeometry(solution), [solution]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const laminateMaterial = useMemo(
    () => new THREE.MeshPhysicalMaterial({
      name: "ProceduralPouchLaminate",
      color: solution.material.color,
      roughness: solution.material.roughness,
      metalness: solution.material.metalness,
      clearcoat: solution.material.metalness > 0 ? 0.45 : 0.12,
      clearcoatRoughness: 0.42,
      envMapIntensity: 0.42,
      side: THREE.DoubleSide,
    }),
    [solution.material.color, solution.material.metalness, solution.material.roughness],
  );

  /* eslint-disable react-hooks/immutability */
  useEffect(() => {
    laminateMaterial.map = texture;
    laminateMaterial.color.set(texture ? 0xffffff : solution.material.color);
    laminateMaterial.needsUpdate = true;
  }, [laminateMaterial, solution.material.color, texture]);
  /* eslint-enable react-hooks/immutability */
  useEffect(() => () => laminateMaterial.dispose(), [laminateMaterial]);

  useFrame(() => {
    /* eslint-disable react-hooks/immutability */
    if (texture && consumeDirty?.()) texture.needsUpdate = true;
    /* eslint-enable react-hooks/immutability */
  });

  const halfDepth = Math.max(solution.inflatedDepth * MM * 0.5, 0.012);
  const sealY = solution.input.height * MM * 0.5 - solution.input.endSealMm * MM;
  const bodyWidth = solution.input.width * MM;

  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <mesh
        name={name}
        geometry={geometry}
        material={laminateMaterial}
        castShadow
        receiveShadow
        userData={{ pacdoraLab: geometry.userData.pacdoraLab }}
        onPointerDown={(event: { stopPropagation: () => void }) => {
          if (!onSurfaceClick) return;
          event.stopPropagation();
          onSurfaceClick();
        }}
      />
      {solution.style === "center-seal" ? (
        <>
          <mesh position={[0, 0, -halfDepth - 0.004]}>
            <planeGeometry args={[solution.input.backSealMm * MM, solution.input.height * MM * 0.73]} />
            <meshStandardMaterial
              color={solution.material.color}
              roughness={0.78}
              metalness={solution.material.metalness}
              side={THREE.DoubleSide}
            />
          </mesh>
          {[-sealY, sealY].map((y) => (
            <mesh key={y} position={[0, y, halfDepth * 0.09]} castShadow>
              <boxGeometry args={[bodyWidth * 1.025, 0.018, 0.014]} />
              <meshStandardMaterial color="#ddd9d2" roughness={0.9} />
            </mesh>
          ))}
        </>
      ) : (
        <>
          <StandUpTopSeal solution={solution} />
          {solution.input.zipper
            ? ([-1, 1] as const).flatMap((face) => [-1.7, 1.7].map((offsetMm) => (
                <StandUpZipperRidge
                  key={`zipper-${face}-${offsetMm}`}
                  solution={solution}
                  face={face}
                  offsetMm={offsetMm}
                />
              )))
            : null}
        </>
      )}
    </group>
  );
}
