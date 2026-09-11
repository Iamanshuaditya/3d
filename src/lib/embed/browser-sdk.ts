import type { EditorSessionResult } from "./editor-session-types";

export type VortexEditor = {
  iframe: HTMLIFrameElement;
  complete: () => void;
  remeasure: () => void;
  close: () => void;
  destroy: () => void;
};

export type VortexOpenOptions = {
  editorUrl: string;
  title?: string;
  closeOnComplete?: boolean;
  onReady?: () => void;
  onComplete?: (result: EditorSessionResult) => void;
  onError?: (error: { code: string; message: string }) => void;
  onClose?: () => void;
};

declare global {
  interface Window {
    Vortex?: { open: (options: VortexOpenOptions) => VortexEditor; protocolVersion: number };
  }
}
