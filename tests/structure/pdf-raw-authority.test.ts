import assert from "node:assert/strict";
import { test } from "node:test";
import { importVectorPdfRawAuthority } from "@/lib/structure";

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
  const pageContent = "q\n/I0 Do\nQ";
  return buildPdf([
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 72 72] /Resources 4 0 R /Contents 5 0 R >>",
    "<< /XObject << /I0 6 0 R >> >>",
    streamObject(pageContent),
    streamObject(
      form,
      "/Type /XObject /Subtype /Form /BBox [0 0 72 72] /Matrix [1 0 0 1 0 0] /Resources 7 0 R",
    ),
    "<< /ColorSpace << /C3 [/Separation /DieCutRed /DeviceCMYK 8 0 R] /C4 [/Separation /DieCutBlue /DeviceCMYK 8 0 R] /C5 [/Separation /DieCutGreen /DeviceCMYK 8 0 R] >> >>",
    "<< /FunctionType 2 /Domain [0 1] /C0 [0 0 0 0] /C1 [1 0 0 0] /N 1 >>",
  ]);
}

test("raw PDF authority preserves named separations across a Form XObject", async () => {
  const dieline = await importVectorPdfRawAuthority(fixturePdf(), {
    id: "raw-pdf-fixture",
    sourceName: "synthetic-separation.pdf",
    rules: [
      { operation: "cut", spotName: "DieCutBlue" },
      { operation: "crease", spotName: "DieCutRed" },
    ],
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
        rules: [
          { operation: "cut", spotName: "DieCutBlue" },
          { operation: "crease", spotName: "DieCutRed" },
        ],
      }),
    /no explicit structural classification/,
  );
});
