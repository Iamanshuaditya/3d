#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import process from "node:process";
import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFNumber,
  PDFRawStream,
  PDFString,
} from "pdf-lib";

const args = process.argv.slice(2);
const input = args.find((arg) => !arg.startsWith("--")) ?? "output/pdf/mailer-box-001-production-pdfx4.pdf";
const expectedComponentsArg = args.find((arg) => arg.startsWith("--expect-output-components="));
const expectedComponents = expectedComponentsArg
  ? Number(expectedComponentsArg.split("=")[1])
  : undefined;
const expectedConditionArg = args.find((arg) => arg.startsWith("--expect-output-condition="));
const expectedCondition = expectedConditionArg?.split("=")[1];
const bytes = await readFile(input);
const source = bytes.toString("latin1");
const pdf = await PDFDocument.load(bytes, { updateMetadata: false });
const context = pdf.context;
const failures = [];
const checks = [];

function check(name, passed, detail) {
  checks.push({ name, passed, detail });
  if (!passed) failures.push(`${name}: ${detail}`);
}

function literalText(value) {
  return value instanceof PDFString ? value.decodeText() : String(value ?? "");
}

check("PDF header", source.startsWith("%PDF-1.6"), source.slice(0, 8));
check("Pages", pdf.getPageCount() > 0, `${pdf.getPageCount()} page(s)`);

const infoRef = context.trailerInfo.Info;
const info = infoRef ? context.lookup(infoRef, PDFDict) : undefined;
const pdfXVersion = info?.lookupMaybe(PDFName.of("GTS_PDFXVersion"), PDFString);
check("PDF/X identifier", literalText(pdfXVersion) === "PDF/X-4", literalText(pdfXVersion));

const intents = pdf.catalog.lookupMaybe(PDFName.of("OutputIntents"), PDFArray);
const intent = intents?.size() ? context.lookup(intents.get(0), PDFDict) : undefined;
const profile = intent?.lookupMaybe(PDFName.of("DestOutputProfile"), PDFRawStream);
const channels = profile?.dict.lookupMaybe(PDFName.of("N"), PDFNumber)?.asNumber();
const outputCondition = literalText(
  intent?.lookupMaybe(PDFName.of("OutputConditionIdentifier"), PDFString),
);
check("ICC output intent", Boolean(profile), profile ? `${profile.contents.length} compressed bytes` : "missing");
check(
  "ICC output channel count",
  expectedComponents ? channels === expectedComponents : channels === 3 || channels === 4,
  String(channels ?? "missing"),
);
if (expectedCondition) {
  check("Output condition", outputCondition === expectedCondition, outputCondition || "missing");
}

const ocProperties = pdf.catalog.lookupMaybe(PDFName.of("OCProperties"), PDFDict);
const ocgs = ocProperties?.lookupMaybe(PDFName.of("OCGs"), PDFArray);
const layerNames = [];
if (ocgs) {
  for (let index = 0; index < ocgs.size(); index += 1) {
    const layer = context.lookup(ocgs.get(index), PDFDict);
    layerNames.push(literalText(layer.lookupMaybe(PDFName.of("Name"), PDFString)));
  }
}
check(
  "Technical layers",
  layerNames.includes("Cutting") && layerNames.includes("Creasing"),
  layerNames.join(", ") || "missing",
);
check(
  "Spot colors",
  source.includes("/CutContour") && source.includes("/Crease"),
  "CutContour and Crease Separation spaces",
);
check(
  "Overprint",
  source.includes("/OP true") && source.includes("/op true") && source.includes("/OPM 1"),
  "stroke/fill overprint with mode 1",
);
check("XMP metadata", source.includes("/Subtype /XML"), "catalog metadata stream");

for (const [index, page] of pdf.getPages().entries()) {
  const resources = page.node.Resources();
  const colorSpaces = resources?.lookupMaybe(PDFName.of("ColorSpace"), PDFDict);
  const defaultRgb = colorSpaces?.lookupMaybe(PDFName.of("DefaultRGB"), PDFArray);
  const sourceProfile = defaultRgb?.size() === 2
    ? context.lookup(defaultRgb.get(1), PDFRawStream)
    : undefined;
  const sourceChannels = sourceProfile?.dict.lookupMaybe(PDFName.of("N"), PDFNumber)?.asNumber();
  check(
    `Page ${index + 1} source RGB profile`,
    sourceChannels === 3,
    `${sourceChannels ?? "missing"} channels`,
  );
  const boxes = [
    page.getMediaBox(),
    page.getCropBox(),
    page.getBleedBox(),
    page.getTrimBox(),
    page.getArtBox(),
  ];
  const first = boxes[0];
  const equal = boxes.every(
    (box) =>
      Math.abs(box.x - first.x) < 0.001 &&
      Math.abs(box.y - first.y) < 0.001 &&
      Math.abs(box.width - first.width) < 0.001 &&
      Math.abs(box.height - first.height) < 0.001,
  );
  const widthMm = (first.width * 25.4) / 72;
  const heightMm = (first.height * 25.4) / 72;
  check(
    `Page ${index + 1} boxes`,
    equal && widthMm > 0 && heightMm > 0,
    `${widthMm.toFixed(2)} × ${heightMm.toFixed(2)} mm; all production boxes aligned`,
  );
}

console.log(JSON.stringify({ file: input, passed: failures.length === 0, checks }, null, 2));
if (failures.length) {
  console.error(`\nProduction PDF validation failed:\n- ${failures.join("\n- ")}`);
  process.exitCode = 1;
}
