import { getVortexDatabase } from "@/server/persistence/database";
import { getProjectService } from "@/server/projects/container";
import { getProductCatalogService } from "@/server/products/container";
import { getProductionService } from "@/server/production/container";
import { getEmbedClientRegistry } from "./embed-client-registry";
import { EditorSessionRepository } from "./editor-session-repository";
import { EditorSessionService } from "./editor-session-service";

export function getEditorSessionService() {
  return new EditorSessionService(new EditorSessionRepository(getVortexDatabase()), getEmbedClientRegistry(),
    getProjectService(), getProductCatalogService(), getProductionService());
}
