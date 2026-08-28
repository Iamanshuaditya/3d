"use client";

import { ContactShadows, Edges, OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import {
  resolvePacdoraLabBoxFoldPose,
  type BoxLabSolution,
  type DielinePanel,
  type PouchLabSolution,
} from "@/lib/pacdora-lab";
import { configureDesignTexture } from "@/lib/configurator/texture-manager";
import { ProceduralPouchModel } from "@/components/configurator/ProceduralPouchModel";

const MM = 0.01;

type BoardPanelProps = {
  panel: DielinePanel;
  thicknessMm: number;
  color: string;
  roughness: number;
  metalness: number;
  position: [number, number, number];
  rotationX?: number;
  rotationY?: number;
  rotationZ?: number;
};

function BoardPanel({
  panel,
  thicknessMm,
  color,
  roughness,
  metalness,
  position,
  rotationX = 0,
  rotationY = 0,
  rotationZ = 0,
}: BoardPanelProps) {
  const geometry = useMemo(() => {
    const points = panel.outline ?? [
      { x: 0, y: 0 },
      { x: panel.width, y: 0 },
      { x: panel.width, y: panel.height },
      { x: 0, y: panel.height },
    ];
    const shape = new THREE.Shape();
    points.forEach((point, index) => {
      const x = (point.x - panel.width * 0.5) * MM;
      const y = (point.y - panel.height * 0.5) * MM;
      if (index === 0) shape.moveTo(x, y);
      else shape.lineTo(x, y);
    });
    shape.closePath();
    const thickness = Math.max(thicknessMm * MM, 0.003);
    const result = new THREE.ExtrudeGeometry(shape, {
      bevelEnabled: false,
      curveSegments: 1,
      depth: thickness,
      steps: 1,
    });
    result.translate(0, 0, -thickness * 0.5);
    result.rotateX(Math.PI * 0.5);
    result.computeVertexNormals();
    return result;
  }, [panel.height, panel.outline, panel.width, thicknessMm]);
  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <mesh
      geometry={geometry}
      position={position}
      rotation={[rotationX, rotationY, rotationZ]}
      castShadow
      receiveShadow
    >
      <meshStandardMaterial color={color} roughness={roughness} metalness={metalness} side={THREE.DoubleSide} />
      <Edges scale={1.002} threshold={18} color="#766a55" />
    </mesh>
  );
}

function BoxModel({ solution, fold }: { solution: BoxLabSolution; fold: number }) {
  const { length, width, height } = solution.manufacture;
  const thickness = solution.material.caliperMm;
  const pose = resolvePacdoraLabBoxFoldPose(fold);
  const raised = Math.max(thickness * MM * 0.5, 0.003);
  const panel = (id: string) => {
    const match = solution.panels.find((candidate) => candidate.id === id);
    if (!match) throw new Error(`Missing mailer panel: ${id}`);
    return match;
  };
  const base = panel("base");
  const back = panel("back");
  const front = panel("front");
  const left = panel("left");
  const right = panel("right");
  const lid = panel("lid");
  const lidTuck = panel("lid-tuck");
  const lidLeft = panel("lid-left");
  const lidRight = panel("lid-right");
  const frontTuck = panel("front-tuck");
  const frontLock = panel("front-lock");
  const boardProps = {
    thicknessMm: thickness,
    color: solution.material.color,
    roughness: solution.material.roughness,
    metalness: solution.material.metalness,
  };
  const dustStackOffset = (pose.dustAngle / (Math.PI * 0.5)) * thickness * MM * 1.6;
  const lidStackOffset = (pose.lidCloseAngle / (Math.PI * 0.5)) * thickness * MM * 1.6;
  const rollStackOffset = (pose.frontRollAngle / (Math.PI * 0.5)) * thickness * MM * 1.6;
  const modelTurn = -0.18 * (pose.wallAngle / (Math.PI * 0.5));

  return (
    <group rotation={[0, modelTurn, 0]} position={[0, -height * MM * 0.5, 0]}>
      <BoardPanel
        {...boardProps}
        panel={base}
        position={[0, raised, 0]}
      />

      {/* Back wall owns the lid; the lid owns both wings and its terminal tuck. */}
      <group position={[0, raised, -width * MM * 0.5]} rotation={[pose.wallAngle, 0, 0]}>
        <BoardPanel {...boardProps} panel={back} position={[0, 0, -height * MM * 0.5]} />
        <group position={[0, 0, -height * MM]} rotation={[pose.lidCloseAngle, 0, 0]}>
          <BoardPanel {...boardProps} panel={lid} position={[0, 0, -width * MM * 0.5]} />
          <group position={[-length * MM * 0.5 + lidStackOffset, 0, 0]} rotation={[0, 0, -pose.lidWingAngle]}>
            <BoardPanel {...boardProps} panel={lidLeft} position={[-height * MM * 0.5, 0, -width * MM * 0.5]} />
          </group>
          <group position={[length * MM * 0.5 - lidStackOffset, 0, 0]} rotation={[0, 0, pose.lidWingAngle]}>
            <BoardPanel {...boardProps} panel={lidRight} position={[height * MM * 0.5, 0, -width * MM * 0.5]} />
          </group>
          <group position={[0, 0, -width * MM + lidStackOffset]} rotation={[pose.tuckAngle, 0, 0]}>
            <BoardPanel {...boardProps} panel={lidTuck} position={[0, 0, -lidTuck.height * MM * 0.5]} />
          </group>
        </group>
      </group>

      {/* Side walls own their dust flaps, keeping every flap on its crease. */}
      {([-1, 1] as const).map((side) => {
        const sidePanel = side === -1 ? left : right;
        const backDust = panel(side === -1 ? "back-left-dust" : "back-right-dust");
        const frontDust = panel(side === -1 ? "front-left-dust" : "front-right-dust");
        return (
          <group
            key={`side-${side}`}
            position={[side * length * MM * 0.5, raised, 0]}
            rotation={[0, 0, side * pose.wallAngle]}
          >
            <BoardPanel {...boardProps} panel={sidePanel} position={[side * height * MM * 0.5, 0, 0]} />
            <group position={[0, 0, -width * MM * 0.5 + dustStackOffset]} rotation={[pose.dustAngle, 0, 0]}>
              <BoardPanel
                {...boardProps}
                thicknessMm={thickness * 0.86}
                panel={backDust}
                position={[side * height * MM * 0.5, 0, -backDust.height * MM * 0.5]}
              />
            </group>
            <group position={[0, 0, width * MM * 0.5 - dustStackOffset]} rotation={[-pose.dustAngle, 0, 0]}>
              <BoardPanel
                {...boardProps}
                thicknessMm={thickness * 0.86}
                panel={frontDust}
                position={[side * height * MM * 0.5, 0, frontDust.height * MM * 0.5]}
              />
            </group>
          </group>
        );
      })}

      {/* The front roll and tongue are descendants of the front-wall hinge. */}
      <group position={[0, raised, width * MM * 0.5]} rotation={[-pose.wallAngle, 0, 0]}>
        <BoardPanel {...boardProps} panel={front} position={[0, 0, height * MM * 0.5]} />
        <group position={[0, 0, height * MM - rollStackOffset]} rotation={[-pose.frontRollAngle, 0, 0]}>
          <BoardPanel {...boardProps} panel={frontTuck} position={[0, 0, frontTuck.height * MM * 0.5]} />
          <group position={[0, 0, frontTuck.height * MM]} rotation={[-pose.lockAngle, 0, 0]}>
            <BoardPanel
              {...boardProps}
              thicknessMm={thickness * 0.86}
              panel={frontLock}
              position={[0, 0, frontLock.height * MM * 0.5]}
            />
          </group>
        </group>
      </group>
    </group>
  );
}

function PouchModel({
  solution,
  artworkCanvas,
  artworkRevision,
}: {
  solution: PouchLabSolution;
  artworkCanvas: HTMLCanvasElement | null;
  artworkRevision: number;
}) {
  const artworkTexture = useMemo(() => {
    // Recreate the lightweight CanvasTexture wrapper when Studio republishes
    // pixels. The backing canvas stays persistent; this avoids mutating a hook
    // return value while still forcing Three.js to upload the latest bitmap.
    void artworkRevision;
    if (!artworkCanvas) return null;
    const texture = new THREE.CanvasTexture(artworkCanvas);
    configureDesignTexture(texture);
    return texture;
  }, [artworkCanvas, artworkRevision]);
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
  artworkRevision = 0,
}: {
  box?: BoxLabSolution;
  pouch?: PouchLabSolution;
  fold: number;
  artworkCanvas?: HTMLCanvasElement | null;
  artworkRevision?: number;
}) {
  const bodyHeight = box?.outer.height ?? pouch?.input.height ?? 180;
  const visualHeight = box ? box.outer.height + box.outer.width * 0.72 : bodyHeight;
  const clampedFold = Math.min(1, Math.max(0, fold));
  const boxViewProgress = box ? Math.min(1, clampedFold / 0.42) : 1;
  const boxCloseProgress = box ? Math.min(1, Math.max(0, (clampedFold - 0.5) / 0.5)) : 1;
  const boxLidTuckHeight = box?.panels.find((panel) => panel.id === "lid-tuck")?.height ?? 0;
  const boxFlatBack = box
    ? box.manufacture.width * 0.5
      + box.manufacture.height
      + box.manufacture.width
      + boxLidTuckHeight
    : 0;
  const boxFlatFront = box
    ? box.manufacture.width * 0.5
      + box.manufacture.height
      + (box.panels.find((panel) => panel.id === "front-tuck")?.height ?? 0)
      + (box.panels.find((panel) => panel.id === "front-lock")?.height ?? 0)
    : 0;
  const boxFlatSpan = box ? Math.max(
    boxFlatBack + boxFlatFront,
    box.manufacture.length + box.manufacture.height * 2,
  ) * MM : 0;
  const foldedCameraDistance = Math.max(5.8, visualHeight * MM * 2.35);
  const flatCameraDistance = Math.max(9, boxFlatSpan * 2.65);
  const openCameraDistance = box
    ? Math.max(9.6, (box.manufacture.height + box.manufacture.width + boxLidTuckHeight) * MM * 2.6)
    : foldedCameraDistance;
  const cameraDistance = box
    ? clampedFold <= 0.5
      ? THREE.MathUtils.lerp(flatCameraDistance, openCameraDistance, boxViewProgress)
      : THREE.MathUtils.lerp(openCameraDistance, foldedCameraDistance, boxCloseProgress)
    : Math.max(3.45, visualHeight * MM * 1.72);
  const openCameraTargetY = box
    ? (box.manufacture.width + boxLidTuckHeight) * MM * 0.5
    : 0;
  const cameraTarget: [number, number, number] = box
    ? [
        0,
        clampedFold <= 0.5
          ? THREE.MathUtils.lerp(-box.manufacture.height * MM * 0.5, openCameraTargetY, boxViewProgress)
          : THREE.MathUtils.lerp(openCameraTargetY, 0, boxCloseProgress),
        THREE.MathUtils.lerp((boxFlatFront - boxFlatBack) * MM * 0.5, 0, boxViewProgress),
      ]
    : [0, 0, 0];
  const boxViewStage = clampedFold < 0.2 ? "flat" : clampedFold < 0.78 ? "open" : "closed";
  const pouchZoom = Math.min(270, Math.max(120, 430 / (bodyHeight * MM)));

  return (
    <Canvas
      key={box
        ? `mailer-scene-${box.construction}-${boxViewStage}`
        : pouch?.style ?? "packaging-scene"}
      shadows
      dpr={[1, 1.75]}
      orthographic={!box}
      camera={{
        position: [
          cameraTarget[0] + cameraDistance * (box
            ? THREE.MathUtils.lerp(0.38, 0.62, boxViewProgress)
            : 0.34),
          // Flexible pouches are judged by their seal and gusset silhouettes.
          // Start exactly on the pouch midline so a level bottom edge cannot
          // read as a diagonal cut; OrbitControls still allow full inspection.
          cameraTarget[1] + cameraDistance * (box
            ? THREE.MathUtils.lerp(0.98, 0.72, boxViewProgress)
            : 0),
          cameraTarget[2] + cameraDistance * (box
            ? THREE.MathUtils.lerp(0.48, 0.92, boxViewProgress)
            : 1),
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
      {pouch ? (
        <PouchModel
          solution={pouch}
          artworkCanvas={artworkCanvas}
          artworkRevision={artworkRevision}
        />
      ) : null}
      <ContactShadows
        position={[0, -bodyHeight * MM * 0.52, 0]}
        opacity={0.32}
        scale={8}
        blur={2.6}
        far={5}
      />
      <OrbitControls
        makeDefault
        target={cameraTarget}
        enableDamping
        dampingFactor={0.08}
        minDistance={2.3}
        maxDistance={box ? 30 : 10}
        minZoom={90}
        maxZoom={440}
      />
    </Canvas>
  );
}
