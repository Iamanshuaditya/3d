import type { ProductOperatorPermission } from "@/platform/products/drafts";

export interface OperatorGrantRepository {
  listPermissions(userId: string): Promise<ProductOperatorPermission[]>;
}
