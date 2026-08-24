interface Env {
  AI: { run: (model: string, input: Record<string, unknown>) => Promise<unknown> };
  PROXY_SECRET?: string;
  UNOROUTER_API_KEY?: string;
}

const DEFAULT_MODEL = "moonshotai/kimi-k3";
const UNOROUTER_BASE = "https://api.unorouter.com/v1";
const UNOROUTER_FREE_MODEL = "kimi-k3:free";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

function isAuthorized(request: Request, env: Env): boolean {
  if (!env.PROXY_SECRET) return true;
  const auth = request.headers.get("Authorization") ?? "";
  return auth === `Bearer ${env.PROXY_SECRET}`;
}

function isCloudflareModel(model: string): boolean {
  return model.startsWith("@");
}

function toUnoRouterModel(model: string): string {
  if (model === DEFAULT_MODEL) return UNOROUTER_FREE_MODEL;
  if (model.startsWith("moonshotai/")) return model.slice("moonshotai/".length);
  return model;
}

async function viaUnoRouter(
  model: string,
  input: Record<string, unknown>,
  apiKey: string,
): Promise<Response> {
  const upstream = await fetch(`${UNOROUTER_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
      Accept: "application/json",
    },
    body: JSON.stringify({ ...input, model: toUnoRouterModel(model) }),
  });
  const headers = new Headers(upstream.headers);
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("X-Provider", "unorouter");
  return new Response(upstream.body, { status: upstream.status, headers });
}

const worker = {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);

    if (request.method === "GET") {
      return json({
        worker: "kimi-k3-proxy",
        default_model: DEFAULT_MODEL,
        endpoints: { chat_completions: "POST /v1/chat/completions" },
        providers: {
          unorouter_free: env.UNOROUTER_API_KEY ? "ready" : "set UNOROUTER_API_KEY secret to enable",
          cloudflare_workers_ai: "fallback for @cf/* models (needs paid billing for kimi-k3)",
        },
        status: env.PROXY_SECRET ? "auth_required" : "open",
      });
    }

    if (request.method !== "POST" || url.pathname !== "/v1/chat/completions") {
      return json({ error: "Not found. Use POST /v1/chat/completions" }, 404);
    }

    if (!isAuthorized(request, env)) {
      return json({ error: "Unauthorized" }, 401);
    }

    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return json({ error: "Invalid JSON body" }, 400);
    }

    if (!Array.isArray(body.messages) || body.messages.length === 0) {
      return json({ error: "'messages' array is required" }, 400);
    }

    const model = typeof body.model === "string" && body.model ? body.model : DEFAULT_MODEL;
    const input: Record<string, unknown> = { ...body };
    delete input.model;

    if (!isCloudflareModel(model)) {
      if (!env.UNOROUTER_API_KEY) {
        return json(
          {
            error:
              "No provider for non-@cf models. Set the UNOROUTER_API_KEY secret (free key at unorouter.com) or add Cloudflare AI Gateway credits.",
            model,
          },
          503,
        );
      }
      try {
        return await viaUnoRouter(model, input, env.UNOROUTER_API_KEY);
      } catch (err) {
        return json({ error: err instanceof Error ? err.message : String(err), provider: "unorouter" }, 502);
      }
    }

    try {
      const result = await env.AI.run(model, input);
      if (input.stream && result instanceof ReadableStream) {
        return new Response(result, {
          headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-store", ...CORS_HEADERS },
        });
      }
      return json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const status = /balance|credits|not allowed|Free plan|402/.test(message) ? 402 : 500;
      return json({ error: message, model }, status);
    }
  },
};

export default worker;
