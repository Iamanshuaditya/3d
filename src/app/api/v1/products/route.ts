import { json, withPublicApi } from "@/server/http/api";
import { getProductApiService } from "@/server/products/container";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return withPublicApi(async () =>
    json({ products: await getProductApiService().list() }),
  );
}
