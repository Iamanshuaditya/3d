import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium, type Browser, type Page } from "playwright";
import { PRODUCTS } from "../src/lib/configurator/product-config";
import {
  buildProductExperienceMatrix,
  PRODUCT_EXPERIENCE_FIXTURES,
  type ProductExperienceCapture,
} from "../src/lib/qa/product-experience";
import { buildProductExperienceDiagnostics } from "../src/lib/qa/product-experience-diagnostics";
import { evaluateProductExperience } from "../src/lib/qa/product-experience-gates";

/**
 * Generates the full product-experience reference set in one command.
 *
 * Two lanes, deliberately kept apart:
 *
 *  - Objective gates run headlessly over measurable geometry, mapping and
 *    presentation facts. They fail this command, and therefore CI.
 *  - Screenshots are EVIDENCE. This script never scores them and never sets a
 *    pass. A reviewer compares them and authors the visual review, so a purely
 *    visual regression is surfaced rather than silently certified.
 */

const DEFAULT_BASE_URL = "http://localhost:3000";
const DEFAULT_OUTPUT_DIR = ".quality-local/product-experience";
const DEFAULT_WIDTH = 1440;
const DEFAULT_HEIGHT = 900;
const READY_TIMEOUT_MS = 60_000;

type Args = {
  baseUrl: string;
  outputDir: string;
  width: number;
  height: number;
  gatesOnly: boolean;
};

function usage(): never {
  console.error(
    [
      "Usage: npm run capture:product-experience --",
      "  [--base-url http://localhost:3000]",
      "  [--width <px>] [--height <px>] [--out <local-output-dir>]",
      "  [--gates-only]",
      "",
      "Requires a running dev or production server unless --gates-only is set.",
    ].join("\n"),
  );
  process.exit(2);
}

function parseArgs(argv: readonly string[]): Args {
  const args: Args = {
    baseUrl: DEFAULT_BASE_URL,
    outputDir: DEFAULT_OUTPUT_DIR,
    width: DEFAULT_WIDTH,
    height: DEFAULT_HEIGHT,
    gatesOnly: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--gates-only") {
      args.gatesOnly = true;
      continue;
    }
    const next = argv[index + 1];
    if (!arg.startsWith("--") || !next || next.startsWith("--")) usage();
    index += 1;
    switch (arg) {
      case "--base-url":
        args.baseUrl = next.replace(/\/$/, "");
        break;
      case "--out":
        args.outputDir = next;
        break;
      case "--width":
        args.width = Number(next);
        if (!Number.isInteger(args.width)) usage();
        break;
      case "--height":
        args.height = Number(next);
        if (!Number.isInteger(args.height)) usage();
        break;
      default:
        usage();
    }
  }
  return args;
}

function captureUrl(args: Args, capture: ProductExperienceCapture): string {
  const params = new URLSearchParams({
    capture: capture.id,
    width: String(args.width),
    height: String(args.height),
  });
  return `${args.baseUrl}/studio/product-experience/capture?${params.toString()}`;
}

async function captureOne(
  page: Page,
  args: Args,
  capture: ProductExperienceCapture,
  destination: string,
): Promise<string> {
  await page.setViewportSize({ width: args.width, height: args.height });
  await page.goto(captureUrl(args, capture), { waitUntil: "load" });
  await page.waitForSelector(
    `[data-capture-id="${capture.id}"][data-capture-ready="true"]`,
    { timeout: READY_TIMEOUT_MS },
  );
  const stage = page.locator(`[data-capture-id="${capture.id}"]`);
  const path = `${destination}/captures/${capture.id}.png`;
  await stage.screenshot({ path });
  return path;
}

// ---- Lane 1: objective gates ----------------------------------------------

const gateFailures = PRODUCT_EXPERIENCE_FIXTURES.flatMap((fixture) => {
  const config = PRODUCTS[fixture.productId];
  if (!config) {
    return [
      {
        gate: "surfacePhysicallySized" as const,
        productId: fixture.productId,
        detail: `fixture ${fixture.id} points at a product that is not in the catalogue`,
      },
    ];
  }
  return evaluateProductExperience(buildProductExperienceDiagnostics(config));
});

for (const failure of gateFailures) {
  console.error(`[gate] FAIL ${failure.productId} ${failure.gate}: ${failure.detail}`);
}

const args = parseArgs(process.argv.slice(2));

if (args.gatesOnly) {
  console.log(
    `${JSON.stringify(
      { lane: "objective", failures: gateFailures.length, details: gateFailures },
      null,
      2,
    )}\n`,
  );
  process.exit(gateFailures.length === 0 ? 0 : 1);
}

// ---- Lane 2: visual evidence ----------------------------------------------

const matrix = buildProductExperienceMatrix();
const destination = resolve(process.cwd(), args.outputDir);
await mkdir(`${destination}/captures`, { recursive: true });

let browser: Browser | null = null;
const written: { id: string; path: string }[] = [];
const captureErrors: { id: string; message: string }[] = [];

try {
  browser = await chromium.launch();
  const context = await browser.newContext({ deviceScaleFactor: 1 });
  const page = await context.newPage();
  page.on("pageerror", (error) => {
    console.error(`[capture] page error: ${error.message}`);
  });
  for (const capture of matrix) {
    try {
      const path = await captureOne(page, args, capture, destination);
      written.push({ id: capture.id, path });
      console.error(`[capture] ${capture.id} -> ${path}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      captureErrors.push({ id: capture.id, message });
      console.error(`[capture] FAILED ${capture.id}: ${message}`);
    }
  }
} finally {
  await browser?.close();
}

const indexPath = `${destination}/capture-index.json`;
const scaffoldPath = `${destination}/visual-review.scaffold.json`;

await Promise.all([
  writeFile(
    indexPath,
    `${JSON.stringify(
      {
        schemaVersion: 1,
        baseUrl: args.baseUrl,
        viewport: { width: args.width, height: args.height },
        expectedCaptureCount: matrix.length,
        captures: written,
        captureErrors,
        objectiveFailures: gateFailures,
      },
      null,
      2,
    )}\n`,
  ),
  writeFile(
    scaffoldPath,
    `${JSON.stringify(
      {
        schemaVersion: 1,
        reviewer: "",
        note:
          "Scores and verdicts are intentionally blank. Screenshot parity is not " +
          "manufacturer certification; a reviewer must inspect these captures.",
        captures: written.map((entry) => ({
          id: entry.id,
          evidencePath: entry.path.replace(`${process.cwd()}/`, ""),
          verdict: "",
          notes: "",
        })),
      },
      null,
      2,
    )}\n`,
  ),
]);

const missing = matrix.length - written.length;
console.log(
  `${JSON.stringify(
    {
      outputDir: destination,
      expectedCaptureCount: matrix.length,
      capturedCount: written.length,
      missingCount: missing,
      objectiveFailureCount: gateFailures.length,
      indexPath,
      scaffoldPath,
      note:
        "Objective gate failures fail this command. Missing captures fail it too, " +
        "so a silently skipped state can never read as covered. Visual differences " +
        "are left for review and are never auto-certified.",
    },
    null,
    2,
  )}\n`,
);

process.exit(gateFailures.length === 0 && captureErrors.length === 0 ? 0 : 1);
