import type { ImageCrop } from "@/types/configurator";

export const FULL_IMAGE_CROP: Readonly<ImageCrop> = Object.freeze({
  x: 0,
  y: 0,
  width: 1,
  height: 1,
});

const MIN_CROP_SIZE = 0.01;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function normalizeImageCrop(crop: ImageCrop): ImageCrop {
  const width = clamp(crop.width, MIN_CROP_SIZE, 1);
  const height = clamp(crop.height, MIN_CROP_SIZE, 1);
  return {
    x: clamp(crop.x, 0, 1 - width),
    y: clamp(crop.y, 0, 1 - height),
    width,
    height,
  };
}

/** Centred source window that fills a frame without aspect distortion. */
export function cropToFillFrame(
  sourceWidth: number,
  sourceHeight: number,
  frameWidth: number,
  frameHeight: number,
): ImageCrop {
  if (
    ![sourceWidth, sourceHeight, frameWidth, frameHeight].every(
      (value) => Number.isFinite(value) && value > 0,
    )
  ) {
    throw new RangeError("Crop dimensions must be finite and positive.");
  }
  const sourceAspect = sourceWidth / sourceHeight;
  const frameAspect = frameWidth / frameHeight;
  if (sourceAspect > frameAspect) {
    const width = frameAspect / sourceAspect;
    return { x: (1 - width) / 2, y: 0, width, height: 1 };
  }
  const height = sourceAspect / frameAspect;
  return { x: 0, y: (1 - height) / 2, width: 1, height };
}

export function cropZoom(base: ImageCrop, crop: ImageCrop): number {
  return Math.max(base.width / crop.width, base.height / crop.height);
}

export function setCropZoom(
  base: ImageCrop,
  current: ImageCrop,
  zoom: number,
): ImageCrop {
  const boundedZoom = clamp(zoom, 1, 8);
  const centerX = current.x + current.width / 2;
  const centerY = current.y + current.height / 2;
  const width = base.width / boundedZoom;
  const height = base.height / boundedZoom;
  return normalizeImageCrop({
    x: centerX - width / 2,
    y: centerY - height / 2,
    width,
    height,
  });
}

export function setCropCenter(
  crop: ImageCrop,
  centerX: number,
  centerY: number,
): ImageCrop {
  return normalizeImageCrop({
    ...crop,
    x: clamp(centerX, 0, 1) - crop.width / 2,
    y: clamp(centerY, 0, 1) - crop.height / 2,
  });
}
