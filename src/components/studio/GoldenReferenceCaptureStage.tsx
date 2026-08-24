"use client";

import { useEffect, useMemo, useState } from "react";
import { Canvas } from "@react-three/fiber";
import * as THREE from "three";
import { CartonModel } from "@/components/configurator/CartonModel";
import { configureDesignTexture } from "@/lib/configurator/texture-manager";
import type { ProductConfig } from "@/types/configurator";
import type { HingeAngles } from "@/types/unfold";

/**
 * Deterministic fixed-camera stage for the private golden reference captures.
 *
 * Every capture in a run shares this camera, these lights and this artwork, so
 * differences between captures can only come from the structural pose. Orbit
 * controls are deliberately absent: the camera cannot drift between captures.
 *
 * `stepPose` snaps to the requested pose on first render, so a mounted stage is
 * already at its exact absolute target — captures never race an animation.
 */

/**
 * Shared by every capture in a run. Never change between captures.
 *
 * Framed once for the largest state — the flat sheet is 7.42 x 5.00 units and
 * must fit whole — from a shallow three-quarter angle that still reads the
 * assembled front wall. The erect body then fills about half the frame height.
 */
export const CAPTURE_CAMERA = Object.freeze({
  position: [2.2, 4.7, 9.9] as const,
  target: [-0.5, 1.5, -0.2] as const,
  fov: 38,
  near: 0.1,
  far: 200,
});

const TEXTURE_MAX_EDGE = 2048;

type GoldenReferenceCaptureStageProps = {
  config: ProductConfig;
  pose: HingeAngles;
  pairedPose?: HingeAngles;
  artworkSvg: string;
  captureId: string;
  widthPx: number;
  heightPx: number;
};

function useArtworkTexture(artworkSvg: string, aspect: number): THREE.CanvasTexture | null {
  const [texture, setTexture] = useState<THREE.CanvasTexture | null>(null);

  useEffect(() => {
    let cancelled = false;
    let created: THREE.CanvasTexture | null = null;

    const width = TEXTURE_MAX_EDGE;
    const height = Math.max(1, Math.round(TEXTURE_MAX_EDGE / aspect));
    const blob = new Blob([artworkSvg], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.decoding = "sync";

    image.onload = () => {
      if (cancelled) return;
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) return;
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, width, height);
      context.drawImage(image, 0, 0, width, height);
      created = new THREE.CanvasTexture(canvas);
      configureDesignTexture(created, 16);
      setTexture(created);
      URL.revokeObjectURL(url);
    };
    image.onerror = () => URL.revokeObjectURL(url);
    image.src = url;

    return () => {
      cancelled = true;
      URL.revokeObjectURL(url);
      created?.dispose();
    };
  }, [artworkSvg, aspect]);

  return texture;
}

function CaptureViewport({
  config,
  pose,
  texture,
  label,
}: {
  config: ProductConfig;
  pose: HingeAngles;
  texture: THREE.CanvasTexture | null;
  label: string;
}) {
  const surfaceId = config.editableSurfaces[0]?.id ?? "outside";
  const textures = useMemo(() => ({ [surfaceId]: texture }), [surfaceId, texture]);
  const spec = config.cartonSpec;
  if (!spec) throw new Error("Golden reference capture requires a resolved carton spec.");

  return (
    <div className="relative h-full w-full">
      <Canvas
        gl={{ preserveDrawingBuffer: true, antialias: true }}
        dpr={1}
        frameloop="always"
        camera={{
          position: [...CAPTURE_CAMERA.position],
          fov: CAPTURE_CAMERA.fov,
          near: CAPTURE_CAMERA.near,
          far: CAPTURE_CAMERA.far,
        }}
        onCreated={({ camera, scene }) => {
          camera.lookAt(new THREE.Vector3(...CAPTURE_CAMERA.target));
          camera.updateProjectionMatrix();
          scene.background = new THREE.Color("#eef2f7");
        }}
      >
        <ambientLight intensity={0.55} />
        <directionalLight position={[8, 12, 10]} intensity={1.25} />
        <directionalLight position={[-9, 5, -6]} intensity={0.45} />
        <directionalLight position={[0, -6, 8]} intensity={0.25} />
        <CartonModel
          spec={spec}
          config={config}
          textures={textures}
          consumeDirty={() => false}
          hingeAngles={pose}
        />
      </Canvas>
      <p className="pointer-events-none absolute left-3 top-3 rounded bg-black/70 px-2 py-1 font-mono text-[11px] font-semibold text-white">
        {label}
      </p>
    </div>
  );
}

export function GoldenReferenceCaptureStage({
  config,
  pose,
  pairedPose,
  artworkSvg,
  captureId,
  widthPx,
  heightPx,
}: GoldenReferenceCaptureStageProps) {
  const sheetAspect =
    (config.editableSurfaces[0]?.physicalWidthCm ?? 1) /
    (config.editableSurfaces[0]?.physicalHeightCm ?? 1);
  const texture = useArtworkTexture(artworkSvg, sheetAspect);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!texture) return;
    // Two animation frames after the texture lands, the first snapped pose has
    // been rendered and the framebuffer is stable enough to screenshot.
    let raf = 0;
    raf = requestAnimationFrame(() => {
      raf = requestAnimationFrame(() => setReady(true));
    });
    return () => cancelAnimationFrame(raf);
  }, [texture]);

  return (
    <main
      data-capture-id={captureId}
      data-capture-ready={ready ? "true" : "false"}
      className="flex items-stretch bg-[#eef2f7]"
      style={{ width: widthPx, height: heightPx }}
    >
      <CaptureViewport
        config={config}
        pose={pose}
        texture={texture}
        label={pairedPose ? "major closure" : captureId}
      />
      {pairedPose ? (
        <CaptureViewport
          config={config}
          pose={pairedPose}
          texture={texture}
          label="final closure"
        />
      ) : null}
    </main>
  );
}
