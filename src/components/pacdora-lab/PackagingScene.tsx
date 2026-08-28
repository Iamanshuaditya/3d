"use client";

import { ContactShadows, Edges, OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import {
  type BoxLabSolution,
  type PouchLabSolution,
} from "@/lib/pacdora-lab";
import { configureDesignTexture } from "@/lib/configurator/texture-manager";
import { ProceduralPouchModel } from "@/components/configurator/ProceduralPouchModel";

const MM = 0.01;

type BoardPanelProps = {
  widthMm: number;
  depthMm: number;
  thicknessMm: number;
  color: string;
  position: [number, number, number];
  rotationX?: number;
  rotationY?: number;
  rotationZ?: number;
};

function BoardPanel({
  widthMm,
  depthMm,
  thicknessMm,
  color,
  position,
  rotationX = 0,
  rotationY = 0,
  rotationZ = 0,
}: BoardPanelProps) {
  return (
    <mesh position={position} rotation={[rotationX, rotationY, rotationZ]} castShadow receiveShadow>
      <boxGeometry args={[widthMm * MM, Math.max(thicknessMm * MM, 0.006), depthMm * MM]} />
      <meshStandardMaterial color={color} roughness={0.82} metalness={0} />
      <Edges scale={1.002} threshold={18} color="#766a55" />
    </mesh>
  );
}

function ease01(value: number): number {
  const t = Math.min(1, Math.max(0, value));
  return t * t * (3 - 2 * t);
}

function BoxModel({ solution, fold }: { solution: BoxLabSolution; fold: number }) {
  const { length, width, height } = solution.manufacture;
  const thickness = solution.material.caliperMm;
  const wallProgress = ease01(fold / 0.43);
  const theta = wallProgress * Math.PI * 0.5;
  const raised = Math.max(thickness * MM * 0.5, 0.003);
  const wallY = Math.sin(theta) * height * MM * 0.5 + raised;
  const wallRun = Math.cos(theta) * height * MM * 0.5;
  const frontZ = width * MM * 0.5 + wallRun;
  const backZ = -width * MM * 0.5 - wallRun;
  const sideX = length * MM * 0.5 + wallRun;
  const backTop = {
    y: Math.sin(theta) * height * MM + raised,
    z: -width * MM * 0.5 - Math.cos(theta) * height * MM,
  };
  const lidAngle = fold <= 0.56
    ? ease01(fold / 0.56) * Math.PI * 0.5
    : Math.PI * 0.5 + ease01((fold - 0.56) / 0.44) * Math.PI * 0.5;
  const lidDirection = {
    y: Math.sin(lidAngle),
    z: -Math.cos(lidAngle),
  };
  const lidCenter = {
    y: backTop.y + lidDirection.y * width * MM * 0.5,
    z: backTop.z + lidDirection.z * width * MM * 0.5,
  };
  const tuckDepth = solution.panels.find((panel) => panel.id === "lid-tuck")?.height ?? height * 0.58;
  const lockDepth = solution.panels.find((panel) => panel.id === "front-lock")?.height ?? height * 0.18;
  const lockWidth = solution.panels.find((panel) => panel.id === "front-lock")?.width ?? length * 0.34;
  const frontTuck = solution.panels.find((panel) => panel.id === "front-tuck")?.height ?? height * 0.42;
  const lidWingFold = Math.PI * 0.46 * wallProgress;
  const tuckFold = Math.PI * 0.58 * wallProgress;
  const dustWidth = Math.min(height * 0.58, length * 0.19);
  const dustHeight = height * 0.82;
  const frontTop = {
    y: Math.sin(theta) * height * MM + raised,
    z: width * MM * 0.5 + Math.cos(theta) * height * MM,
  };
  const wallDirection = { y: Math.sin(theta), z: Math.cos(theta) };
  const rollCenter = {
    y: frontTop.y - wallDirection.y * frontTuck * MM * 0.5,
    z: frontTop.z - wallDirection.z * frontTuck * MM * 0.5 - thickness * MM * 1.4,
  };
  const lockCenter = {
    y: frontTop.y - wallDirection.y * (frontTuck + lockDepth * 0.5) * MM,
    z: frontTop.z - wallDirection.z * (frontTuck + lockDepth * 0.5) * MM - thickness * MM * 1.6,
  };

  return (
    <group rotation={[0, -0.18, 0]} position={[0, -height * MM * 0.5, 0]}>
      <BoardPanel
        widthMm={length}
        depthMm={width}
        thicknessMm={thickness}
        color={solution.material.color}
        position={[0, raised, 0]}
      />
      <BoardPanel
        widthMm={length}
        depthMm={height}
        thicknessMm={thickness}
        color={solution.material.color}
        position={[0, wallY, frontZ]}
        rotationX={-theta}
      />
      <BoardPanel
        widthMm={length}
        depthMm={height}
        thicknessMm={thickness}
        color={solution.material.color}
        position={[0, wallY, backZ]}
        rotationX={theta}
      />
      <BoardPanel
        widthMm={height}
        depthMm={width}
        thicknessMm={thickness}
        color={solution.material.color}
        position={[-sideX, wallY, 0]}
        rotationZ={-theta}
      />
      <BoardPanel
        widthMm={height}
        depthMm={width}
        thicknessMm={thickness}
        color={solution.material.color}
        position={[sideX, wallY, 0]}
        rotationZ={theta}
      />

      {/* Lid assembly: main lid, folded side wings, and terminal tuck flap. */}
      <group position={[0, lidCenter.y, lidCenter.z]} rotation={[lidAngle, 0, 0]}>
        <BoardPanel
          widthMm={length}
          depthMm={width}
          thicknessMm={thickness}
          color={solution.material.color}
          position={[0, 0, 0]}
        />
        <group position={[-length * MM * 0.5, 0, 0]} rotation={[0, 0, -lidWingFold]}>
          <BoardPanel
            widthMm={height}
            depthMm={width}
            thicknessMm={thickness}
            color={solution.material.color}
            position={[-height * MM * 0.5, 0, 0]}
          />
        </group>
        <group position={[length * MM * 0.5, 0, 0]} rotation={[0, 0, lidWingFold]}>
          <BoardPanel
            widthMm={height}
            depthMm={width}
            thicknessMm={thickness}
            color={solution.material.color}
            position={[height * MM * 0.5, 0, 0]}
          />
        </group>
        <group position={[0, 0, -width * MM * 0.5]} rotation={[tuckFold, 0, 0]}>
          <BoardPanel
            widthMm={length}
            depthMm={tuckDepth}
            thicknessMm={thickness}
            color={solution.material.color}
            position={[0, 0, -tuckDepth * MM * 0.5]}
          />
        </group>
      </group>

      {/* Corner dust flaps and the double-wall front make this a real mailer construction. */}
      {wallProgress > 0.08 ? (
        <>
          {[-1, 1].map((side) => (
            <BoardPanel
              key={`back-dust-${side}`}
              widthMm={dustWidth}
              depthMm={dustHeight}
              thicknessMm={thickness * 0.82}
              color={solution.material.color}
              position={[
                side * (length * 0.5 - dustWidth * 0.5) * MM,
                (raised + height * 0.47 * wallProgress * MM),
                -width * MM * 0.5 + thickness * MM * 1.2,
              ]}
              rotationX={Math.PI * 0.5}
            />
          ))}
          {[-1, 1].map((side) => (
            <BoardPanel
              key={`front-dust-${side}`}
              widthMm={dustWidth}
              depthMm={dustHeight}
              thicknessMm={thickness * 0.82}
              color={solution.material.color}
              position={[
                side * (length * 0.5 - dustWidth * 0.5) * MM,
                (raised + height * 0.45 * wallProgress * MM),
                width * MM * 0.5 - thickness * MM * 1.2,
              ]}
              rotationX={Math.PI * 0.5}
            />
          ))}
        </>
      ) : null}
      <BoardPanel
        widthMm={length}
        depthMm={frontTuck}
        thicknessMm={thickness * 0.9}
        color={solution.material.color}
        position={[0, rollCenter.y, rollCenter.z]}
        rotationX={-theta}
      />
      <BoardPanel
        widthMm={lockWidth}
        depthMm={lockDepth}
        thicknessMm={thickness * 0.86}
        color={solution.material.color}
        position={[0, lockCenter.y, lockCenter.z]}
        rotationX={-theta}
      />
    </group>
  );
}

function PouchModel({
  solution,
  artworkCanvas,
}: {
  solution: PouchLabSolution;
  artworkCanvas: HTMLCanvasElement | null;
}) {
  const artworkTexture = useMemo(() => {
    if (!artworkCanvas) return null;
    const texture = new THREE.CanvasTexture(artworkCanvas);
    configureDesignTexture(texture);
    return texture;
  }, [artworkCanvas]);
  useEffect(() => () => artworkTexture?.dispose(), [artworkTexture]);

  return (
    <ProceduralPouchModel
      solution={solution}
      texture={artworkTexture}
      rotationY={-0.22}
    />
  );
}

export function PackagingScene({
  box,
  pouch,
  fold,
  artworkCanvas = null,
}: {
  box?: BoxLabSolution;
  pouch?: PouchLabSolution;
  fold: number;
  artworkCanvas?: HTMLCanvasElement | null;
}) {
  const bodyHeight = box?.outer.height ?? pouch?.input.height ?? 180;
  const visualHeight = box ? box.outer.height + box.outer.width * 0.72 : bodyHeight;
  const cameraDistance = box
    ? Math.max(5.1, visualHeight * MM * 2.25)
    : Math.max(3.45, visualHeight * MM * 1.72);
  const pouchZoom = Math.min(270, Math.max(120, 430 / (bodyHeight * MM)));

  return (
    <Canvas
      key={box ? "mailer-scene" : pouch?.style ?? "packaging-scene"}
      shadows
      dpr={[1, 1.75]}
      orthographic={!box}
      camera={{
        position: [
          cameraDistance * (box ? 0.72 : 0.34),
          // Flexible pouches are judged by their seal and gusset silhouettes.
          // Start exactly on the pouch midline so a level bottom edge cannot
          // read as a diagonal cut; OrbitControls still allow full inspection.
          cameraDistance * (box ? 0.58 : 0),
          cameraDistance,
        ],
        fov: 34,
        zoom: box ? 1 : pouchZoom,
      }}
      gl={{ antialias: true, alpha: true }}
    >
      <color attach="background" args={["#eceff1"]} />
      <ambientLight intensity={1.5} />
      <directionalLight
        castShadow
        intensity={3.2}
        position={[4, 7, 5]}
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
      />
      <directionalLight intensity={1.1} position={[-4, 2, -3]} />
      {box ? <BoxModel solution={box} fold={fold} /> : null}
      {pouch ? <PouchModel solution={pouch} artworkCanvas={artworkCanvas} /> : null}
      <ContactShadows
        position={[0, -bodyHeight * MM * 0.52, 0]}
        opacity={0.32}
        scale={8}
        blur={2.6}
        far={5}
      />
      <OrbitControls
        makeDefault
        target={[0, box ? box.manufacture.height * MM * 0.52 : 0, 0]}
        enableDamping
        dampingFactor={0.08}
        minDistance={2.3}
        maxDistance={10}
        minZoom={90}
        maxZoom={440}
      />
    </Canvas>
  );
}
