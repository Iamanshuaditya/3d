"use client";

import { Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import { Bounds, Environment, Html } from "@react-three/drei";
import * as THREE from "three";
import type { ProductConfig } from "@/types/configurator";
import { ProductModel } from "@/components/configurator/ProductModel";
import { CartonModel } from "@/components/configurator/CartonModel";
import { PouchModel } from "@/components/configurator/PouchModel";
import { FlatSheetModel } from "@/components/configurator/FlatSheetModel";
import { FilmLighting } from "@/components/configurator/FilmLighting";
import { resolveCartonSpec } from "@/lib/configurator/carton-spec";
import { POUCHES } from "@/lib/configurator/pouch-spec";
import { previewBackground } from "@/lib/configurator/product-summary";

/**
 * Passive, artwork-free preview of a registered product. It shares the model
 * components and lighting response with the studio viewer so a product looks
 * the same in the library as it does on the editing stage — but it carries no
 * textures, no controls and no capture bridge.
 */
type Product3DPreviewProps = {
  config: ProductConfig;
  captureMode?: boolean;
};

const NO_TEXTURES: Record<string, THREE.CanvasTexture | null> = {};
const neverDirty = () => false;

function PreviewFallback() {
  return (
    <Html center>
      <span className="whitespace-nowrap text-xs text-[var(--st-dim)]">Loading preview…</span>
    </Html>
  );
}

export function Product3DPreview({ config, captureMode = false }: Product3DPreviewProps) {
  // Same three-way branch as the studio viewer: generated pouch, generated
  // carton, otherwise a GLB. Products in the first two families carry no mesh
  // file, so routing one of them to the GLB loader would request "" and get
  // the HTML 404 page back.
  const cartonSpec = resolveCartonSpec(config);
  const pouchSpec = config.family === "pouch" ? POUCHES[config.pouchSpecId ?? ""] : null;
  const useClearBarrierResponse = config.materialProfile === "clear-barrier-gloss";
  // A config with no generated geometry and no mesh file has nothing to draw.
  const hasSource = Boolean(config.family === "flat-sheet" || pouchSpec || cartonSpec || config.modelUrl);

  if (!hasSource) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-[12px] text-black/40">No geometry to preview</p>
      </div>
    );
  }

  return (
    <Canvas
      frameloop="demand"
      dpr={[1, 1.5]}
      // Several previews share the page, so each one stays cheap: no shadow
      // maps, and the renderer may drop resolution before it drops frames.
      performance={{ min: 0.5 }}
      gl={{
        antialias: true,
        alpha: false,
        preserveDrawingBuffer: captureMode,
        toneMapping: useClearBarrierResponse
          ? THREE.NoToneMapping
          : THREE.ACESFilmicToneMapping,
        toneMappingExposure: 1,
      }}
      camera={{ position: config.camera.initial, fov: 32 }}
      onCreated={({ camera }) => camera.lookAt(...config.camera.target)}
    >
      <color attach="background" args={[previewBackground()]} />

      {config.materialProfile === "satin-laminate" ? (
        <>
          <FilmLighting />
          <directionalLight position={[1.5, 3.5, 6]} intensity={2} />
        </>
      ) : useClearBarrierResponse ? (
        <>
          <ambientLight color={0xffffff} intensity={2.2} />
          <pointLight position={[0, 0, 2.47]} intensity={0.42} distance={4.12} decay={1} />
          <pointLight position={[0, 0, -2.47]} intensity={0.42} distance={4.12} decay={1} />
          <pointLight position={[2.47, 0, 0]} intensity={0.3885} distance={4.12} decay={1} />
          <pointLight position={[-2.47, 0, 0]} intensity={0.3885} distance={4.12} decay={1} />
          <pointLight position={[0, -2.47, 0]} intensity={0.4515} distance={4.12} decay={1} />
          <pointLight position={[0, 2.47, 0]} intensity={0.42} distance={4.12} decay={1} />
        </>
      ) : (
        <>
          <ambientLight intensity={0.26} />
          <directionalLight position={[3, 6, 4]} intensity={1.2} />
          <directionalLight position={[-4, 3, -3]} intensity={0.34} />
          {/* Rim from behind keeps white packaging from merging with the tile. */}
          <directionalLight position={[-2, 1.5, -5]} intensity={0.5} />
        </>
      )}

      <Suspense fallback={<PreviewFallback />}>
        <Bounds fit clip observe margin={1.25} maxDuration={0}>
          {config.family === "flat-sheet" ? (
            <FlatSheetModel
              config={config}
              textures={NO_TEXTURES}
              consumeDirty={neverDirty}
            />
          ) : pouchSpec ? (
            <PouchModel
              spec={pouchSpec}
              config={config}
              textures={NO_TEXTURES}
              consumeDirty={neverDirty}
            />
          ) : cartonSpec ? (
            <CartonModel
              spec={cartonSpec}
              config={config}
              textures={NO_TEXTURES}
              consumeDirty={neverDirty}
            />
          ) : config.modelUrl ? (
            <ProductModel
              config={config}
              textures={NO_TEXTURES}
              consumeDirty={neverDirty}
              onValidated={() => {}}
            />
          ) : null}
        </Bounds>
        {!useClearBarrierResponse && config.materialProfile !== "satin-laminate" && <Environment preset="studio" />}
      </Suspense>
    </Canvas>
  );
}
