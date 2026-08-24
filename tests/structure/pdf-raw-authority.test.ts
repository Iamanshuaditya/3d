import assert from "node:assert/strict";
import { test } from "node:test";
import {
  evaluateGoldenStructuralAcceptance,
  importVectorPdfRawAuthority,
} from "@/lib/structure";

function buildPdf(objects: readonly string[]): Uint8Array {
  const encoder = new TextEncoder();
  let body = "%PDF-1.4\n%\xE2\xE3\xCF\xD3\n";
  const offsets = [0];
  for (let index = 0; index < objects.length; index += 1) {
    offsets.push(encoder.encode(body).byteLength);
    body += `${index + 1} 0 obj\n${objects[index]}\nendobj\n`;
  }
  const xrefOffset = encoder.encode(body).byteLength;
  body += `xref\n0 ${objects.length + 1}\n`;
  body += "0000000000 65535 f \n";
  for (let index = 1; index <= objects.length; index += 1) {
    body += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  }
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return encoder.encode(body);
}

function streamObject(contents: string, dictionary = ""): string {
  const length = new TextEncoder().encode(contents).byteLength;
  return `<< /Length ${length} ${dictionary} >>\nstream\n${contents}\nendstream`;
}

function pdfWithForm(form: string, widthPt: number, heightPt: number): Uint8Array {
  const pageContent = "q\n/I0 Do\nQ";
  return buildPdf([
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${widthPt} ${heightPt}] /Resources 4 0 R /Contents 5 0 R >>`,
    "<< /XObject << /I0 6 0 R >> >>",
    streamObject(pageContent),
    streamObject(
      form,
      `/Type /XObject /Subtype /Form /BBox [0 0 ${widthPt} ${heightPt}] /Matrix [1 0 0 1 0 0] /Resources 7 0 R`,
    ),
    "<< /ColorSpace << /C3 [/Separation /DieCutRed /DeviceCMYK 8 0 R] /C4 [/Separation /DieCutBlue /DeviceCMYK 8 0 R] /C5 [/Separation /DieCutGreen /DeviceCMYK 8 0 R] >> >>",
    "<< /FunctionType 2 /Domain [0 1] /C0 [0 0 0 0] /C1 [1 0 0 0] /N 1 >>",
  ]);
}

function fixturePdf(): Uint8Array {
  const form = [
    "q",
    "1 0 0 -1 0 72 cm",
    "/C4 CS 1 SCN",
    "0 0 m 72 0 l 72 72 l 0 72 l h S",
    "/C3 CS 1 SCN",
    "36 0 m 36 72 l S",
    "/C5 CS 1 SCN",
    "4 4 m 68 4 l 68 68 l 4 68 l h S",
    "Q",
  ].join("\n");
  return pdfWithForm(form, 72, 72);
}

function endToEndFixturePdf(): Uint8Array {
  const ptPerMm = 72 / 25.4;
  const width = 100 * ptPerMm;
  const height = 50 * ptPerMm;
  const x10 = 10 * ptPerMm;
  const x20 = 20 * ptPerMm;
  const x50 = 50 * ptPerMm;
  const y10 = 10 * ptPerMm;
  const y20 = 20 * ptPerMm;
  const y25 = 25 * ptPerMm;
  const n = (value: number) => value.toFixed(10);
  const form = [
    "q",
    `1 0 0 -1 0 ${n(height)} cm`,
    "/C4 CS 1 SCN",
    `0 0 m ${n(width)} 0 l ${n(width)} ${n(height)} l 0 ${n(height)} l h S`,
    `${n(x10)} ${n(y10)} m ${n(x20)} ${n(y10)} l ${n(x20)} ${n(y20)} l ${n(x10)} ${n(y20)} l h S`,
    "/C3 CS 1 SCN",
    `${n(x50)} 0 m ${n(x50)} ${n(y25)} l S`,
    `${n(x50)} ${n(y25)} m ${n(x50)} ${n(height)} l S`,
    "Q",
  ].join("\n");
  return pdfWithForm(form, width, height);
}

const semanticRules = [
  { operation: "cut" as const, spotName: "DieCutBlue" },
  { operation: "crease" as const, spotName: "DieCutRed" },
];

test("raw PDF authority preserves named separations across a Form XObject", async () => {
  const dieline = await importVectorPdfRawAuthority(fixturePdf(), {
    id: "raw-pdf-fixture",
    sourceName: "synthetic-separation.pdf",
    rules: semanticRules,
    ignoredSpotNames: ["DieCutGreen"],
  });

  assert.equal(dieline.entities.length, 2);
  const cut = dieline.entities.find((entity) => entity.operation === "cut");
  const crease = dieline.entities.find((entity) => entity.operation === "crease");
  assert.ok(cut);
  assert.ok(crease);
  assert.equal(cut.path.closed, true);
  assert.equal(crease.path.closed, false);
  assert.equal(cut.provenance.metadata?.separationName, "DieCutBlue");
  assert.equal(cut.provenance.metadata?.colorSpaceResource, "C4");
  assert.equal(cut.provenance.metadata?.xObjectPath, "I0");
  assert.equal(crease.provenance.metadata?.separationName, "DieCutRed");

  const first = cut.path.segments[0];
  assert.equal(first.kind, "line");
  if (first.kind !== "line") throw new Error("expected line segment");
  assert.ok(Math.abs(first.start.x) < 1e-9);
  assert.ok(Math.abs(first.start.y) < 1e-9);
  assert.ok(Math.abs(first.end.x - 25.4) < 1e-9);
  assert.ok(Math.abs(first.end.y) < 1e-9);
});

test("raw PDF authority fails closed when a stroked separation is neither mapped nor explicitly ignored", async () => {
  await assert.rejects(
    () =>
      importVectorPdfRawAuthority(fixturePdf(), {
        id: "raw-pdf-fixture",
        rules: semanticRules,
      }),
    /no explicit structural classification/,
  );
});

test("raw PDF bytes survive the entire authority-to-panel-to-mesh acceptance pipeline", async () => {
  const dieline = await importVectorPdfRawAuthority(endToEndFixturePdf(), {
    id: "raw-e2e-fixture",
    sourceName: "synthetic-e2e.pdf",
    sourceSha256: "synthetic-e2e-sha",
    rules: semanticRules,
  });
  const report = evaluateGoldenStructuralAcceptance(dieline, {
    sourceSha256: "synthetic-e2e-sha",
    outerEnvelopeMm: { width: 100, height: 50, tolerance: 1e-6 },
    outerEdgeCount: 4,
    windowEdgeCount: 4,
    creaseSourceSegmentCount: 2,
    creaseChainCount: 1,
    windowAreaMm2: { value: 100, tolerance: 1e-6 },
    windowPerimeterMm: { value: 40, tolerance: 1e-6 },
    maxUvRoundTripMm: 0.0001,
  });

  assert.equal(report.passed, true);
  assert.equal(report.windowOwnerCount, 1);
  assert.equal(report.panelCount, 2);
  assert.ok(report.flat.passesBoundaryGate);
  assert.ok(report.flat.passesHoleGeometryGate);
});
