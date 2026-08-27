"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import * as THREE from "three";

// Both mount client-only, exactly as the Studio does. Server-rendering either
// one produces a hydration mismatch, and a re-generated tree would make the
// captured frame depend on hydration timing rather than on the design.
const DesignEditor = dynamic(
  () => import("@/components/configurator/DesignEditor").then((m) => m.DesignEditor),
  { ssr: false },
);
const Product3DViewer = dynamic(
  () => import("@/components/configurator/Product3DViewer").then((m) => m.Product3DViewer),
  { ssr: false },
);
import { fitElement } from "@/lib/configurator/design-state";
import { cropToFillFrame } from "@/lib/configurator/image-crop";
import { resolveCartonSpec } from "@/lib/configurator/carton-spec";
import { resolveSurfaceDieline } from "@/lib/configurator/resolve-dieline";
import { anglesAtStage, cartonUnfoldPlan } from "@/lib/configurator/unfold-plan";
import { configureDesignTexture } from "@/lib/configurator/texture-manager";
import { PROBE_ARTWORK_PIXELS, probeArtworkDataUri } from "@/lib/qa/probe-artwork";
import type {
  CameraPreset,
  DesignElement,
  ImageElement,
  ProductConfig,
  SurfaceDesign,
  ValidationResult,
} from "@/types/configurator";
import type { ProductExperienceStateId } from "@/lib/qa/product-experience";
import type { ProbeArtworkKind } from "@/lib/qa/probe-artwork";

type Props = {
  captureId: string;
  config: ProductConfig;
  stateId: ProductExperienceStateId;
  artwork: ProbeArtworkKind;
  label: string;
  widthPx: number;
  heightPx: number;
};

const ARTWORK_ELEMENT_ID = "benchmark-artwork";

/** Frames allowed for environment lighting and contact shadows to resolve. */
const SETTLE_MS = 900;

/** Picks the closest declared preset, so poses come from the product itself. */
function presetFor(config: ProductConfig, stateId: ProductExperienceStateId): CameraPreset | null {
  const presets = config.camera.presets;
  if (presets.length === 0) return null;
  const wanted = stateId === "3d-front" ? "front" : stateId === "3d-back" ? "back" : "angled";
  return (
    presets.find((preset) => preset.id === wanted) ??
    presets.find((preset) => preset.id.includes(wanted)) ??
    presets[0]
  );
}

/**
 * Builds the exact design each capture state is meant to show. Placement comes
 * from the same helpers the editor uses, so a capture cannot drift away from
 * the behaviour it is supposed to document.
 */
function designFor(
  config: ProductConfig,
  stateId: ProductExperienceStateId,
  src: string | null,
): SurfaceDesign {
  const surface = config.editableSurfaces[0];
  if (!src || stateId === "empty-editor" || stateId === "dieline-flat") {
    return { background: surface.defaultBackground ?? null, elements: [] };
  }

  const { width: naturalWidth, height: naturalHeight } = PROBE_ARTWORK_PIXELS;
  const coverage = stateId === "artwork-fill" ? 1 : stateId === "artwork-fit" ? 0.9 : 0.55;
  const box = fitElement(
    naturalWidth,
    naturalHeight,
    surface.editorWidth,
    surface.editorHeight,
    coverage,
  );

  const element: ImageElement = {
    id: ARTWORK_ELEMENT_ID,
    type: "image",
    src,
    sourcePixelWidth: naturalWidth,
    sourcePixelHeight: naturalHeight,
    sourceName: "benchmark-probe.svg",
    x: box.x,
    y: box.y,
    width: box.width,
    height: box.height,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
    opacity: 1,
  };

  if (stateId === "artwork-placed" || stateId === "artwork-selected") {
    // Deliberately off-centre. Keeping the offset through the selected state is
    // what makes the snapped capture show a change rather than repeat the
    // previous frame byte for byte.
    return {
      background: surface.defaultBackground ?? null,
      elements: [{ ...element, x: box.x + 37, y: box.y + 23 }],
    };
  }
  if (stateId === "artwork-fill") {
    const frameWidth = surface.editorWidth;
    const frameHeight = surface.editorHeight;
    return {
      background: surface.defaultBackground ?? null,
      elements: [
        {
          ...element,
          x: 0,
          y: 0,
          width: frameWidth,
          height: frameHeight,
          crop: cropToFillFrame(naturalWidth, naturalHeight, frameWidth, frameHeight),
        },
      ],
    };
  }
  if (stateId === "artwork-crop") {
    return {
      background: surface.defaultBackground ?? null,
      elements: [
        { ...element, crop: { x: 0.18, y: 0.12, width: 0.6, height: 0.7 } },
      ],
    };
  }
  return { background: surface.defaultBackground ?? null, elements: [element] };
}

export function ProductExperienceCaptureStage({
  captureId,
  config,
  stateId,
  artwork,
  label,
  widthPx,
  heightPx,
}: Props) {
  const surface = config.editableSurfaces[0];
  const src = useMemo(() => probeArtworkDataUri(artwork, label), [artwork, label]);
  const design = useMemo(() => designFor(config, stateId, src), [config, stateId, src]);
  const dieline = useMemo(() => resolveSurfaceDieline(config, surface), [config, surface]);

  const [images, setImages] = useState<Record<string, HTMLImageElement>>({});
  const [canvases, setCanvases] = useState<Record<string, HTMLCanvasElement | null>>({});
  const [rendererReady, setRendererReady] = useState(false);
  const [presetApplied, setPresetApplied] = useState(false);
  const [painted, setPainted] = useState(false);
  const [settled, setSettled] = useState(false);
  const dirtyRef = useRef<Record<string, boolean>>({});

  /**
   * The flat capture is the assembled model driven to the final stage of its
   * own unfold plan, not a second drawing of the sheet. Rendering it in 3D is
   * what makes it able to disagree with the dieline — which is the whole point
   * of the north-star invariant it exists to watch.
   */
  const flatPose = useMemo(() => {
    if (stateId !== "dieline-flat") return null;
    const carton = resolveCartonSpec(config);
    if (!carton) return null;
    const plan = cartonUnfoldPlan(carton);
    if (!plan) return null;
    return anglesAtStage(plan, plan.steps.length);
  }, [config, stateId]);

  const is3d = stateId.startsWith("3d-") || flatPose !== null;
  const preset = useMemo(
    () => (is3d && flatPose === null ? presetFor(config, stateId) : null),
    [config, flatPose, is3d, stateId],
  );

  useEffect(() => {
    if (!src) return;
    let cancelled = false;
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => {
      if (!cancelled) setImages({ [src]: image });
    };
    image.src = src;
    return () => {
      cancelled = true;
    };
  }, [src]);

  const consumeDirty = useCallback((surfaceId: string) => {
    if (!dirtyRef.current[surfaceId]) return false;
    dirtyRef.current[surfaceId] = false;
    return true;
  }, []);

  const onCanvasReady = useCallback((surfaceId: string, canvas: HTMLCanvasElement | null) => {
    setCanvases((current) =>
      current[surfaceId] === canvas ? current : { ...current, [surfaceId]: canvas },
    );
    if (canvas) dirtyRef.current[surfaceId] = true;
  }, []);

  /**
   * The 3D capture consumes the same backing canvas the 2D editor draws, so a
   * capture can never show artwork the editor did not actually produce.
   */
  const textures = useMemo(() => {
    const next: Record<string, THREE.CanvasTexture | null> = {};
    for (const editable of config.editableSurfaces) {
      const canvas = canvases[editable.id];
      if (!canvas) continue;
      const texture = new THREE.CanvasTexture(canvas);
      configureDesignTexture(texture);
      next[editable.id] = texture;
    }
    return next;
  }, [canvases, config.editableSurfaces]);

  useEffect(() => {
    for (const key of Object.keys(textures)) dirtyRef.current[key] = true;
    return () => {
      Object.values(textures).forEach((texture) => texture?.dispose());
    };
  }, [textures]);

  /**
   * Fired once the WebGL renderer exists. Unlike onValidated it reaches every
   * family, not only GLB products — pouches, cartons and flat sheets have no
   * GLB to validate and would otherwise never report themselves ready.
   */
  const onCaptureReady = useCallback(() => setRendererReady(true), []);

  /**
   * Fired after the editor has actually drawn its artwork layer. Readiness has
   * to mean "the thing being captured is on screen": keying it off image
   * decoding instead let the screenshot land on an unpainted frame, and every
   * 2D capture came back blank.
   */
  const onPainted = useCallback(() => setPainted(true), []);

  /**
   * A short settle window once the content exists. Environment lighting and
   * contact shadows resolve over several frames, and the editor repaints once
   * its ResizeObserver has measured the column; capturing before either lands
   * produces a flat, misleading image.
   */
  useEffect(() => {
    const contentReady = is3d ? rendererReady : painted;
    if (!contentReady) return;
    const handle = setTimeout(() => setSettled(true), SETTLE_MS);
    return () => clearTimeout(handle);
  }, [is3d, painted, rendererReady]);

  const artworkReady = src === null || Object.keys(images).length > 0;
  const textureReady =
    src === null || (painted && Object.keys(textures).length > 0);
  const ready = is3d
    ? rendererReady && settled && textureReady && (preset === null || presetApplied)
    : artworkReady && painted && settled;

  /**
   * The editor scales its stage to the width it is given, which is right in the
   * app but crops a tall product here: the 191.5 x 684 mm measured web is nine
   * times taller than it is wide, so a full-width capture showed only its top
   * slice and every state looked identical. Constrain the width so the derived
   * height also fits the capture viewport.
   */
  const editorFitWidth = useMemo(() => {
    const aspect = surface.editorWidth / surface.editorHeight;
    return Math.max(1, Math.min(widthPx, Math.floor(heightPx * aspect)));
  }, [heightPx, surface.editorHeight, surface.editorWidth, widthPx]);

  const noop = useCallback(() => {}, []);
  // Captures are non-interactive: the design is fixed by `designFor`, so edits
  // are accepted and discarded rather than being wired to state.
  const noopChange = useCallback<
    (id: string, patch: Partial<DesignElement>, transient: boolean) => void
  >(() => {}, []);
  const noopValidated = useCallback<(result: ValidationResult) => void>(() => {}, []);
  const onPresetApplied = useCallback(() => setPresetApplied(true), []);

  return (
    <main
      data-capture-id={captureId}
      data-capture-ready={ready ? "true" : "false"}
      data-capture-state={stateId}
      data-capture-product={config.id}
      style={{ width: widthPx, height: heightPx, overflow: "hidden" }}
      className="bg-neutral-100"
    >
      {is3d ? (
        <>
          {/*
            Off-screen, but really rendered: this is the texture source, so a
            3D capture can only ever show artwork the editor actually drew.
            Deliberately not readOnly — that mode gives up texture ownership,
            and without ownership no canvas is published and the model would be
            captured untextured.
          */}
          <div aria-hidden style={{ position: "absolute", left: -99999, top: 0 }}>
            <DesignEditor
              surface={surface}
              design={design}
              images={images}
              selectedId={null}
              showGuides={false}
              onSelect={noop}
              onChange={noopChange}
              onCommit={noop}
              onCanvasReady={onCanvasReady}
              onDirty={onPainted}
              showProductionChrome={false}
            />
          </div>
          <Product3DViewer
            config={config}
            textures={textures}
            consumeDirty={consumeDirty}
            pendingPreset={presetApplied ? null : preset}
            onPresetApplied={onPresetApplied}
            onValidated={noopValidated}
            onCaptureReady={onCaptureReady}
            hingeAngles={flatPose ?? undefined}
            dielineView={flatPose !== null}
          />
        </>
      ) : (
        <div
          style={{ width: editorFitWidth, height: heightPx, margin: "0 auto" }}
          className="flex items-center"
        >
        <DesignEditor
          surface={surface}
          design={design}
          images={images}
          selectedId={
            stateId === "artwork-selected" ||
            stateId === "artwork-snapped" ||
            stateId === "artwork-crop"
              ? ARTWORK_ELEMENT_ID
              : null
          }
          showGuides
          onSelect={noop}
          onChange={noopChange}
          onCommit={noop}
          onCanvasReady={onCanvasReady}
          onDirty={onPainted}
          dieline={dieline}
          cropMode={stateId === "artwork-crop"}
          showProductionChrome={false}
        />
        </div>
      )}
    </main>
  );
}
