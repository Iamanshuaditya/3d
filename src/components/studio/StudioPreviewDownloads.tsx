"use client";

import { Download } from "lucide-react";
import type { CanvasTexture } from "three";
import type { ProductConfig } from "@/types/configurator";
import { blenderPouchConfig, blenderPouchGuideSvg } from "@/lib/configurator/blender-pouch";

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function StudioPreviewDownloads({ config, texture }: {
  config: ProductConfig;
  texture: CanvasTexture | null | undefined;
}) {
  const canvas = texture?.image as HTMLCanvasElement | undefined;
  const item = "block w-full rounded-md px-3 py-2 text-left text-xs hover:bg-[var(--st-raised)] disabled:opacity-40";
  return (
    <details className="relative shrink-0">
      <summary className="flex cursor-pointer list-none items-center gap-2 rounded-lg bg-[var(--st-accent)] px-3 py-2 text-sm font-semibold text-[var(--st-accent-ink)]">
        <Download className="h-4 w-4" /> Download
      </summary>
      <div className="absolute right-0 top-full z-50 mt-2 w-48 rounded-xl bg-[var(--st-surface)] p-2 shadow-xl ring-1 ring-[var(--st-line)]">
        <button type="button" className={item} disabled={!canvas} onClick={() => canvas?.toBlob((blob) => {
          if (blob) downloadBlob(blob, `${config.id}-artwork.png`);
        }, "image/png")}>Artwork PNG</button>
        {config.modelUrl && <a className={item} href={config.modelUrl} download>Download GLB</a>}
        {config.id === blenderPouchConfig.id && (
          <button type="button" className={item} onClick={() => downloadBlob(
            new Blob([blenderPouchGuideSvg()], { type: "image/svg+xml" }), "pouch-uv-guides.svg",
          )}>2D guides SVG</button>
        )}
      </div>
    </details>
  );
}
