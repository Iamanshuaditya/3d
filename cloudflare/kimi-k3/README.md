# Kimi K3 on Cloudflare (kimi-k3-proxy)

OpenAI-compatible proxy for Moonshot AI **Kimi K3** (`moonshotai/kimi-k3`, 1M context) running on this account's Cloudflare Workers AI binding.

- **Worker URL:** https://kimi-k3-proxy.anshuaditya825301.workers.dev
- **Account ID:** `68c4a394a76e35ee099494e359335746`
- **Deploy:** `npx wrangler deploy` (from this directory; uses `CLOUDFLARE_API_TOKEN` from env)

## Status

| Piece | State |
|---|---|
| Worker + AI binding | Deployed and verified (free model round-trip + streaming OK) |
| **UnoRouter free route** | **Primary for K3 — set `UNOROUTER_API_KEY` secret to enable (free key, no card)** |
| `moonshotai/kimi-k3` via Cloudflare | Reachable — returns `402 Insufficient AI Gateway credits` until billing |

## Free K3 via UnoRouter (active path)

Non-`@cf` models route through [UnoRouter](https://unorouter.com) when the `UNOROUTER_API_KEY` secret is set. Default model maps to `kimi-k3:free` ($0, no card needed).

1. Sign up at https://unorouter.com/en/login (email only)
2. Create a token at the Tokens page
3. `npx wrangler secret put UNOROUTER_API_KEY` (from this directory) — or paste the key to your agent

## The Cloudflare billing step (optional fallback upgrade)

The account is on the Workers **Free** plan; K3 is a third-party frontier model. Unlock with either:

1. **AI Gateway credits (pay-per-use, recommended):** Dashboard → AI Gateway → Unified Billing → add credits. K3 then works immediately through this worker — no plan change.
2. **Workers Paid plan ($5/mo):** https://dash.cloudflare.com/?to=/:account/workers/plans — unlocks `@cf/moonshotai/*` hosted models too.

Optional BYOK alternative: store a Moonshot API key on an AI Gateway and route with `cf-aig-gateway-id` headers (the current API token lacks AI Gateway perms, so this is dashboard-only).

## Video prompts (free)

Native `video_url` is rejected by the free upstream (503) and Worker→UnoRouter media calls get WAF-blocked (error 1010, TLS fingerprinting). Use the local frame-sampling script instead — it extracts frames with ffmpeg and calls the free route directly (vision works):

```bash
export UNOROUTER_API_KEY=sk-...   # your UnoRouter key
python3 cloudflare/kimi-k3/kimi-video.py path/to/video.mp4 "What happens in this video?" --frames 6
```

- `--frames N` controls sampling (default 6, evenly spaced)
- Requires `ffmpeg`/`ffprobe` on PATH
- Free-tier limit: **1 request/min** on `kimi-k3:free` (nothing consumed when limited)

## Usage

```bash
# Non-streaming
curl -X POST https://kimi-k3-proxy.anshuaditya825301.workers.dev/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"Hello"}]}'
```

```ts
// OpenAI SDK
const client = new OpenAI({
  baseURL: "https://kimi-k3-proxy.anshuaditya825301.workers.dev/v1",
  apiKey: "unused",
});
await client.chat.completions.create({
  model: "moonshotai/kimi-k3",
  messages: [{ role: "user", content: "Hello" }],
  // K3 thinking effort: "low" | "high" | "max" (default "max")
});
```

- `model` is optional (defaults to `moonshotai/kimi-k3`); any Workers AI model slug works (e.g. `@cf/meta/llama-3.2-3b-instruct` for free testing).
- `stream: true` passes SSE through.
- Set a `PROXY_SECRET` secret (`npx wrangler secret put PROXY_SECRET`) to require `Authorization: Bearer <secret>`.
