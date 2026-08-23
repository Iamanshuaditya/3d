import type {
  CreateTemplateAssetInput,
  TemplateAsset,
  TemplateAssetRepository,
} from "@/platform/templates/assets";
import type { VortexDatabase } from "@/server/persistence/database";

type AssetRow = {
  id: string;
  filename: string;
  mime_type: TemplateAsset["mimeType"];
  byte_size: number;
  width: number;
  height: number;
  sha256: string;
  storage_key: string;
  created_by: string;
  created_at: string;
};

function decode(row: AssetRow): TemplateAsset {
  return {
    id: row.id,
    filename: row.filename,
    mimeType: row.mime_type,
    byteSize: row.byte_size,
    width: row.width,
    height: row.height,
    sha256: row.sha256,
    storageKey: row.storage_key,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

export class SqliteTemplateAssetRepository implements TemplateAssetRepository {
  constructor(private readonly database: VortexDatabase) {}

  async create(input: CreateTemplateAssetInput): Promise<TemplateAsset> {
    this.database.prepare(`
      INSERT INTO template_assets (
        id, filename, mime_type, byte_size, width, height, sha256,
        storage_key, created_by, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      input.id,
      input.filename,
      input.mimeType,
      input.byteSize,
      input.width,
      input.height,
      input.sha256,
      input.storageKey,
      input.createdBy,
      input.createdAt,
    );
    return structuredClone(input);
  }

  async findById(id: string): Promise<TemplateAsset | null> {
    const row = this.database.prepare(
      "SELECT * FROM template_assets WHERE id = ?",
    ).get(id) as AssetRow | undefined;
    return row ? decode(row) : null;
  }

  async list(): Promise<TemplateAsset[]> {
    return (this.database.prepare(
      "SELECT * FROM template_assets ORDER BY created_at DESC, id DESC",
    ).all() as AssetRow[]).map(decode);
  }
}
