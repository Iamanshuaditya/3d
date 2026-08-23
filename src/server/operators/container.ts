import { getVortexDatabase } from "@/server/persistence/database";
import { OperatorAuthorizationService } from "./operator-authorization-service";
import { SqliteOperatorGrantRepository } from "./sqlite-operator-grant-repository";

let singleton: OperatorAuthorizationService | null = null;

export function getOperatorAuthorizationService() {
  singleton ??= new OperatorAuthorizationService(
    new SqliteOperatorGrantRepository(getVortexDatabase()),
  );
  return singleton;
}
