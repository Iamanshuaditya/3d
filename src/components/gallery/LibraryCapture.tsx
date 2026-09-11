"use client";

import dynamic from "next/dynamic";
import { useRef } from "react";
import type { ProductConfig } from "@/types/configurator";

const Product3DPreview = dynamic(() => import("./Product3DPreview").then((module) => module.Product3DPreview), { ssr: false });

/** Authoring utility: render the actual editor geometry to a local poster. */
export function LibraryCapture({ config }: { config: ProductConfig }) {
  const stage = useRef<HTMLDivElement>(null);
  return (
    <>
      <button type="button" className="mb-4 rounded-lg bg-black px-4 py-3 text-sm text-white" onClick={() => {
        const canvas = stage.current?.querySelector("canvas");
        if (!canvas) return;
        const link = document.createElement("a");
        link.download = `vortex-library-${config.id}.png`;
        link.href = canvas.toDataURL("image/png");
        link.click();
      }}>Download product render</button>
      <div ref={stage} className="h-[720px] w-[960px] bg-[#e1e2e5]" aria-label="Product render">
        <Product3DPreview config={config} captureMode />
      </div>
    </>
  );
}
