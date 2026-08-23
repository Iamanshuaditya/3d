import type {
  ProductionFont,
  ProductionFontRepository,
} from "@/platform/production/fonts";
import type { VortexDatabase } from "@/server/persistence/database";

type Row = {
  id: string;
  family: string;
  weight: number;
  style: ProductionFont["style"];
  format: ProductionFont["format"];
  filename: string;
  mime_type: ProductionFont["mimeType"];
  byte_size: number;
  sha256: string;
  storage_key: string;
  license_name: string;
  license_reference: string;
  approved_by: string;
  created_at: string;
};

function decode(row: Row): ProductionFont {
  return {
    id: row.id,
    family: row.family,
    weight: row.weight,
    style: row.style,
    format: row.format,
    filename: row.filename,
    mimeType: row.mime_type,
    byteSize: row.byte_size,
    sha256: row.sha256,
    storageKey: row.storage_key,
    licenseName: row.license_name,
    licenseReference: row.license_reference,
    approvedBy: row.approved_by,
    createdAt: row.created_at,
  };
}

export class SqliteProductionFontRepository implements ProductionFontRepository {
  constructor(private readonly database: VortexDatabase) {}

  async create(font: ProductionFont) {
    this.database.prepare(`
      INSERT INTO production_fonts (
        id, family, weight, style, format, filename, mime_type, byte_size, sha256,
        storage_key, license_name, license_reference, approved_by, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      font.id, font.family, font.weight, font.style, font.format, font.filename,
      font.mimeType, font.byteSize, font.sha256, font.storageKey, font.licenseName,
      font.licenseReference, font.approvedBy, font.createdAt,
    );
    return font;
  }

  async findById(id: string) {
    const row = this.database.prepare("SELECT * FROM production_fonts WHERE id = ?")
      .get(id) as Row | undefined;
    return row ? decode(row) : null;
  }

  async list() {
    return (this.database.prepare(`
      SELECT * FROM production_fonts ORDER BY family, weight, style, created_at DESC, id DESC
    `).all() as Row[]).map(decode);
  }

  async find(family: string, weight: number, style: ProductionFont["style"]) {
    const row = this.database.prepare(`
      SELECT * FROM production_fonts
      WHERE family = ? COLLATE NOCASE AND weight = ? AND style = ?
      ORDER BY created_at DESC, id DESC LIMIT 1
    `).get(family, weight, style) as Row | undefined;
    return row ? decode(row) : null;
  }
}
