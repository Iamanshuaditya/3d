export type ProductionFont = {
  id: string;
  family: string;
  weight: number;
  style: "normal" | "italic";
  format: "ttf" | "otf";
  filename: string;
  mimeType: "font/ttf" | "font/otf";
  byteSize: number;
  sha256: string;
  storageKey: string;
  licenseName: string;
  licenseReference: string;
  approvedBy: string;
  createdAt: string;
};

export type ProductionFontDto = Omit<ProductionFont, "storageKey">;

export interface ProductionFontRepository {
  create(font: ProductionFont): Promise<ProductionFont>;
  findById(id: string): Promise<ProductionFont | null>;
  list(): Promise<ProductionFont[]>;
  find(family: string, weight: number, style: ProductionFont["style"]): Promise<ProductionFont | null>;
}

export interface ProductionFontReader {
  find(family: string, weight: number, style: ProductionFont["style"]): Promise<ProductionFont | null>;
}
