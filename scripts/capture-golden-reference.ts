import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium, type Browser, type Page } from "playwright";
import {
  createGoldenReferenceVisualReviewTemplate,
  GOLDEN_REFERENCE_REQUIRED_CAPTURES,
  type GoldenReferenceCaptureId,
} from "../src/lib/structure";

/**
 * Captures the six fixed-camera golden reference states from the private
 * development capture route.
 *
 * The route owns the camera, the lights and the diagnostic artwork, and snaps
 * to each absolute pose on first render. This script only navigates, waits for
 * the route's own readiness flag, and writes the PNG — it never nudges the
 * camera or the pose, so the images stay comparable to each other.
 *
 * The captured PNGs are visual EVIDENCE for a human/agent review. This script
 * deliberately does not score them and does not set any hard gate.
 */

const DEFAULT_BASE_URL = "http://localhost:3000";
const DEFAULT_OUTPUT_DIR = ".quality-local/golden-reference";
const DEFAULT_WIDTH = 1600;
const DEFAULT_HEIGHT = 1000;
const PAIR_CAPTURE_ID = "06-major-and-final";
const READY_TIMEOUT_MS = 60_000;

type Args = {
  baseUrl: string;
  outputDir: string;
  physicalTop: "north" | "south";
  closureVariant: "plain-final" | "window-final";
  boardThicknessMm: number;
  width: number;
  height: number;
};

function usage(): never {
  console.error(
    [
      "Usage: npm run capture:golden-reference --",
      "  [--base-url http://localhost:3000]",
      "  [--top north|south] [--closure plain-final|window-final] [--thickness <mm>]",
      "  [--width <px>] [--height <px>] [--out <local-output-dir>]",
      "",
      "Requires a running dev server started with VORTEX_GOLDEN_REFERENCE_PDF set.",
    ].join("\n"),
  );
  process.exit(2);
}

function parseArgs(argv: readonly string[]): Args {
  const args: Args = {
    baseUrl: DEFAULT_BASE_URL,
    outputDir: DEFAULT_OUTPUT_DIR,
    physicalTop: "north",
    closureVariant: "plain-final",
    boardThicknessMm: 0.6,
    width: DEFAULT_WIDTH,
    height: DEFAULT_HEIGHT,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (!arg.startsWith("--")) usage();
    if (!next || next.startsWith("--")) usage();
    index += 1;
    switch (arg) {
      case "--base-url":
        args.baseUrl = next.replace(/\/$/, "");
        break;
      case "--out":
        args.outputDir = next;
        break;
      case "--top":
        if (next !== "north" && next !== "south") usage();
        args.physicalTop = next;
        break;
      case "--closure":
        if (next !== "plain-final" && next !== "window-final") usage();
        args.closureVariant = next;
        break;
      case "--thickness":
        args.boardThicknessMm = Number(next);
        if (!Number.isFinite(args.boardThicknessMm) || args.boardThicknessMm <= 0) usage();
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

function captureUrl(args: Args, captureId: GoldenReferenceCaptureId): string {
  const width = captureId === PAIR_CAPTURE_ID ? args.width * 2 : args.width;
  const params = new URLSearchParams({
    capture: captureId,
    top: args.physicalTop,
    closure: args.closureVariant,
    thickness: String(args.boardThicknessMm),
    width: String(width),
    height: String(args.height),
  });
  return `${args.baseUrl}/studio/golden-reference/capture?${params.toString()}`;
}

async function captureOne(
  page: Page,
  args: Args,
  captureId: GoldenReferenceCaptureId,
  destination: string,
): Promise<string> {
  const width = captureId === PAIR_CAPTURE_ID ? args.width * 2 : args.width;
  await page.setViewportSize({ width, height: args.height });
  await page.goto(captureUrl(args, captureId), { waitUntil: "load" });
  await page.waitForSelector(`[data-capture-id="${captureId}"][data-capture-ready="true"]`, {
    timeout: READY_TIMEOUT_MS,
  });
  const stage = page.locator(`[data-capture-id="${captureId}"]`);
  const path = `${destination}/captures/${captureId}.png`;
  await stage.screenshot({ path });
  return path;
}

const args = parseArgs(process.argv.slice(2));
const destination = resolve(process.cwd(), args.outputDir);
await mkdir(`${destination}/captures`, { recursive: true });

let browser: Browser | null = null;
const written: { id: GoldenReferenceCaptureId; path: string }[] = [];
try {
  browser = await chromium.launch();
  const context = await browser.newContext({ deviceScaleFactor: 1 });
  const page = await context.newPage();
  page.on("pageerror", (error) => {
    console.error(`[capture] page error: ${error.message}`);
  });
  for (const captureId of GOLDEN_REFERENCE_REQUIRED_CAPTURES) {
    const path = await captureOne(page, args, captureId, destination);
    written.push({ id: captureId, path });
    console.error(`[capture] ${captureId} -> ${path}`);
  }
} finally {
  await browser?.close();
}

const candidateId = `${args.physicalTop}-${args.closureVariant}-${args.boardThicknessMm.toFixed(3)}mm`;
const template = createGoldenReferenceVisualReviewTemplate(candidateId);
const scaffold = {
  ...template,
  captures: written.map((entry) => ({
    id: entry.id,
    evidencePath: entry.path.replace(`${process.cwd()}/`, ""),
    notes: "",
  })),
};

const indexPath = `${destination}/reference-capture-index.json`;
const scaffoldPath = `${destination}/visual-review.scaffold.json`;
await Promise.all([
  writeFile(
    indexPath,
    `${JSON.stringify(
      {
        schemaVersion: 1,
        candidateId,
        baseUrl: args.baseUrl,
        viewport: { width: args.width, height: args.height },
        captures: written,
      },
      null,
      2,
    )}\n`,
  ),
  writeFile(scaffoldPath, `${JSON.stringify(scaffold, null, 2)}\n`),
]);

console.log(
  `${JSON.stringify(
    {
      outputDir: destination,
      candidateId,
      captureCount: written.length,
      indexPath,
      scaffoldPath,
      note: "Hard gates and scores are intentionally unset. A reviewer must inspect these PNGs and author visual-review.json.",
    },
    null,
    2,
  )}\n`,
);
