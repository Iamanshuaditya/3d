#!/usr/bin/env node
/**
 * Deployment smoke test (#26).
 *
 * Proves a running deployment can do the thing customers came for: open a
 * project, upload artwork, save it, and render the 3D preview. A build that
 * compiles and a deployment that works are different claims, and only this
 * second one is worth gating a release on.
 *
 *   node scripts/smoke-deployment.mjs http://localhost:3000
 */
import { chromium } from "playwright";
import sharp from "sharp";

const baseUrl = (process.argv[2] || process.env.VORTEX_SMOKE_URL || "http://localhost:3000")
  .replace(/\/$/, "");
const productId = process.env.VORTEX_SMOKE_PRODUCT_ID || "kraft-visiting-card-88.9x50.8";

const steps = [];
let failed = false;

async function step(name, run) {
  const started = Date.now();
  try {
    const detail = await run();
    steps.push({ name, ok: true, ms: Date.now() - started, detail: detail ?? "" });
  } catch (error) {
    failed = true;
    steps.push({
      name,
      ok: false,
      ms: Date.now() - started,
      detail: error instanceof Error ? error.message : String(error),
    });
  }
}

/** A 1x1 PNG. Small enough to be fast, real enough to exercise decode+store. */
const PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

async function main() {
  const jar = [];
  const captureCookies = (response) => {
    const header = response.headers.get("set-cookie");
    if (header) jar.push(header.split(";")[0]);
  };
  const request = async (path, init = {}) => {
    const response = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: { ...(init.headers ?? {}), ...(jar.length ? { cookie: jar.join("; ") } : {}) },
    });
    captureCookies(response);
    return response;
  };

  await step("liveness", async () => {
    const response = await request("/api/health");
    if (!response.ok) throw new Error(`/api/health returned ${response.status}`);
    return "ok";
  });

  await step("readiness", async () => {
    const response = await request("/api/ready");
    const body = await response.json();
    if (!response.ok) {
      const failing = (body.checks ?? [])
        .filter((check) => !check.ok)
        .map((check) => `${check.name}: ${check.detail}`);
      throw new Error(`/api/ready returned ${response.status}. ${failing.join("; ")}`);
    }
    return (body.checks ?? []).map((check) => check.name).join(", ");
  });

  await step("session", async () => {
    const response = await request("/api/v1/session");
    if (!response.ok) throw new Error(`/api/v1/session returned ${response.status}`);
    if (!jar.length) throw new Error("No owner cookie was issued.");
    return "owner cookie issued";
  });

  let projectId = null;

  await step("create project", async () => {
    const response = await request("/api/v1/projects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ productId, clientRequestId: crypto.randomUUID() }),
    });
    const body = await response.json();
    if (!response.ok) {
      throw new Error(`Create failed (${response.status}): ${body?.error?.message ?? ""}`);
    }
    projectId = body.project?.id;
    if (!projectId) throw new Error("Response carried no project id.");
    return projectId;
  });

  await step("upload artwork", async () => {
    if (!projectId) throw new Error("Skipped: no project.");
    const form = new FormData();
    form.append(
      "file",
      new Blob([Buffer.from(PNG_BASE64, "base64")], { type: "image/png" }),
      "smoke.png",
    );
    const response = await request(`/api/v1/projects/${projectId}/assets`, {
      method: "POST",
      body: form,
    });
    const body = await response.json();
    if (!response.ok) {
      throw new Error(`Upload failed (${response.status}): ${body?.error?.message ?? ""}`);
    }
    const assetId = body.asset?.id;
    if (!assetId) throw new Error("Response carried no asset id.");
    return assetId;
  });

  await step("reopen project", async () => {
    if (!projectId) throw new Error("Skipped: no project.");
    const response = await request(`/api/v1/projects/${projectId}`);
    const body = await response.json();
    if (!response.ok) throw new Error(`Reopen failed (${response.status})`);
    if (body.project?.id !== projectId) throw new Error("Reopened a different project.");
    return `revision ${body.project.revision}`;
  });

  await step("render 3D preview", async () => {
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
      const consoleErrors = [];
      page.on("pageerror", (error) => consoleErrors.push(error.message));

      const url = `${baseUrl}/studio?product=${encodeURIComponent(productId)}${
        projectId ? `&project=${encodeURIComponent(projectId)}` : ""
      }`;
      const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
      if (!response || !response.ok()) {
        throw new Error(`Studio returned ${response?.status() ?? "no response"}`);
      }

      const canvas = page.locator("canvas").last();
      await canvas.waitFor({ state: "visible", timeout: 60_000 });
      await page.waitForFunction(
        () => {
          const elements = Array.from(document.querySelectorAll("canvas"));
          return elements.some((element) => element.width > 0 && element.height > 0);
        },
        { timeout: 60_000 },
      );

      // The element existing proves nothing — a failed WebGL context leaves a
      // correctly sized blank canvas. Screenshotting the composited result and
      // checking it is not one flat colour is what actually proves it drew.
      let distinct = 0;
      const deadline = Date.now() + 45_000;
      while (Date.now() < deadline) {
        const shot = await canvas.screenshot({ type: "png" });
        const { data, info } = await sharp(shot)
          .resize(64, 64, { fit: "fill" })
          .raw()
          .toBuffer({ resolveWithObject: true });
        const colours = new Set();
        for (let i = 0; i + info.channels <= data.length; i += info.channels) {
          colours.add((data[i] << 16) | (data[i + 1] << 8) | data[i + 2]);
        }
        distinct = colours.size;
        if (distinct > 8) break;
        await page.waitForTimeout(1_000);
      }
      if (distinct <= 8) {
        throw new Error(
          `The preview canvas rendered ${distinct} distinct colours, which means it did not draw.`,
        );
      }

      if (consoleErrors.length) {
        throw new Error(`Page errors: ${consoleErrors.slice(0, 3).join(" | ")}`);
      }
      return `preview rendered, ${distinct} distinct colours`;
    } finally {
      await browser.close();
    }
  });

  const width = Math.max(...steps.map((entry) => entry.name.length));
  console.log(`\nVortex deployment smoke test — ${baseUrl}\n`);
  for (const entry of steps) {
    const status = entry.ok ? "PASS" : "FAIL";
    console.log(
      `  ${status}  ${entry.name.padEnd(width)}  ${String(entry.ms).padStart(6)}ms  ${entry.detail}`,
    );
  }
  console.log("");

  if (failed) {
    console.error("Deployment smoke test failed. This deployment cannot serve customers.\n");
    process.exit(1);
  }
  console.log("Deployment smoke test passed.\n");
}

await main();
