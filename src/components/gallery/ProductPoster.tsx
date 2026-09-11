"use client";

import Image from "next/image";
import { useState } from "react";
import { Box } from "lucide-react";

/** Local renders keep the storefront independent of model/CDN/WebGL failures. */
export function ProductPoster({ src, name }: { src: string; name: string }) {
  const [failed, setFailed] = useState(false);
  return failed ? (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center text-[var(--st-dim)]">
      <Box aria-hidden="true" className="h-10 w-10" strokeWidth={1} />
      <span className="text-sm">Open the editor to view {name.toLowerCase()}.</span>
    </div>
  ) : (
    <Image src={src} alt={`White ${name.toLowerCase()} on a gray background`}
      width={1440} height={1080} unoptimized loading="eager"
      className="h-full w-full object-contain" onError={() => setFailed(true)} />
  );
}
