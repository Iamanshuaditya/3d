import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import {
  evaluateGoldenStructuralAcceptance,
  importVectorPdfRawAuthority,
  LOCK_BOTTOM_WINDOW_300_150_200_EXPECTATIONS,
} from "../src/lib/structure";

const file = process.argv[2];
if (!file) {
  console.error("Usage: npx tsx scripts/verify-golden-structure.ts <authorized-reference.pdf>");
  process.exit(2);
}

const bytes = new Uint8Array(await readFile(file));
const sha256 = createHash("sha256").update(bytes).digest("hex");
const dieline = await importVectorPdfRawAuthority(bytes, {
  id: "cloudlab-lock-bottom-window-300x150x200",
  sourceName: file.split(/[\\/]/).pop(),
  sourceSha256: sha256,
  rules: [
    { operation: "cut", spotName: "DieCutBlue" },
    { operation: "crease", spotName: "DieCutRed" },
  ],
  ignoredSpotNames: ["DieCutGreen"],
  metadata: {
    productName: "Lock Bottom and top incl. window",
    nominalDimensions: "300 x 150 x 200 mm",
    authority: "authorized-local-vector-pdf",
  },
});

const report = evaluateGoldenStructuralAcceptance(
  dieline,
  LOCK_BOTTOM_WINDOW_300_150_200_EXPECTATIONS,
);
console.log(JSON.stringify(report, null, 2));
if (!report.passed) process.exitCode = 1;
