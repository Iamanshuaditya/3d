import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFHeader,
  PDFName,
  PDFNumber,
  PDFOperator,
  PDFOperatorNames as Ops,
  PDFString,
} from "pdf-lib";
import { preflightPrintJob } from "./preflight";
import { renderProductionArtwork } from "./render-production-artwork";
import { loadIccProfile } from "./load-icc-profile";
import type {
  NormalizedPrintJob,
  IccProfileLoader,
  PreflightReport,
  ProductionArtworkRenderer,
  ProductionPdfResult,
  TechnicalLayerProfile,
} from "./types";

const POINTS_PER_MM = 72 / 25.4;

type TechnicalLayerResources = {
  resourceName: string;
  colorSpaceName: string;
  ocgRef: ReturnType<PDFDocument["context"]["register"]>;
  colorSpaceRef: ReturnType<PDFDocument["context"]["register"]>;
};

function xmlEscape(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function xmpMetadata(job: NormalizedPrintJob, report: PreflightReport): string {
  const title = xmlEscape(`${job.product.name} production artwork`);
  const created = xmlEscape(report.createdAt);
  return `<?xpacket begin="\uFEFF" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/" x:xmptk="Vortex Print Engine 1.0">
  <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
    <rdf:Description rdf:about=""
      xmlns:dc="http://purl.org/dc/elements/1.1/"
      xmlns:xmp="http://ns.adobe.com/xap/1.0/"
      xmlns:pdf="http://ns.adobe.com/pdf/1.3/"
      xmlns:pdfxid="http://www.npes.org/pdfx/ns/id/"
      xmlns:pdfx="http://ns.adobe.com/pdfx/1.3/"
      pdf:Producer="Vortex Print Engine 1.0"
      xmp:CreatorTool="Vortex Studio"
      xmp:CreateDate="${created}"
      xmp:ModifyDate="${created}"
      pdfxid:GTS_PDFXVersion="PDF/X-4"
      pdfx:PrintProfile="${xmlEscape(job.profile.id)}"
      pdfx:PreflightStatus="${report.passed ? "passed" : "failed"}">
      <dc:format>application/pdf</dc:format>
      <dc:title><rdf:Alt><rdf:li xml:lang="x-default">${title}</rdf:li></rdf:Alt></dc:title>
    </rdf:Description>
  </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`;
}

function ensureDictionary(parent: PDFDict, key: string, context: PDFDocument["context"]): PDFDict {
  const name = PDFName.of(key);
  const existing = parent.lookupMaybe(name, PDFDict);
  if (existing) return existing;
  const created = context.obj({}) as PDFDict;
  parent.set(name, created);
  return created;
}

async function addOutputIntent(
  pdf: PDFDocument,
  job: NormalizedPrintJob,
  report: PreflightReport,
  loadProfile: IccProfileLoader,
) {
  const context = pdf.context;
  const outputBytes = await loadProfile(job.profile.outputIcc);
  const outputStream = context.flateStream(outputBytes, {
    N: job.profile.outputIcc.components,
    Alternate: job.profile.outputIcc.alternate,
  });
  const outputRef = context.register(outputStream);
  const sourceRef =
    job.profile.sourceIcc.id === job.profile.outputIcc.id
      ? outputRef
      : context.register(
          context.flateStream(await loadProfile(job.profile.sourceIcc), {
            N: job.profile.sourceIcc.components,
            Alternate: job.profile.sourceIcc.alternate,
          }),
        );
  const outputIntent = context.obj({
    Type: "OutputIntent",
    S: "GTS_PDFX",
    OutputConditionIdentifier: PDFString.of(job.profile.outputConditionIdentifier),
    RegistryName: PDFString.of(job.profile.registryName),
    Info: PDFString.of(`${job.profile.label}; ${job.profile.outputIcc.label}`),
    DestOutputProfile: outputRef,
  });
  const outputIntentRef = context.register(outputIntent);
  pdf.catalog.set(PDFName.of("OutputIntents"), context.obj([outputIntentRef]));

  const metadata = context.flateStream(new TextEncoder().encode(xmpMetadata(job, report)), {
    Type: "Metadata",
    Subtype: "XML",
  });
  pdf.catalog.set(PDFName.of("Metadata"), context.register(metadata));
  return sourceRef;
}

function addPdfXInfo(pdf: PDFDocument, job: NormalizedPrintJob, createdAt: string) {
  const artifactDate = new Date(createdAt);
  if (Number.isNaN(artifactDate.valueOf())) {
    throw new Error("Production report has an invalid creation time.");
  }
  pdf.context.header = PDFHeader.forVersion(1, 6);
  pdf.setTitle(`${job.product.name} production artwork`);
  pdf.setSubject(`Production artwork generated for ${job.profile.label}`);
  pdf.setCreator("Vortex Studio");
  pdf.setProducer("Vortex Print Engine 1.0");
  pdf.setKeywords([job.product.id, job.profile.id, "production artwork", "PDF/X-4"]);
  pdf.setCreationDate(artifactDate);
  pdf.setModificationDate(artifactDate);

  const infoRef = pdf.context.trailerInfo.Info;
  const info = infoRef ? pdf.context.lookup(infoRef, PDFDict) : undefined;
  info?.set(PDFName.of("GTS_PDFXVersion"), PDFString.of("PDF/X-4"));
  info?.set(PDFName.of("Trapped"), PDFName.of("False"));
}

function makeTechnicalLayer(
  pdf: PDFDocument,
  profile: TechnicalLayerProfile,
  index: number,
): TechnicalLayerResources {
  const context = pdf.context;
  const resourceName = `VTXLayer${index}`;
  const colorSpaceName = `VTXSpot${index}`;
  const ocgRef = context.register(
    context.obj({
      Type: "OCG",
      Name: PDFString.of(profile.name),
      Usage: context.obj({
        Print: context.obj({ PrintState: "ON" }),
        View: context.obj({ ViewState: "ON" }),
      }),
    }),
  );
  const tintFunctionRef = context.register(
    context.obj({
      FunctionType: 2,
      Domain: [0, 1],
      C0: [0, 0, 0, 0],
      C1: profile.alternateCmyk,
      N: 1,
    }),
  );
  const colorSpaceRef = context.register(
    context.obj(["Separation", PDFName.of(profile.spotName), "DeviceCMYK", tintFunctionRef]),
  );
  return { resourceName, colorSpaceName, ocgRef, colorSpaceRef };
}

function configureOptionalContent(
  pdf: PDFDocument,
  layers: TechnicalLayerResources[],
) {
  const context = pdf.context;
  const refs = layers.map((layer) => layer.ocgRef);
  pdf.catalog.set(
    PDFName.of("OCProperties"),
    context.obj({
      OCGs: refs,
      D: context.obj({
        BaseState: "ON",
        ON: refs,
        Order: refs,
      }),
    }),
  );
}

function addPageResources(
  pdf: PDFDocument,
  page: ReturnType<PDFDocument["addPage"]>,
  iccRef: ReturnType<PDFDocument["context"]["register"]>,
  layers: TechnicalLayerResources[],
) {
  let resources = page.node.Resources();
  if (!resources) {
    resources = pdf.context.obj({}) as PDFDict;
    page.node.set(PDFName.of("Resources"), resources);
  }
  const colorSpaces = ensureDictionary(resources, "ColorSpace", pdf.context);
  colorSpaces.set(PDFName.of("DefaultRGB"), pdf.context.obj(["ICCBased", iccRef]));
  layers.forEach((layer) => {
    colorSpaces.set(PDFName.of(layer.colorSpaceName), layer.colorSpaceRef);
  });

  const properties = ensureDictionary(resources, "Properties", pdf.context);
  layers.forEach((layer) => {
    properties.set(PDFName.of(layer.resourceName), layer.ocgRef);
  });

  const extGState = ensureDictionary(resources, "ExtGState", pdf.context);
  extGState.set(
    PDFName.of("VTXOverprint"),
    pdf.context.obj({ Type: "ExtGState", OP: true, op: true, OPM: 1 }),
  );
}

function number(value: number) {
  return PDFNumber.of(Number(value.toFixed(5)));
}

function pathOperators(
  points: number[],
  closed: boolean,
  editorWidth: number,
  editorHeight: number,
  pageWidthPt: number,
  pageHeightPt: number,
): PDFOperator[] {
  if (points.length < 4 || points.length % 2 !== 0) return [];
  const x = (value: number) => (value / editorWidth) * pageWidthPt;
  const y = (value: number) => pageHeightPt - (value / editorHeight) * pageHeightPt;
  const operators: PDFOperator[] = [
    PDFOperator.of(Ops.MoveTo, [number(x(points[0])), number(y(points[1]))]),
  ];
  for (let index = 2; index < points.length; index += 2) {
    operators.push(
      PDFOperator.of(Ops.LineTo, [number(x(points[index])), number(y(points[index + 1]))]),
    );
  }
  if (closed) operators.push(PDFOperator.of(Ops.ClosePath));
  operators.push(PDFOperator.of(Ops.StrokePath));
  return operators;
}

function addTechnicalPaths(
  pdf: PDFDocument,
  page: ReturnType<PDFDocument["addPage"]>,
  layer: TechnicalLayerResources,
  profile: TechnicalLayerProfile,
  paths: { points: number[]; closed: boolean }[],
  editorWidth: number,
  editorHeight: number,
  pageWidthPt: number,
  pageHeightPt: number,
) {
  if (!paths.length) return;
  const dash = pdf.context.obj((profile.dashMm ?? []).map((value) => value * POINTS_PER_MM)) as PDFArray;
  const operators: PDFOperator[] = [
    PDFOperator.of(Ops.PushGraphicsState),
    PDFOperator.of(Ops.BeginMarkedContentSequence, [PDFName.of("OC"), PDFName.of(layer.resourceName)]),
    PDFOperator.of(Ops.SetGraphicsStateParams, [PDFName.of("VTXOverprint")]),
    PDFOperator.of(Ops.StrokingColorspace, [PDFName.of(layer.colorSpaceName)]),
    PDFOperator.of(Ops.StrokingColorN, [PDFNumber.of(1)]),
    PDFOperator.of(Ops.SetLineWidth, [number(profile.lineWidthMm * POINTS_PER_MM)]),
    PDFOperator.of(Ops.SetLineCapStyle, [PDFNumber.of(1)]),
    PDFOperator.of(Ops.SetLineJoinStyle, [PDFNumber.of(1)]),
    PDFOperator.of(Ops.SetLineDashPattern, [dash, PDFNumber.of(0)]),
  ];
  paths.forEach((path) =>
    operators.push(
      ...pathOperators(
        path.points,
        path.closed,
        editorWidth,
        editorHeight,
        pageWidthPt,
        pageHeightPt,
      ),
    ),
  );
  operators.push(
    PDFOperator.of(Ops.EndMarkedContent),
    PDFOperator.of(Ops.PopGraphicsState),
  );
  page.pushOperators(...operators);
}

export type GenerateProductionPdfOptions = {
  renderArtwork?: ProductionArtworkRenderer;
  loadProfile?: IccProfileLoader;
  /** Additional server checks may be supplied, but cannot bypass core preflight. */
  preflightReport?: PreflightReport;
};

export async function generateProductionPdf(
  job: NormalizedPrintJob,
  options: GenerateProductionPdfOptions = {},
): Promise<ProductionPdfResult> {
  const coreReport = preflightPrintJob(job, options.preflightReport?.createdAt);
  const report = options.preflightReport ?? coreReport;
  if (
    report.profileId !== job.profile.id ||
    report.standard !== job.profile.standard ||
    report.engine !== "Vortex Print Engine"
  ) {
    throw new Error("Production preflight report does not match this print job.");
  }
  if (!coreReport.passed || !report.passed) {
    const failedReport = !coreReport.passed ? coreReport : report;
    const messages = failedReport.issues
      .filter((issue) => issue.severity === "error")
      .map((issue) => issue.message)
      .join("\n");
    throw new Error(`Production preflight failed:\n${messages}`);
  }

  const pdf = await PDFDocument.create();
  addPdfXInfo(pdf, job, report.createdAt);
  const iccRef = await addOutputIntent(
    pdf,
    job,
    report,
    options.loadProfile ?? loadIccProfile,
  );
  const cutLayer = makeTechnicalLayer(pdf, job.profile.layers.cut, 1);
  const creaseLayer = makeTechnicalLayer(pdf, job.profile.layers.crease, 2);
  const layers = [cutLayer, creaseLayer];
  configureOptionalContent(pdf, layers);

  for (const entry of job.surfaces) {
    const pageWidthPt = entry.surface.physicalWidthCm * 10 * POINTS_PER_MM;
    const pageHeightPt = entry.surface.physicalHeightCm * 10 * POINTS_PER_MM;
    const page = pdf.addPage([pageWidthPt, pageHeightPt]);
    page.setMediaBox(0, 0, pageWidthPt, pageHeightPt);
    page.setCropBox(0, 0, pageWidthPt, pageHeightPt);
    page.setBleedBox(0, 0, pageWidthPt, pageHeightPt);
    page.setTrimBox(0, 0, pageWidthPt, pageHeightPt);
    page.setArtBox(0, 0, pageWidthPt, pageHeightPt);
    addPageResources(pdf, page, iccRef, layers);

    const artwork = await (options.renderArtwork ?? renderProductionArtwork)(
      entry,
      job.profile.renderPpi,
    );
    const image = await pdf.embedPng(artwork.pngBytes);
    page.drawImage(image, { x: 0, y: 0, width: pageWidthPt, height: pageHeightPt });

    addTechnicalPaths(
      pdf,
      page,
      cutLayer,
      job.profile.layers.cut,
      entry.dieline.cuts,
      entry.surface.editorWidth,
      entry.surface.editorHeight,
      pageWidthPt,
      pageHeightPt,
    );
    addTechnicalPaths(
      pdf,
      page,
      creaseLayer,
      job.profile.layers.crease,
      entry.dieline.creases,
      entry.surface.editorWidth,
      entry.surface.editorHeight,
      pageWidthPt,
      pageHeightPt,
    );
  }

  const bytes = await pdf.save({ useObjectStreams: false, addDefaultPage: false });
  // pdf-lib always serializes a PDF 1.7 header even when the context header is
  // set explicitly. PDF/X-4 is based on PDF 1.6, and the header token is the
  // same byte length, so normalize it after serialization without shifting any
  // xref offsets.
  bytes.set(new TextEncoder().encode("%PDF-1.6"), 0);
  return {
    bytes,
    fileName: `${job.product.id}-${job.profile.id}.pdf`,
    report,
  };
}
