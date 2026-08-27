import type { DesignElement } from "@/types/configurator";

export type EditorBounds = Readonly<{
  x: number;
  y: number;
  width: number;
  height: number;
}>;

export function elementLocalSize(element: DesignElement): { width: number; height: number } {
  if (element.type === "image") {
    return { width: element.width, height: element.height };
  }
  const lines = element.text.split("\n");
  return {
    width: Math.max(1, ...lines.map((line) => line.length)) * element.fontSize * 0.54,
    height: Math.max(1, lines.length) * element.fontSize * 1.2,
  };
}

/** Axis-aligned bounds of the exact Konva top-left-origin transform. */
export function transformedElementBounds(element: DesignElement): EditorBounds {
  const size = elementLocalSize(element);
  const radians = (element.rotation * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const corners = [
    [0, 0],
    [size.width, 0],
    [size.width, size.height],
    [0, size.height],
  ] as const;
  const points = corners.map(([localX, localY]) => {
    const scaledX = localX * element.scaleX;
    const scaledY = localY * element.scaleY;
    return {
      x: element.x + scaledX * cos - scaledY * sin,
      y: element.y + scaledX * sin + scaledY * cos,
    };
  });
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const left = Math.min(...xs);
  const top = Math.min(...ys);
  const right = Math.max(...xs);
  const bottom = Math.max(...ys);
  return { x: left, y: top, width: right - left, height: bottom - top };
}

export type ContextToolbarPosition = Readonly<{
  left: number;
  top: number;
  placement: "above" | "below";
}>;

export function contextToolbarPosition(
  bounds: EditorBounds,
  scale: number,
  viewportWidth: number,
): ContextToolbarPosition {
  const displayedLeft = (bounds.x + bounds.width / 2) * scale;
  const left = Math.min(Math.max(displayedLeft, 150), Math.max(150, viewportWidth - 150));
  const displayedTop = bounds.y * scale;
  if (displayedTop < 56) {
    return {
      left,
      top: (bounds.y + bounds.height) * scale + 10,
      placement: "below",
    };
  }
  return { left, top: displayedTop - 10, placement: "above" };
}
