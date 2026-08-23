import { PlatformError } from "@/platform/projects/errors";
import type {
  ProductOperator,
  ProductOperatorPermission,
} from "@/platform/products/drafts";
import type { OperatorGrantRepository } from "@/platform/operators/repository";

type SessionResolver = (headers: Headers) => Promise<{ user: { id: string } } | null>;

export const ALL_OPERATOR_PERMISSIONS: ProductOperatorPermission[] = [
  "products:read",
  "products:edit",
  "products:validate",
  "products:publish",
  "templates:read",
  "templates:edit",
  "templates:publish",
  "assets:upload",
  "onboarding:run",
];

export function operatorHasPermission(
  permissions: readonly ProductOperatorPermission[],
  required: ProductOperatorPermission,
) {
  const available = new Set(permissions);
  if (available.has(required)) return true;
  if (required === "products:read") {
    return ["products:edit", "products:validate", "products:publish"]
      .some((permission) => available.has(permission as ProductOperatorPermission));
  }
  if (required === "products:edit" || required === "products:validate") {
    return available.has("products:publish");
  }
  if (required === "templates:read") {
    return available.has("templates:edit") || available.has("templates:publish");
  }
  if (required === "templates:edit") return available.has("templates:publish");
  return false;
}

function configuredBootstrapIds() {
  return new Set(
    (process.env.VORTEX_BOOTSTRAP_OPERATOR_USER_IDS ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );
}

export class OperatorAuthorizationService {
  constructor(
    private readonly grants: OperatorGrantRepository,
    private readonly resolveSession: SessionResolver = async (headers) => {
      const { getAuth } = await import("@/server/auth/better-auth");
      return getAuth().api.getSession({ headers });
    },
    private readonly bootstrapUserIds: ReadonlySet<string> = configuredBootstrapIds(),
  ) {}

  async require(
    headers: Headers,
    permission: ProductOperatorPermission,
  ): Promise<ProductOperator> {
    const session = await this.resolveSession(headers);
    if (!session?.user.id) {
      throw new PlatformError(
        "OPERATOR_AUTHENTICATION_REQUIRED",
        "An authenticated operator session is required.",
        401,
      );
    }
    const permissions = this.bootstrapUserIds.has(session.user.id)
      ? ALL_OPERATOR_PERMISSIONS
      : await this.grants.listPermissions(session.user.id);
    if (!operatorHasPermission(permissions, permission)) {
      throw new PlatformError(
        "OPERATOR_FORBIDDEN",
        "The authenticated account is not authorized for this operator action.",
        403,
      );
    }
    return { id: session.user.id, permissions: [...permissions] };
  }
}
