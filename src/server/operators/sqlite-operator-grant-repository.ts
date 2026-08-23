import type { OperatorGrantRepository } from "@/platform/operators/repository";
import type { ProductOperatorPermission } from "@/platform/products/drafts";
import type { VortexDatabase } from "@/server/persistence/database";

export class SqliteOperatorGrantRepository implements OperatorGrantRepository {
  constructor(private readonly database: VortexDatabase) {}

  async listPermissions(userId: string): Promise<ProductOperatorPermission[]> {
    return (this.database.prepare(`
      SELECT permission FROM operator_grants
      WHERE user_id = ? ORDER BY permission
    `).all(userId) as Array<{ permission: ProductOperatorPermission }>)
      .map((row) => row.permission);
  }
}
