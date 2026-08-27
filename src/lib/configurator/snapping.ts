import { transformedElementBounds, type EditorBounds } from "./editor-selection";
import type { DesignElement } from "@/types/configurator";

export type SnapTargetKind = "canvas" | "panel" | "print-guide" | "object";
export type SnapTarget = Readonly<{
  axis: "x" | "y";
  value: number;
  kind: SnapTargetKind;
  label: string;
  priority: number;
}>;

export type SnapGuide = Readonly<{
  axis: "x" | "y";
  value: number;
  kind: SnapTargetKind;
  label: string;
}>;

export type SnapResult = Readonly<{
  x: number;
  y: number;
  guides: readonly SnapGuide[];
}>;

type BuildSnapTargetsInput = Readonly<{
  canvasWidth: number;
  canvasHeight: number;
  panels?: readonly EditorBounds[];
  printGuides?: readonly EditorBounds[];
  elements?: readonly DesignElement[];
  excludeElementId?: string;
}>;

function targetsForBounds(
  bounds: EditorBounds,
  kind: SnapTargetKind,
  label: string,
  priority: number,
): SnapTarget[] {
  return [
    { axis: "x", value: bounds.x, kind, label: `${label} left`, priority },
    {
      axis: "x",
      value: bounds.x + bounds.width / 2,
      kind,
      label: `${label} horizontal centre`,
      priority,
    },
    { axis: "x", value: bounds.x + bounds.width, kind, label: `${label} right`, priority },
    { axis: "y", value: bounds.y, kind, label: `${label} top`, priority },
    {
      axis: "y",
      value: bounds.y + bounds.height / 2,
      kind,
      label: `${label} vertical centre`,
      priority,
    },
    { axis: "y", value: bounds.y + bounds.height, kind, label: `${label} bottom`, priority },
  ];
}

export function buildSnapTargets({
  canvasWidth,
  canvasHeight,
  panels = [],
  printGuides = [],
  elements = [],
  excludeElementId,
}: BuildSnapTargetsInput): readonly SnapTarget[] {
  const targets: SnapTarget[] = [
    { axis: "x", value: canvasWidth / 2, kind: "canvas", label: "Canvas horizontal centre", priority: 0 },
    { axis: "y", value: canvasHeight / 2, kind: "canvas", label: "Canvas vertical centre", priority: 0 },
    { axis: "x", value: 0, kind: "canvas", label: "Canvas left", priority: 2 },
    { axis: "x", value: canvasWidth, kind: "canvas", label: "Canvas right", priority: 2 },
    { axis: "y", value: 0, kind: "canvas", label: "Canvas top", priority: 2 },
    { axis: "y", value: canvasHeight, kind: "canvas", label: "Canvas bottom", priority: 2 },
  ];
  panels.forEach((bounds, index) => {
    targets.push(...targetsForBounds(bounds, "panel", `Panel ${index + 1}`, 1));
  });
  printGuides.forEach((bounds, index) => {
    targets.push(...targetsForBounds(bounds, "print-guide", `Print guide ${index + 1}`, 2));
  });
  elements.forEach((element, index) => {
    if (element.id === excludeElementId) return;
    targets.push(
      ...targetsForBounds(transformedElementBounds(element), "object", `Object ${index + 1}`, 3),
    );
  });
  return targets;
}

type ResolveSnapInput = Readonly<{
  element: DesignElement;
  proposedX: number;
  proposedY: number;
  targets: readonly SnapTarget[];
  stageScale: number;
  thresholdCssPixels?: number;
  disabled?: boolean;
}>;

type Candidate = Readonly<{
  target: SnapTarget;
  delta: number;
}>;

function bestCandidate(
  axis: "x" | "y",
  anchors: readonly number[],
  targets: readonly SnapTarget[],
  threshold: number,
): Candidate | null {
  const candidates: Candidate[] = [];
  for (const target of targets) {
    if (target.axis !== axis) continue;
    for (const anchor of anchors) {
      const delta = target.value - anchor;
      if (Math.abs(delta) <= threshold) candidates.push({ target, delta });
    }
  }
  candidates.sort(
    (a, b) => Math.abs(a.delta) - Math.abs(b.delta) || a.target.priority - b.target.priority,
  );
  return candidates[0] ?? null;
}

export function resolveElementSnap({
  element,
  proposedX,
  proposedY,
  targets,
  stageScale,
  thresholdCssPixels = 6,
  disabled = false,
}: ResolveSnapInput): SnapResult {
  if (disabled) return { x: proposedX, y: proposedY, guides: [] };
  const proposed = { ...element, x: proposedX, y: proposedY } as DesignElement;
  const bounds = transformedElementBounds(proposed);
  const xAnchors = [bounds.x, bounds.x + bounds.width / 2, bounds.x + bounds.width];
  const yAnchors = [bounds.y, bounds.y + bounds.height / 2, bounds.y + bounds.height];
  const threshold = thresholdCssPixels / Math.max(stageScale, 0.05);
  const xCandidate = bestCandidate("x", xAnchors, targets, threshold);
  const yCandidate = bestCandidate("y", yAnchors, targets, threshold);
  const guides: SnapGuide[] = [];
  if (xCandidate) {
    guides.push({
      axis: "x",
      value: xCandidate.target.value,
      kind: xCandidate.target.kind,
      label: xCandidate.target.label,
    });
  }
  if (yCandidate) {
    guides.push({
      axis: "y",
      value: yCandidate.target.value,
      kind: yCandidate.target.kind,
      label: yCandidate.target.label,
    });
  }
  return {
    x: proposedX + (xCandidate?.delta ?? 0),
    y: proposedY + (yCandidate?.delta ?? 0),
    guides,
  };
}
