export type TemplateAsset = {
  id: string;
  filename: string;
  mimeType: "image/png" | "image/jpeg" | "image/webp";
  byteSize: number;
  width: number;
  height: number;
  sha256: string;
  /** Server-only object-store key. */
  storageKey: string;
  createdBy: string;
  createdAt: string;
};

export type CreateTemplateAssetInput = TemplateAsset;

export interface TemplateAssetRepository {
  create(input: CreateTemplateAssetInput): Promise<TemplateAsset>;
  findById(id: string): Promise<TemplateAsset | null>;
  list(): Promise<TemplateAsset[]>;
}

export interface TemplateAssetReader {
  findById(id: string): Promise<TemplateAsset | null>;
}
