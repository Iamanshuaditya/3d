"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import * as THREE from "three";
import type {
  DesignDocument,
  DesignElement,
  ProductConfig,
  ValidationResult,
} from "@/types/configurator";
import type { SceneDebugInfo } from "@/lib/configurator/model-validator";
import type { ArtworkRenderMode } from "@/types/embroidery";
import { DEFAULT_EMBROIDERY, type EmbroiderySettings } from "@/types/embroidery";
import { useArtworkImages } from "@/lib/configurator/use-artwork-images";
import { useEmbroidery } from "@/lib/embroidery/use-embroidery";
import { useProjectSession } from "@/lib/projects/use-project-session";
import { configureDesignTexture } from "@/lib/configurator/texture-manager";
import {
  cancelTransient,
  commit,
  centeredOrigin,
  createEmptyDocument,
  createHistory,
  fitElement,
  fitElementToSection,
  nextId,
  redo,
  reduceHistory,
  sectionBox,
  undo,
  type DesignAction,
  type History,
} from "@/lib/configurator/design-state";
import { cropToFillFrame } from "@/lib/configurator/image-crop";
import type { ImageCrop } from "@/types/configurator";
import { effectiveImagePpi, imageQualityState } from "@/lib/print/preflight";
import { getPrinterProfile } from "@/lib/print/printer-profiles";

type HistoryAction =
  | { kind: "apply"; action: DesignAction; transient?: boolean }
  | { kind: "replace"; document: DesignDocument }
  | { kind: "commit" }
  | { kind: "cancelTransient" }
  | { kind: "undo" }
  | { kind: "redo" };

function historyReducer(
  state: History<DesignDocument>,
  action: HistoryAction,
): History<DesignDocument> {
  switch (action.kind) {
    case "apply":
      return reduceHistory(state, action.action, { transient: action.transient });
    case "replace":
      // Opening a project is a history boundary. The previous empty/loading
      // document must never become an undo target that can erase saved work.
      return createHistory(action.document);
    case "commit":
      return commit(state);
    case "cancelTransient":
      return cancelTransient(state);
    case "undo":
      return undo(state);
    case "redo":
      return redo(state);
  }
}

/**
 * All customizer state and behaviour, independent of layout.
 *
 * Shared by the standalone /configurator page and the Studio shell so both
 * drive exactly the same engine — the 2D design remains the source of truth
 * and the 3D view is a live CanvasTexture preview.
 */
export function useCustomizer(
  config: ProductConfig,
  requestedProjectId: string | null = null,
  keyboardShortcutsEnabled = true,
) {
  const [history, dispatch] = useReducer(historyReducer, config, (c) =>
    createHistory(createEmptyDocument(c)),
  );
  const design = history.present;

  const [activeSurfaceId, setActiveSurfaceId] = useState(config.editableSurfaces[0].id);
  const [activeSectionId, setActiveSectionId] = useState<string | null>(
    config.editableSurfaces[0].sections?.[0]?.id ?? null,
  );
  const [hoveredMeshName, setHoveredMeshName] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showGuides, setShowGuides] = useState(true);
  const [cropMode, setCropMode] = useState(false);
  const [croppingElementId, setCroppingElementId] = useState<string | null>(null);
  const [canvases, setCanvases] = useState<Record<string, HTMLCanvasElement | null>>({});
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [debugInfo, setDebugInfo] = useState<SceneDebugInfo[]>([]);
  const [commitSequence, setCommitSequence] = useState(0);

  const dirtyRef = useRef<Record<string, boolean>>({});

  const handleProjectDocumentLoaded = useCallback((document: DesignDocument) => {
    dispatch({ kind: "replace", document });
    setSelectedId(null);
  }, []);

  const projectSession = useProjectSession(
    config,
    requestedProjectId,
    design,
    commitSequence,
    handleProjectDocumentLoaded,
  );
  const uploadProjectAsset = projectSession.uploadAsset;

  const markCommitted = useCallback(() => {
    setCommitSequence((sequence) => sequence + 1);
  }, []);

  // A held surface id can outlive the config it came from (switching products
  // keeps this hook mounted), so fall back to the first surface rather than
  // dereferencing undefined.
  const activeSurface = useMemo(
    () =>
      config.editableSurfaces.find((s) => s.id === activeSurfaceId) ??
      config.editableSurfaces[0],
    [config, activeSurfaceId],
  );
  const activeDesign = design.surfaces[activeSurfaceId];
  const activeSection = useMemo(
    () => activeSurface.sections?.find((section) => section.id === activeSectionId) ?? null,
    [activeSectionId, activeSurface.sections],
  );
  const activeSectionBox = useMemo(
    () => (activeSection ? sectionBox(activeSurface, activeSection) : null),
    [activeSection, activeSurface],
  );
  const selectedElement = activeDesign?.elements.find((el) => el.id === selectedId) ?? null;
  const selectedImageQuality = useMemo(() => {
    if (!selectedElement || selectedElement.type !== "image") return null;
    const profile = getPrinterProfile(config.printProfileId);
    const ppi = effectiveImagePpi(
      selectedElement,
      activeSurface.editorWidth,
      activeSurface.editorHeight,
      activeSurface.physicalWidthCm * 10,
      activeSurface.physicalHeightCm * 10,
    );
    return {
      ppi,
      state: imageQualityState(ppi, profile.minimumImagePpi, profile.warningImagePpi),
      minimumPpi: profile.minimumImagePpi,
      warningPpi: profile.warningImagePpi,
    };
  }, [activeSurface, config.printProfileId, selectedElement]);

  // ---- Textures: one per canvas, updated in place (§15/§38) -----------------
  const textures = useMemo(() => {
    const next: Record<string, THREE.CanvasTexture | null> = {};
    for (const surface of config.editableSurfaces) {
      const canvas = canvases[surface.id];
      if (!canvas) {
        next[surface.id] = null;
        continue;
      }
      const texture = new THREE.CanvasTexture(canvas);
      configureDesignTexture(texture);
      next[surface.id] = texture;
    }
    return next;
  }, [canvases, config]);

  useEffect(() => {
    for (const key of Object.keys(textures)) dirtyRef.current[key] = true;
    return () => {
      Object.values(textures).forEach((t) => t?.dispose());
    };
  }, [textures]);

  // ---- Derived artwork treatments (embroidery) ------------------------------
  const images = useArtworkImages(design);
  const embroidery = useEmbroidery(config, design, images);

  /**
   * Material maps for the 3D preview. Only surfaces that actually carry
   * stitching get textures, so printed products stay on the exact material
   * they have today.
   */
  const materialTextures = useMemo(() => {
    const next: Record<
      string,
      { normal: THREE.CanvasTexture; roughness: THREE.CanvasTexture } | null
    > = {};
    for (const surface of config.editableSurfaces) {
      const maps = embroidery.surfaceMaps[surface.id];
      if (!maps || !embroidery.surfacesWithEmbroidery[surface.id]) {
        next[surface.id] = null;
        continue;
      }
      const normal = new THREE.CanvasTexture(maps.normal);
      const roughness = new THREE.CanvasTexture(maps.roughness);
      for (const texture of [normal, roughness]) {
        texture.flipY = true;
        texture.colorSpace = THREE.NoColorSpace;
        texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
        texture.anisotropy = 8;
      }
      next[surface.id] = { normal, roughness };
    }
    return next;
    // Surfaces gaining or losing stitching is what changes the binding; the
    // canvases themselves are persistent and re-uploaded via needsUpdate.
  }, [config.editableSurfaces, embroidery.surfaceMaps, embroidery.surfacesWithEmbroidery]);

  useEffect(() => {
    return () => {
      for (const pair of Object.values(materialTextures)) {
        pair?.normal.dispose();
        pair?.roughness.dispose();
      }
    };
  }, [materialTextures]);

  useEffect(() => {
    for (const pair of Object.values(materialTextures)) {
      if (!pair) continue;
      // Three.js's required re-upload signal for an externally-owned canvas.
      pair.normal.needsUpdate = true;
      pair.roughness.needsUpdate = true;
    }
  }, [materialTextures, embroidery.mapsVersion]);

  const markDirty = useCallback((surfaceId: string) => {
    dirtyRef.current[surfaceId] = true;
  }, []);

  const consumeDirty = useCallback((surfaceId: string) => {
    if (!dirtyRef.current[surfaceId]) return false;
    dirtyRef.current[surfaceId] = false;
    return true;
  }, []);

  const scheduleDirty = useCallback(
    (surfaceId: string) => {
      requestAnimationFrame(() => markDirty(surfaceId));
    },
    [markDirty],
  );

  const registerCanvas = useCallback(
    (surfaceId: string, canvas: HTMLCanvasElement | null) => {
      setCanvases((prev) =>
        prev[surfaceId] === canvas ? prev : { ...prev, [surfaceId]: canvas },
      );
    },
    [],
  );

  // ---- Mutations ------------------------------------------------------------
  const applyChange = useCallback(
    (id: string, patch: Partial<DesignElement>, transient: boolean) => {
      dispatch({
        kind: "apply",
        action: { type: "update", surfaceId: activeSurfaceId, id, patch: patch as never },
        transient,
      });
      if (!transient) markCommitted();
    },
    [activeSurfaceId, markCommitted],
  );

  const commitHistory = useCallback(() => {
    dispatch({ kind: "commit" });
    markCommitted();
  }, [markCommitted]);

  const beginCrop = useCallback(() => {
    if (!selectedElement || selectedElement.type !== "image" || selectedElement.locked) return;
    setCroppingElementId(selectedElement.id);
    setCropMode(true);
  }, [selectedElement]);

  const updateSelectedCrop = useCallback(
    (crop: ImageCrop | undefined) => {
      if (
        !cropMode ||
        !selectedElement ||
        selectedElement.type !== "image" ||
        selectedElement.id !== croppingElementId
      ) return;
      applyChange(selectedElement.id, { crop }, true);
      scheduleDirty(activeSurfaceId);
    },
    [activeSurfaceId, applyChange, cropMode, croppingElementId, scheduleDirty, selectedElement],
  );

  const finishCrop = useCallback(() => {
    if (!cropMode) return;
    commitHistory();
    setCroppingElementId(null);
    setCropMode(false);
  }, [commitHistory, cropMode]);

  const cancelCrop = useCallback(() => {
    if (!cropMode) return;
    dispatch({ kind: "cancelTransient" });
    scheduleDirty(activeSurfaceId);
    setCroppingElementId(null);
    setCropMode(false);
  }, [activeSurfaceId, cropMode, scheduleDirty]);

  useEffect(() => {
    if (cropMode && croppingElementId !== selectedId) cancelCrop();
  }, [cancelCrop, cropMode, croppingElementId, selectedId]);

  const uploadFiles = useCallback(
    async (files: FileList) => {
      for (const file of Array.from(files)) {
        if (!file.type.startsWith("image/")) continue;
        try {
          const asset = await uploadProjectAsset(file);
          const width = asset.width;
          const height = asset.height;
          if (!width || !height) throw new Error("Uploaded image has no dimensions.");
          const placement = activeSection && activeSectionBox
            ? fitElementToSection(
                width,
                height,
                activeSectionBox,
                activeSection.contentRotation,
              )
            : {
                ...fitElement(
                  width,
                  height,
                  activeSurface.editorWidth,
                  activeSurface.editorHeight,
                ),
                rotation: 0,
              };
          const element: DesignElement = {
            id: nextId("img"),
            type: "image",
            assetId: asset.id,
            src: asset.readUrl,
            sourcePixelWidth: width,
            sourcePixelHeight: height,
            sourceName: asset.filename,
            sourceMimeType: asset.mimeType,
            ...placement,
            scaleX: 1,
            scaleY: 1,
            opacity: 1,
          };
          dispatch({
            kind: "apply",
            action: { type: "add", surfaceId: activeSurfaceId, element },
          });
          setSelectedId(element.id);
          scheduleDirty(activeSurfaceId);
          markCommitted();
        } catch (cause) {
          window.alert(
            cause instanceof Error
              ? cause.message
              : `Could not upload "${file.name}". Please use a PNG, JPG or WebP.`,
          );
        }
      }
    },
    [
      activeSection,
      activeSectionBox,
      activeSurface,
      activeSurfaceId,
      markCommitted,
      scheduleDirty,
      uploadProjectAsset,
    ],
  );

  const addText = useCallback(() => {
    const text = activeSection ? "Type text here" : "Your text";
    const fontSize = 84;
    const rotation = activeSection?.contentRotation ?? 0;
    const target = activeSectionBox ?? {
      x: 0,
      y: 0,
      width: activeSurface.editorWidth,
      height: activeSurface.editorHeight,
    };
    const element: DesignElement = {
      id: nextId("txt"),
      type: "text",
      text,
      ...centeredOrigin(target, text.length * fontSize * 0.54, fontSize, rotation),
      fontFamily: "Graphik, sans-serif",
      fontSize,
      fill: "#111111",
      rotation,
      scaleX: 1,
      scaleY: 1,
      opacity: 1,
    };
    dispatch({ kind: "apply", action: { type: "add", surfaceId: activeSurfaceId, element } });
    setSelectedId(element.id);
    scheduleDirty(activeSurfaceId);
    markCommitted();
  }, [activeSection, activeSectionBox, activeSurface, activeSurfaceId, markCommitted, scheduleDirty]);

  const removeElement = useCallback(
    (id: string) => {
      dispatch({ kind: "apply", action: { type: "remove", surfaceId: activeSurfaceId, id } });
      setSelectedId((cur) => (cur === id ? null : cur));
      scheduleDirty(activeSurfaceId);
      markCommitted();
    },
    [activeSurfaceId, markCommitted, scheduleDirty],
  );

  const deleteSelected = useCallback(() => {
    if (selectedId) removeElement(selectedId);
  }, [selectedId, removeElement]);

  const duplicateSelected = useCallback(() => {
    if (!selectedElement) return;
    const duplicate: DesignElement = {
      ...selectedElement,
      id: nextId(selectedElement.type === "image" ? "img" : "txt"),
      x: selectedElement.x + 16,
      y: selectedElement.y + 16,
      locked: false,
    };
    dispatch({
      kind: "apply",
      action: { type: "add", surfaceId: activeSurfaceId, element: duplicate },
    });
    setSelectedId(duplicate.id);
    scheduleDirty(activeSurfaceId);
    markCommitted();
  }, [activeSurfaceId, markCommitted, scheduleDirty, selectedElement]);

  const toggleSelectedLock = useCallback(() => {
    if (!selectedElement) return;
    applyChange(selectedElement.id, { locked: !selectedElement.locked }, false);
  }, [applyChange, selectedElement]);

  const replaceSelectedImage = useCallback(
    async (file: File) => {
      if (!selectedElement || selectedElement.type !== "image" || !file.type.startsWith("image/")) {
        return;
      }
      try {
        const asset = await uploadProjectAsset(file);
        if (!asset.width || !asset.height) throw new Error("Replacement image has no dimensions.");
        applyChange(
          selectedElement.id,
          {
            assetId: asset.id,
            src: asset.readUrl,
            sourcePixelWidth: asset.width,
            sourcePixelHeight: asset.height,
            sourceName: asset.filename,
            sourceMimeType: asset.mimeType,
            crop: cropToFillFrame(
              asset.width,
              asset.height,
              selectedElement.width,
              selectedElement.height,
            ),
          },
          false,
        );
        scheduleDirty(activeSurfaceId);
      } catch (cause) {
        window.alert(cause instanceof Error ? cause.message : "Could not replace this artwork.");
      }
    },
    [activeSurfaceId, applyChange, scheduleDirty, selectedElement, uploadProjectAsset],
  );

  const reorderElement = useCallback(
    (id: string, direction: "up" | "down") => {
      dispatch({
        kind: "apply",
        action: { type: "reorder", surfaceId: activeSurfaceId, id, direction },
      });
      scheduleDirty(activeSurfaceId);
      markCommitted();
    },
    [activeSurfaceId, markCommitted, scheduleDirty],
  );

  const setBackground = useCallback(
    (color: string | null) => {
      dispatch({ kind: "apply", action: { type: "background", surfaceId: activeSurfaceId, color } });
      scheduleDirty(activeSurfaceId);
      markCommitted();
    },
    [activeSurfaceId, markCommitted, scheduleDirty],
  );

  const centerSelected = useCallback(() => {
    if (!selectedElement) return;
    const w =
      selectedElement.type === "image"
        ? selectedElement.width * selectedElement.scaleX
        : selectedElement.fontSize * 6;
    const h =
      selectedElement.type === "image"
        ? selectedElement.height * selectedElement.scaleY
        : selectedElement.fontSize;
    const target = activeSectionBox ?? {
      x: 0,
      y: 0,
      width: activeSurface.editorWidth,
      height: activeSurface.editorHeight,
    };
    applyChange(
      selectedElement.id,
      centeredOrigin(target, w, h, selectedElement.rotation),
      false,
    );
    scheduleDirty(activeSurfaceId);
  }, [selectedElement, activeSectionBox, activeSurface, applyChange, activeSurfaceId, scheduleDirty]);

  const fitSelected = useCallback(() => {
    if (!selectedElement || selectedElement.type !== "image") return;
    const sourceWidth = selectedElement.sourcePixelWidth ?? selectedElement.width;
    const sourceHeight = selectedElement.sourcePixelHeight ?? selectedElement.height;
    const placement = activeSection && activeSectionBox
      ? fitElementToSection(
          sourceWidth,
          sourceHeight,
          activeSectionBox,
          activeSection.contentRotation,
          0.8,
        )
      : {
          ...fitElement(
            sourceWidth,
            sourceHeight,
            activeSurface.editorWidth,
            activeSurface.editorHeight,
            0.8,
          ),
          rotation: 0,
        };
    applyChange(
      selectedElement.id,
      { ...placement, scaleX: 1, scaleY: 1, crop: undefined },
      false,
    );
    scheduleDirty(activeSurfaceId);
  }, [
    selectedElement,
    activeSection,
    activeSectionBox,
    activeSurface,
    applyChange,
    activeSurfaceId,
    scheduleDirty,
  ]);

  /**
   * Stretch the selection to the full print area. Packaging artwork is almost
   * always supplied full-bleed, so "fit inside" is the wrong default here.
   */
  const fillSelected = useCallback(() => {
    if (!selectedElement || selectedElement.type !== "image") return;
    if (activeSection && activeSectionBox) {
      const quarterTurn = Math.abs(activeSection.contentRotation % 180) === 90;
      const width = quarterTurn ? activeSectionBox.height : activeSectionBox.width;
      const height = quarterTurn ? activeSectionBox.width : activeSectionBox.height;
      applyChange(
        selectedElement.id,
        {
          ...centeredOrigin(
            activeSectionBox,
            width,
            height,
            activeSection.contentRotation,
          ),
          width,
          height,
          scaleX: 1,
          scaleY: 1,
          rotation: activeSection.contentRotation,
          crop: cropToFillFrame(
            selectedElement.sourcePixelWidth ?? selectedElement.width,
            selectedElement.sourcePixelHeight ?? selectedElement.height,
            width,
            height,
          ),
        },
        false,
      );
      scheduleDirty(activeSurfaceId);
      return;
    }
    applyChange(
      selectedElement.id,
      {
        x: 0,
        y: 0,
        width: activeSurface.editorWidth,
        height: activeSurface.editorHeight,
        scaleX: 1,
        scaleY: 1,
        rotation: 0,
        crop: cropToFillFrame(
          selectedElement.sourcePixelWidth ?? selectedElement.width,
          selectedElement.sourcePixelHeight ?? selectedElement.height,
          activeSurface.editorWidth,
          activeSurface.editorHeight,
        ),
      },
      false,
    );
    scheduleDirty(activeSurfaceId);
  }, [
    selectedElement,
    activeSection,
    activeSectionBox,
    activeSurface,
    applyChange,
    activeSurfaceId,
    scheduleDirty,
  ]);

  /**
   * Switches how a placed image is reproduced. Non-destructive by
   * construction: only the treatment block changes, so returning to "print"
   * gives back the customer's original asset untouched.
   */
  const setElementRenderMode = useCallback(
    (id: string, mode: ArtworkRenderMode) => {
      const element = design.surfaces[activeSurfaceId]?.elements.find((el) => el.id === id);
      if (!element || element.type !== "image") return;
      const previous =
        element.treatment?.mode === "embroidery" ? element.treatment.settings : DEFAULT_EMBROIDERY;
      dispatch({
        kind: "apply",
        action: {
          type: "update",
          surfaceId: activeSurfaceId,
          id,
          patch: {
            treatment:
              mode === "embroidery" ? { mode: "embroidery", settings: previous } : { mode: "print" },
          } as never,
        },
      });
      scheduleDirty(activeSurfaceId);
      markCommitted();
    },
    [activeSurfaceId, design.surfaces, markCommitted, scheduleDirty],
  );

  const updateEmbroiderySettings = useCallback(
    (id: string, patch: Partial<EmbroiderySettings>, transient = false) => {
      const element = design.surfaces[activeSurfaceId]?.elements.find((el) => el.id === id);
      if (!element || element.type !== "image" || element.treatment?.mode !== "embroidery") return;
      dispatch({
        kind: "apply",
        action: {
          type: "update",
          surfaceId: activeSurfaceId,
          id,
          patch: {
            treatment: {
              mode: "embroidery",
              settings: { ...element.treatment.settings, ...patch },
            },
          } as never,
        },
        transient,
      });
      scheduleDirty(activeSurfaceId);
      if (!transient) markCommitted();
    },
    [activeSurfaceId, design.surfaces, markCommitted, scheduleDirty],
  );

  const resetSurface = useCallback(() => {
    dispatch({ kind: "apply", action: { type: "resetSurface", surfaceId: activeSurfaceId } });
    setSelectedId(null);
    scheduleDirty(activeSurfaceId);
    markCommitted();
  }, [activeSurfaceId, markCommitted, scheduleDirty]);

  const selectSurface = useCallback(
    (surfaceId: string) => {
      const surface = config.editableSurfaces.find((candidate) => candidate.id === surfaceId);
      setActiveSurfaceId(surfaceId);
      setActiveSectionId(surface?.sections?.[0]?.id ?? null);
      setSelectedId(null);
    },
    [config.editableSurfaces],
  );

  const selectSection = useCallback((sectionId: string) => {
    setActiveSectionId(sectionId);
    setSelectedId(null);
  }, []);

  const selectMesh = useCallback(
    (meshName: string) => {
      for (const surface of config.editableSurfaces) {
        const section = surface.sections?.find((candidate) => candidate.meshName === meshName);
        if (!section) continue;
        setActiveSurfaceId(surface.id);
        setActiveSectionId(section.id);
        setSelectedId(null);
        return;
      }
    },
    [config.editableSurfaces],
  );

  const doUndo = useCallback(() => {
    dispatch({ kind: "undo" });
    markCommitted();
  }, [markCommitted]);
  const doRedo = useCallback(() => {
    dispatch({ kind: "redo" });
    markCommitted();
  }, [markCommitted]);

  // ---- Keyboard shortcuts ---------------------------------------------------
  useEffect(() => {
    if (!keyboardShortcutsEnabled) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA)$/.test(target.tagName)) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        dispatch({ kind: e.shiftKey ? "redo" : "undo" });
        scheduleDirty(activeSurfaceId);
        markCommitted();
        return;
      }
      if (e.key === "Escape" && cropMode) {
        e.preventDefault();
        cancelCrop();
        return;
      }
      if (e.key === "Enter" && cropMode) {
        e.preventDefault();
        finishCrop();
        return;
      }
      if ((e.key === "Delete" || e.key === "Backspace") && selectedId) {
        e.preventDefault();
        removeElement(selectedId);
        return;
      }
      if (mod && e.key.toLowerCase() === "d" && selectedElement) {
        e.preventDefault();
        duplicateSelected();
        return;
      }
      if (
        selectedElement &&
        !selectedElement.locked &&
        ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)
      ) {
        e.preventDefault();
        const distance = e.shiftKey ? 10 : 1;
        const x = selectedElement.x + (e.key === "ArrowLeft" ? -distance : e.key === "ArrowRight" ? distance : 0);
        const y = selectedElement.y + (e.key === "ArrowUp" ? -distance : e.key === "ArrowDown" ? distance : 0);
        applyChange(selectedElement.id, { x, y }, false);
        scheduleDirty(activeSurfaceId);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    selectedId,
    removeElement,
    activeSurfaceId,
    keyboardShortcutsEnabled,
    markCommitted,
    scheduleDirty,
    selectedElement,
    duplicateSelected,
    applyChange,
    cropMode,
    cancelCrop,
    finishCrop,
  ]);

  useEffect(() => {
    scheduleDirty(activeSurfaceId);
  }, [history.present, activeSurfaceId, scheduleDirty]);

  const handleValidated = useCallback((result: ValidationResult, debug: SceneDebugInfo[]) => {
    setValidation(result);
    setDebugInfo(debug);
  }, []);

  return {
    design,
    activeSurface,
    activeSurfaceId,
    activeDesign,
    activeSection,
    activeSectionId,
    selectSurface,
    selectSection,
    selectMesh,
    hoveredMeshName,
    setHoveredMeshName,
    setActiveSurfaceId,
    selectedId,
    setSelectedId,
    selectedElement,
    selectedImageQuality,
    cropMode,
    beginCrop,
    updateSelectedCrop,
    finishCrop,
    cancelCrop,
    showGuides,
    setShowGuides,
    textures,
    materialTextures,
    images,
    embroidery,
    setElementRenderMode,
    updateEmbroiderySettings,
    registerCanvas,
    markDirty,
    consumeDirty,
    scheduleDirty,
    applyChange,
    commitHistory,
    uploadFiles,
    addText,
    removeElement,
    deleteSelected,
    duplicateSelected,
    toggleSelectedLock,
    replaceSelectedImage,
    reorderElement,
    setBackground,
    centerSelected,
    fitSelected,
    fillSelected,
    resetSurface,
    undo: doUndo,
    redo: doRedo,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
    validation,
    debugInfo,
    handleValidated,
    project: projectSession.project,
    projectId: projectSession.projectId,
    saveState: projectSession.saveState,
    projectError: projectSession.error,
    retrySave: projectSession.retrySave,
    saveNow: projectSession.saveNow,
  };
}
