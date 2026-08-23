"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Environment, Html } from "@react-three/drei";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import type { CameraPreset, ProductConfig, ValidationResult } from "@/types/configurator";
import type { HingeAngles } from "@/types/unfold";
import type { SceneDebugInfo } from "@/lib/configurator/model-validator";
import { ProductModel } from "./ProductModel";
import { CartonModel } from "./CartonModel";
import { PouchModel } from "./PouchModel";
import { POUCHES } from "@/lib/configurator/pouch-spec";
import { resolveCartonSpec } from "@/lib/configurator/carton-spec";

type Product3DViewerProps = {
  config: ProductConfig;
  textures: Record<string, THREE.CanvasTexture | null>;
  /** Per-surface embroidery relief maps, for fabric products. */
  materialTextures?: Record<
    string,
    { normal: THREE.CanvasTexture; roughness: THREE.CanvasTexture } | null
  >;
  consumeDirty: (surfaceId: string) => boolean;
  pendingPreset: CameraPreset | null;
  onPresetApplied: () => void;
  onValidated: (result: ValidationResult, debug: SceneDebugInfo[]) => void;
  onSurfaceClick?: (surfaceId: string) => void;
  highlightedMeshName?: string | null;
  onMeshHover?: (meshName: string | null) => void;
  onMeshClick?: (meshName: string) => void;
  /** Optional, deliberately subtle pointer-following camera response. */
  hoverParallax?: boolean;
  /** Receives a function that renders the current frame to a PNG data URL. */
  onCaptureReady?: (capture: () => string | null) => void;
  /**
   * Structural pose for articulated products: absolute hinge angles in
   * degrees, produced by the unfolding plan. Omitted hinges stay assembled.
   */
  hingeAngles?: HingeAngles;
  /** True when an articulated product has reached its flat, dieline pose. */
  dielineView?: boolean;
};

function LoadingOverlay() {
  return (
    <Html center>
      <div className="flex flex-col items-center gap-2 text-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-black/10 border-t-[var(--st-accent)]" />
        <p className="whitespace-nowrap text-[13px] text-[var(--st-dim)]">
          Loading 3D preview…
        </p>
      </div>
    </Html>
  );
}

/** Smoothly flies the camera to a requested preset (§24). */
function CameraRig({
  preset,
  onApplied,
  controlsRef,
}: {
  preset: CameraPreset | null;
  onApplied: () => void;
  controlsRef: React.RefObject<OrbitControlsImpl | null>;
}) {
  const { camera } = useThree();
  const from = useRef(new THREE.Vector3());
  const to = useRef(new THREE.Vector3());
  const targetTo = useRef(new THREE.Vector3());
  const t = useRef(1);

  useEffect(() => {
    if (!preset) return;
    from.current.copy(camera.position);
    to.current.set(...preset.position);
    targetTo.current.set(...preset.target);
    t.current = 0;
  }, [preset, camera]);

  useFrame((_, delta) => {
    if (t.current >= 1) return;
    t.current = Math.min(1, t.current + delta * 2.2);
    // ease-out cubic
    const e = 1 - Math.pow(1 - t.current, 3);
    camera.position.lerpVectors(from.current, to.current, e);
    const controls = controlsRef.current;
    if (controls) {
      controls.target.lerp(targetTo.current, e);
      controls.update();
    }
    if (t.current >= 1) onApplied();
  });

  return null;
}

/**
 * Vistaprint's default `hover: true` camera response. Pointer position shifts
 * the view by up to 22.5deg horizontally and half the vertical FOV, making the
 * laminate's reflection bands travel across the folds without requiring drag.
 */
function HoverParallaxRig({
  enabled,
  controlsRef,
}: {
  enabled: boolean;
  controlsRef: React.RefObject<OrbitControlsImpl | null>;
}) {
  const { gl, camera } = useThree();
  const startAzimuth = useRef(0);
  const startPolar = useRef(Math.PI / 2);
  const targetAzimuth = useRef(0);
  const targetPolar = useRef(Math.PI / 2);
  const active = useRef(false);
  const dragging = useRef(false);
  const resetting = useRef(false);
  const [motionAllowed, setMotionAllowed] = useState(false);
  const motionEnabled = enabled && motionAllowed;

  useEffect(() => {
    const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)");
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setMotionAllowed(finePointer.matches && !reducedMotion.matches);
    update();
    finePointer.addEventListener("change", update);
    reducedMotion.addEventListener("change", update);
    return () => {
      finePointer.removeEventListener("change", update);
      reducedMotion.removeEventListener("change", update);
    };
  }, []);

  useEffect(() => {
    if (!motionEnabled) {
      active.current = false;
      return;
    }
    const canvas = gl.domElement;
    const minPolar = Math.PI * 0.02;
    const maxPolar = Math.PI * 0.98;

    const captureCurrentView = () => {
      const controls = controlsRef.current;
      if (!controls) return;
      startAzimuth.current = controls.getAzimuthalAngle();
      startPolar.current = THREE.MathUtils.clamp(
        controls.getPolarAngle(),
        minPolar,
        maxPolar,
      );
      targetAzimuth.current = startAzimuth.current;
      targetPolar.current = startPolar.current;
      active.current = true;
      resetting.current = false;
    };

    const onMouseEnter = () => captureCurrentView();
    const onMouseDown = () => {
      dragging.current = true;
    };
    const onMouseUp = () => {
      dragging.current = false;
      captureCurrentView();
    };
    const onMouseMove = (event: MouseEvent) => {
      dragging.current = Boolean(event.buttons & 1);
      if (!active.current || dragging.current) return;

      const width = canvas.clientWidth || 1;
      const height = canvas.clientHeight || 1;
      const horizontalOffset = (event.offsetX - width / 2) / width;
      const verticalOffset = (event.offsetY - height / 2) / height;
      const verticalFov = camera instanceof THREE.PerspectiveCamera ? camera.fov : 32;

      targetAzimuth.current =
        startAzimuth.current + THREE.MathUtils.degToRad(horizontalOffset * 45);
      targetPolar.current = THREE.MathUtils.clamp(
        startPolar.current + THREE.MathUtils.degToRad(verticalOffset * verticalFov),
        minPolar,
        maxPolar,
      );
      resetting.current = false;
    };
    const onMouseLeave = () => {
      if (dragging.current || !active.current) return;
      targetAzimuth.current = startAzimuth.current;
      targetPolar.current = startPolar.current;
      resetting.current = true;
    };

    canvas.addEventListener("mouseenter", onMouseEnter);
    canvas.addEventListener("mousedown", onMouseDown);
    canvas.addEventListener("mouseup", onMouseUp);
    canvas.addEventListener("mousemove", onMouseMove);
    canvas.addEventListener("mouseleave", onMouseLeave);

    return () => {
      canvas.removeEventListener("mouseenter", onMouseEnter);
      canvas.removeEventListener("mousedown", onMouseDown);
      canvas.removeEventListener("mouseup", onMouseUp);
      canvas.removeEventListener("mousemove", onMouseMove);
      canvas.removeEventListener("mouseleave", onMouseLeave);
    };
  }, [camera, controlsRef, gl, motionEnabled]);

  useFrame((_, delta) => {
    if (!motionEnabled || !active.current || dragging.current) return;
    const controls = controlsRef.current;
    if (!controls) return;

    // Vortex uses 80ms while hovering and 10ms when restoring the view.
    const duration = resetting.current ? 0.01 : 0.08;
    const alpha = 1 - Math.exp(-delta / duration);
    const azimuth = THREE.MathUtils.lerp(
      controls.getAzimuthalAngle(),
      targetAzimuth.current,
      alpha,
    );
    const polar = THREE.MathUtils.lerp(
      controls.getPolarAngle(),
      targetPolar.current,
      alpha,
    );
    controls.setAzimuthalAngle(azimuth);
    controls.setPolarAngle(polar);
    controls.update();
  });

  return null;
}

/** Exposes a screenshot function for cart thumbnails / proofs (§42). */
function CaptureBridge({ onReady }: { onReady?: (fn: () => string | null) => void }) {
  const { gl, scene, camera } = useThree();

  useEffect(() => {
    if (!onReady) return;
    onReady(() => {
      try {
        gl.render(scene, camera);
        return gl.domElement.toDataURL("image/png");
      } catch {
        return null;
      }
    });
  }, [gl, scene, camera, onReady]);

  return null;
}

export function Product3DViewer({
  config,
  textures,
  materialTextures,
  consumeDirty,
  pendingPreset,
  onPresetApplied,
  onValidated,
  onSurfaceClick,
  highlightedMeshName = null,
  onMeshHover,
  onMeshClick,
  hoverParallax = false,
  onCaptureReady,
  hingeAngles,
  dielineView = false,
}: Product3DViewerProps) {
  const cartonSpec = resolveCartonSpec(config);
  const pouchSpec = config.family === "pouch" ? POUCHES[config.pouchSpecId ?? ""] : null;
  const useClearBarrierResponse = config.materialProfile === "clear-barrier-gloss";
  const useFabricResponse = config.materialProfile === "cotton-fabric";
  const controlsRef = useRef<OrbitControlsImpl>(null);

  // Detect WebGL up front so we can show a real message (§40). Computed in a
  // lazy initializer rather than an effect — this component is client-only
  // (dynamically imported with ssr:false), and it avoids a cascading render.
  const [webglError] = useState(() => {
    try {
      const canvas = document.createElement("canvas");
      return !(canvas.getContext("webgl2") ?? canvas.getContext("webgl"));
    } catch {
      return true;
    }
  });

  if (webglError) {
    return (
      <div className="flex h-full min-h-[320px] items-center justify-center rounded-lg bg-[var(--st-surface)] p-8 text-center">
        <div>
          <p className="text-[15px] font-semibold text-[var(--st-text)]">
            3D preview unavailable
          </p>
          <p className="mt-2 text-[13px] leading-[1.5] text-[var(--st-dim)]">
            Your browser or device does not support WebGL. The design editor still works.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full overflow-hidden rounded-lg bg-[#f2f2f3]">
      <Canvas
        shadows
        dpr={[1, 2]}
        gl={{
          preserveDrawingBuffer: true,
          antialias: true,
          alpha: false,
          // Vortex's Three.js build uses an untone-mapped Phong pipeline. ACES
          // compressed the highlights and made the white laminate look milky.
          toneMapping: useClearBarrierResponse
            ? THREE.NoToneMapping
            : THREE.ACESFilmicToneMapping,
          // White cotton under a studio rig sits right at the top of the ACES
          // curve, where highlights desaturate — a red logo turns pink. Pulling
          // the exposure back keeps thread colour where the customer put it.
          toneMappingExposure: useFabricResponse ? 0.72 : 1,
        }}
        camera={{ position: config.camera.initial, fov: 32 }}
      >
        <color attach="background" args={["#f2f2f3"]} />

        {useClearBarrierResponse ? (
          <>
            {/* Vortex uses raw #111111 at 11.1504 in its legacy linear output
                path. Modern Three applies sRGB conversion plus Lambert energy
                normalization, so we carry the equivalent displayed energy. */}
            <ambientLight color={0xffffff} intensity={2.2} />
            {/* Exact Vortex modeled-product rig. Vistaprint normalizes the
                pouch's 0.1646-unit height to 200, then places six lights at
                +/-300 with distance 500. Converted to our 10x model scale,
                those values are +/-2.47 and 4.12. */}
            <pointLight position={[0, 0, 2.47]} intensity={0.42} distance={4.12} decay={1} />
            <pointLight position={[0, 0, -2.47]} intensity={0.42} distance={4.12} decay={1} />
            <pointLight position={[2.47, 0, 0]} intensity={0.3885} distance={4.12} decay={1} />
            <pointLight position={[-2.47, 0, 0]} intensity={0.3885} distance={4.12} decay={1} />
            <pointLight position={[0, -2.47, 0]} intensity={0.4515} distance={4.12} decay={1} />
            <pointLight position={[0, 2.47, 0]} intensity={0.42} distance={4.12} decay={1} />
          </>
        ) : useFabricResponse ? (
          <>
            {/* Cloth is lit by the studio environment, not by a lamp rig.
                Measured: pushing the directional key above ~0.1 drives white
                cotton into the top of the ACES curve, where saturated thread
                desaturates toward white and a crimson logo renders pink. The
                one remaining light exists to cast the contact shadow. */}
            <ambientLight intensity={0.03} />
            <directionalLight
              position={[2.5, 5, 4]}
              intensity={0.07}
              castShadow
              shadow-mapSize-width={1024}
              shadow-mapSize-height={1024}
            />
          </>
        ) : (
          <>
            <ambientLight intensity={0.28} />
            <directionalLight
              position={[3, 6, 4]}
              intensity={1.15}
              castShadow
              shadow-mapSize-width={1024}
              shadow-mapSize-height={1024}
            />
            <directionalLight position={[-4, 3, -3]} intensity={0.32} />
          </>
        )}

        {/* The flattened blank is presented from its printed side, which faces
            down — so the standing key light rakes across its back. This fill
            exists purely so the dieline pose reads as white board rather than
            as a grey silhouette. */}
        {dielineView && <directionalLight position={[0, -6, -2.5]} intensity={1.1} />}

        <Suspense fallback={<LoadingOverlay />}>
          {pouchSpec ? (
            <PouchModel
              spec={pouchSpec}
              config={config}
              textures={textures}
              consumeDirty={consumeDirty}
              onSurfaceClick={onSurfaceClick}
            />
          ) : cartonSpec ? (
            <CartonModel
              spec={cartonSpec}
              config={config}
              textures={textures}
              consumeDirty={consumeDirty}
              hingeAngles={hingeAngles}
              dielineView={dielineView}
              onSurfaceClick={onSurfaceClick}
            />
          ) : (
            <ProductModel
              config={config}
              textures={textures}
              materialTextures={materialTextures}
              consumeDirty={consumeDirty}
              hingeAngles={hingeAngles}
              onValidated={onValidated}
              onSurfaceClick={onSurfaceClick}
              highlightedMeshName={highlightedMeshName}
              onMeshHover={onMeshHover}
              onMeshClick={onMeshClick}
            />
          )}
          {/* The Vistaprint pouch already has its exact local six-face
              reflection map. Loading Drei's remote studio HDRI here both
              changes that response and can keep the whole model suspended. */}
          {!useClearBarrierResponse && <Environment preset="studio" />}
        </Suspense>


        <CameraRig
          preset={pendingPreset}
          onApplied={onPresetApplied}
          controlsRef={controlsRef}
        />
        <HoverParallaxRig
          enabled={useClearBarrierResponse && hoverParallax}
          controlsRef={controlsRef}
        />
        <CaptureBridge onReady={onCaptureReady} />

        <OrbitControls
          ref={controlsRef}
          makeDefault
          enablePan={false}
          minDistance={config.camera.minDistance}
          maxDistance={config.camera.maxDistance}
          minPolarAngle={Math.PI * 0.02}
          maxPolarAngle={Math.PI * 0.98}
          target={config.camera.target}
          enableDamping
          dampingFactor={0.08}
        />
      </Canvas>
    </div>
  );
}
