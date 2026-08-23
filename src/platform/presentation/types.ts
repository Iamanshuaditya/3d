import type { ProductPresentationMode } from "@/platform/products/types";

export type EditorTargetKind = "page" | "print-area" | "continuous-web";

export type EditorTarget = {
  /** Navigation identity. Design state remains keyed by `surfaceId`. */
  id: string;
  surfaceId: string;
  label: string;
  kind: EditorTargetKind;
  order: number;
  pageNumber?: number;
  side?: "front" | "back" | "inside" | "outside";
};

export type ResolvedStudioPresentation = {
  mode: ProductPresentationMode;
  previewKind: "2d-proof" | "3d-product";
  navigationLabel: "Pages" | "Print areas" | "Printable surfaces";
  targets: EditorTarget[];
};
