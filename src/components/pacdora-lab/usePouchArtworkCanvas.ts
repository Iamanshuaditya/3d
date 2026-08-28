"use client";

import { useEffect, useMemo, useState } from "react";
import type { PouchArtwork, PouchLabSolution } from "@/lib/pacdora-lab";

export type PouchArtworkCanvas = {
  canvas: HTMLCanvasElement | null;
  previewUrl: string | null;
  status: "idle" | "loading" | "ready" | "error";
  error: string | null;
};

const EMPTY_ARTWORK_CANVAS: PouchArtworkCanvas = {
  canvas: null,
  previewUrl: null,
  status: "idle",
  error: null,
};

type ResolvedArtworkCanvas = PouchArtworkCanvas & {
  requestToken: symbol | null;
};

function drawImageIntoPanel(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  rect: { x: number; y: number; width: number; height: number },
  fit: PouchArtwork["fit"],
) {
  const scale = fit === "cover"
    ? Math.max(rect.width / image.naturalWidth, rect.height / image.naturalHeight)
    : Math.min(rect.width / image.naturalWidth, rect.height / image.naturalHeight);
  const width = image.naturalWidth * scale;
  const height = image.naturalHeight * scale;
  const x = rect.x + (rect.width - width) * 0.5;
  const y = rect.y + (rect.height - height) * 0.5;

  context.save();
  context.beginPath();
  context.rect(rect.x, rect.y, rect.width, rect.height);
  context.clip();
  context.drawImage(image, x, y, width, height);
  context.restore();
}

export function usePouchArtworkCanvas(
  solution: PouchLabSolution,
  artwork: PouchArtwork | null,
): PouchArtworkCanvas {
  const [result, setResult] = useState<ResolvedArtworkCanvas>({
    ...EMPTY_ARTWORK_CANVAS,
    requestToken: null,
  });
  const frontPanel = solution.panels.find((panel) => panel.id === "front-film");
  const backPanel = solution.panels.find((panel) => panel.id === "back-film");
  const webWidth = solution.web.width;
  const webHeight = solution.web.height;
  const materialColor = solution.material.color;
  const frontX = frontPanel?.x;
  const frontY = frontPanel?.y;
  const frontWidth = frontPanel?.width;
  const frontHeight = frontPanel?.height;
  const backX = backPanel?.x;
  const backY = backPanel?.y;
  const backWidth = backPanel?.width;
  const backHeight = backPanel?.height;
  const frontRect = useMemo(
    () => frontX !== undefined
      && frontY !== undefined
      && frontWidth !== undefined
      && frontHeight !== undefined
      ? [frontX, frontY, frontWidth, frontHeight] as const
      : null,
    [frontHeight, frontWidth, frontX, frontY],
  );
  const backRect = useMemo(
    () => backX !== undefined
      && backY !== undefined
      && backWidth !== undefined
      && backHeight !== undefined
      ? [backX, backY, backWidth, backHeight] as const
      : null,
    [backHeight, backWidth, backX, backY],
  );
  const requestToken = useMemo(
    () => artwork
      ? Symbol(`pouch-artwork:${materialColor}:${webWidth}:${webHeight}:${frontRect?.join(",")}:${backRect?.join(",")}`)
      : null,
    [artwork, backRect, frontRect, materialColor, webHeight, webWidth],
  );

  useEffect(() => {
    if (!artwork || !requestToken) return;

    let cancelled = false;
    const image = new window.Image();
    image.decoding = "async";
    image.onload = () => {
      if (cancelled || image.naturalWidth <= 0 || image.naturalHeight <= 0) return;
      if (!frontRect || !backRect) {
        setResult({
          requestToken,
          canvas: null,
          previewUrl: null,
          status: "error",
          error: "The pouch construction is missing a printable face.",
        });
        return;
      }
      const pixelsPerMm = Math.max(
        0.5,
        Math.min(4, 1600 / Math.max(webWidth, webHeight)),
      );
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(webWidth * pixelsPerMm));
      canvas.height = Math.max(1, Math.round(webHeight * pixelsPerMm));
      const context = canvas.getContext("2d", { alpha: false });
      if (!context) {
        setResult({
          requestToken,
          canvas: null,
          previewUrl: null,
          status: "error",
          error: "The artwork canvas could not be created.",
        });
        return;
      }

      context.fillStyle = materialColor;
      context.fillRect(0, 0, canvas.width, canvas.height);
      const targets = [
        ...(artwork.placement !== "back" ? [frontRect] : []),
        ...(artwork.placement !== "front" ? [backRect] : []),
      ];
      for (const [xMm, yMm, widthMm, heightMm] of targets) {
        drawImageIntoPanel(
          context,
          image,
          {
            x: xMm * pixelsPerMm,
            y: yMm * pixelsPerMm,
            width: widthMm * pixelsPerMm,
            height: heightMm * pixelsPerMm,
          },
          artwork.fit,
        );
      }

      if (!cancelled) {
        setResult({
          requestToken,
          canvas,
          previewUrl: canvas.toDataURL("image/png"),
          status: "ready",
          error: null,
        });
      }
    };
    image.onerror = () => {
      if (!cancelled) {
        setResult({
          requestToken,
          canvas: null,
          previewUrl: null,
          status: "error",
          error: "This image could not be decoded. Try PNG, JPEG, WebP, or SVG.",
        });
      }
    };
    image.src = artwork.sourceUrl;

    return () => {
      cancelled = true;
      image.onload = null;
      image.onerror = null;
    };
  }, [
    artwork,
    backRect,
    frontRect,
    materialColor,
    requestToken,
    webHeight,
    webWidth,
  ]);

  if (!artwork || !requestToken) return EMPTY_ARTWORK_CANVAS;
  if (result.requestToken !== requestToken) {
    return {
      canvas: null,
      previewUrl: null,
      status: "loading",
      error: null,
    };
  }
  return result;
}
