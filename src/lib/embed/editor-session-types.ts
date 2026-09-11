export type EditorSessionMode = "pdf" | "preview";

export type EditorSessionLaunch = {
  sessionId: string;
  productId: string;
  editorUrl: string;
  returnUrl: string;
  expiresAt: string;
  mode: EditorSessionMode;
  capabilities: { pdf: boolean; svg: boolean };
};

export type EditorSessionResult = {
  sessionId: string;
  projectId: string;
  productId: string;
  revision: number;
  status: "ready" | "saved";
  mode: EditorSessionMode;
  artifact: null | {
    id: string;
    filename: string;
    mimeType: "application/pdf";
    byteSize: number;
    sha256: string;
    /** Merchant backend fetches this URL using its API key. */
    downloadUrl: string;
  };
  warnings: Array<{ code: string; message: string }>;
};
