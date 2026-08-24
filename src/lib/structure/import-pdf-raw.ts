import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFObject,
  PDFRawStream,
  PDFRef,
  arrayAsString,
  decodePDFRawStream,
} from "pdf-lib";
import type {
  AffineMatrix,
  CanonicalDieline,
  SourceMetadataValue,
  StructuralEntity,
  StructuralOperation,
  Vec2,
  VectorSegment,
} from "./vector-domain";
import {
  DEFAULT_STRUCTURAL_TOLERANCES,
  IDENTITY_AFFINE_MATRIX,
} from "./vector-domain";
import { applyAffine, multiplyAffine } from "./vector-math";
import type { PdfSemanticRule } from "./import-pdf";

const POINTS_TO_MM = 25.4 / 72;
const STRUCTURAL_PAINT = new Set(["S", "s", "B", "B*", "b", "b*"]);
const FILL_ONLY = new Set(["f", "F", "f*", "W", "W*", "n"]);

export type RawPdfImportOptions = Readonly<{
  id: string;
  sourceName?: string;
  sourceSha256?: string;
  rules: readonly PdfSemanticRule[];
  ignoredSpotNames?: readonly string[];
  pageNumber?: number;
  metadata?: Readonly<Record<string, SourceMetadataValue>>;
}>;

type PdfToken =
  | Readonly<{ kind: "number"; value: number }>
  | Readonly<{ kind: "name"; value: string }>
  | Readonly<{ kind: "operator"; value: string }>;

type RawStrokeStyle = {
  colorSpace: "gray" | "rgb" | "cmyk" | "spot" | "unknown";
  components: number[];
  spotName?: string;
  resourceName?: string;
  lineWidthPt: number;
};

type Subpath = {
  segments: VectorSegment[];
  start: Vec2 | null;
  current: Vec2 | null;
  closed: boolean;
};

type PathState = {
  subpaths: Subpath[];
  active: Subpath | null;
};

type GraphicsState = {
  ctm: AffineMatrix;
  stroke: RawStrokeStyle;
};

type ImportContext = {
  pdf: PDFDocument;
  options: RawPdfImportOptions;
  pageNumber: number;
  mediaBox: Readonly<{ x: number; y: number; width: number; height: number }>;
  entities: StructuralEntity[];
  objectIndex: number;
  xObjectStack: string[];
};

function nameText(name: PDFName): string {
  return name.asString().replace(/^\//, "");
}

function resolveObject(pdf: PDFDocument, object: PDFObject | undefined): PDFObject | undefined {
  if (!object) return undefined;
  return object instanceof PDFRef ? pdf.context.lookup(object) : object;
}

function resolveDict(pdf: PDFDocument, object: PDFObject | undefined): PDFDict | undefined {
  const resolved = resolveObject(pdf, object);
  return resolved instanceof PDFDict ? resolved : undefined;
}

function resolveStream(pdf: PDFDocument, object: PDFObject | undefined): PDFRawStream | undefined {
  const resolved = resolveObject(pdf, object);
  return resolved instanceof PDFRawStream ? resolved : undefined;
}

function decodeStream(stream: PDFRawStream): string {
  return arrayAsString(decodePDFRawStream(stream).decode());
}

function finite(value: number, label: string): number {
  if (!Number.isFinite(value)) throw new Error(`${label} must be finite.`);
  return value;
}

function tokenizeContent(content: string): PdfToken[] {
  const tokens: PdfToken[] = [];
  let index = 0;
  const isWhitespace = (char: string) => /[\x00\x09\x0a\x0c\x0d\x20]/.test(char);
  const isDelimiter = (char: string) => /[()<>[\]{}\/%%]/.test(char);

  while (index < content.length) {
    const char = content[index];
    if (isWhitespace(char)) {
      index += 1;
      continue;
    }
    if (char === "%") {
      while (index < content.length && content[index] !== "\n" && content[index] !== "\r") index += 1;
      continue;
    }
    if (char === "/") {
      index += 1;
      let value = "";
      while (index < content.length && !isWhitespace(content[index]) && !isDelimiter(content[index])) {
        value += content[index++];
      }
      if (!value) throw new Error("Malformed PDF name token in content stream.");
      tokens.push({ kind: "name", value });
      continue;
    }
    if (char === "(" || char === "<" || char === "[" || char === "]") {
      throw new Error("Text, strings, hex strings, and arrays are not certified in structural PDF content streams.");
    }

    let value = "";
    while (index < content.length && !isWhitespace(content[index]) && !isDelimiter(content[index])) {
      value += content[index++];
    }
    if (!value) {
      index += 1;
      continue;
    }
    const numeric = Number(value);
    if (Number.isFinite(numeric) && /^[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?$/.test(value)) {
      tokens.push({ kind: "number", value: numeric });
    } else {
      tokens.push({ kind: "operator", value });
    }
  }
  return tokens;
}

function emptyPath(): PathState {
  return { subpaths: [], active: null };
}

function startSubpath(path: PathState, point: Vec2): void {
  const subpath: Subpath = { segments: [], start: point, current: point, closed: false };
  path.subpaths.push(subpath);
  path.active = subpath;
}

function requireActive(path: PathState, operator: string): Subpath {
  if (!path.active?.current) throw new Error(`PDF ${operator} appears before moveTo.`);
  return path.active;
}

function appendLine(path: PathState, point: Vec2): void {
  const active = requireActive(path, "lineTo");
  active.segments.push({ kind: "line", start: active.current!, end: point });
  active.current = point;
}

function appendCubic(path: PathState, p1: Vec2, p2: Vec2, p3: Vec2): void {
  const active = requireActive(path, "curveTo");
  active.segments.push({ kind: "cubic", p0: active.current!, p1, p2, p3 });
  active.current = p3;
}

function closeSubpath(path: PathState): void {
  const active = requireActive(path, "closePath");
  if (!active.start) throw new Error("PDF closePath has no subpath start.");
  const dx = active.current!.x - active.start.x;
  const dy = active.current!.y - active.start.y;
  if (Math.hypot(dx, dy) > DEFAULT_STRUCTURAL_TOLERANCES.coordinateEpsilonMm) {
    active.segments.push({ kind: "line", start: active.current!, end: active.start });
  }
  active.current = active.start;
  active.closed = true;
}

function rawPointToMm(point: Vec2, state: GraphicsState, context: ImportContext): Vec2 {
  const transformed = applyAffine(state.ctm, point);
  return {
    x: (transformed.x - context.mediaBox.x) * POINTS_TO_MM,
    y: (context.mediaBox.y + context.mediaBox.height - transformed.y) * POINTS_TO_MM,
  };
}

function classify(style: RawStrokeStyle, rules: readonly PdfSemanticRule[]): StructuralOperation {
  const matches = rules.filter((rule) => {
    const tolerance = rule.tolerance ?? 1e-6;
    if (rule.spotName !== undefined && rule.spotName !== style.spotName) return false;
    if (rule.colorSpace !== undefined && rule.colorSpace !== style.colorSpace) return false;
    if (rule.components !== undefined) {
      if (rule.components.length !== style.components.length) return false;
      if (rule.components.some((component, index) => Math.abs(component - style.components[index]) > tolerance)) return false;
    }
    return true;
  });
  if (matches.length !== 1) {
    throw new Error(
      matches.length === 0
        ? `Raw PDF stroke has no explicit structural classification (${style.resourceName ?? style.colorSpace}${style.spotName ? `/${style.spotName}` : ""}).`
        : "Raw PDF stroke matches multiple structural classification rules.",
    );
  }
  return matches[0].operation;
}

function createEntity(
  subpath: Subpath,
  operation: StructuralOperation,
  style: RawStrokeStyle,
  context: ImportContext,
): StructuralEntity {
  if (subpath.segments.length === 0) throw new Error("Cannot create structural authority from an empty PDF path.");
  const objectIndex = context.objectIndex++;
  const entityId = `pdf-p${context.pageNumber}-o${objectIndex}`;
  const metadata: Record<string, SourceMetadataValue> = {};
  if (context.options.sourceName) metadata.sourceName = context.options.sourceName;
  if (style.spotName) metadata.separationName = style.spotName;
  if (style.resourceName) metadata.colorSpaceResource = style.resourceName;
  if (context.xObjectStack.length > 0) metadata.xObjectPath = context.xObjectStack.join("/");
  metadata.lineWidthPt = style.lineWidthPt;
  const provenance = {
    sourceId: context.options.id,
    format: "pdf" as const,
    pageNumber: context.pageNumber,
    objectIndex,
    sourceUnits: "pt" as const,
    metadata,
  };
  return {
    id: entityId,
    operation,
    provenance,
    classification: {
      method: "style-map",
      sourceValue: style.spotName ?? style.resourceName ?? style.colorSpace,
      confidence: 1,
    },
    path: {
      id: `${entityId}-path`,
      segments: [...subpath.segments],
      closed: subpath.closed,
      transform: IDENTITY_AFFINE_MATRIX,
      provenance,
    },
  };
}

function resolvedColorSpace(
  resources: PDFDict | undefined,
  resourceName: string,
  context: ImportContext,
): RawStrokeStyle {
  const base: RawStrokeStyle = {
    colorSpace: "unknown",
    components: [],
    resourceName,
    lineWidthPt: 1,
  };
  const normalized = resourceName.toLowerCase();
  if (normalized === "devicegray" || normalized === "g") return { ...base, colorSpace: "gray", components: [0] };
  if (normalized === "devicergb" || normalized === "rgb") return { ...base, colorSpace: "rgb", components: [0, 0, 0] };
  if (normalized === "devicecmyk" || normalized === "cmyk") return { ...base, colorSpace: "cmyk", components: [0, 0, 0, 1] };

  const colorSpaces = resources ? resolveDict(context.pdf, resources.get(PDFName.of("ColorSpace"))) : undefined;
  const raw = colorSpaces ? resolveObject(context.pdf, colorSpaces.get(PDFName.of(resourceName))) : undefined;
  if (!(raw instanceof PDFArray) || raw.size() < 2) {
    throw new Error(`PDF color-space resource /${resourceName} is not a certifiable Separation color space.`);
  }
  const family = resolveObject(context.pdf, raw.get(0));
  const separation = resolveObject(context.pdf, raw.get(1));
  if (!(family instanceof PDFName) || nameText(family) !== "Separation" || !(separation instanceof PDFName)) {
    throw new Error(`PDF color-space resource /${resourceName} is not a named Separation.`);
  }
  return {
    ...base,
    colorSpace: "spot",
    components: [1],
    spotName: nameText(separation),
  };
}

function matrixFromPdfArray(pdf: PDFDocument, object: PDFObject | undefined): AffineMatrix {
  const resolved = resolveObject(pdf, object);
  if (!resolved) return IDENTITY_AFFINE_MATRIX;
  if (!(resolved instanceof PDFArray) || resolved.size() !== 6) {
    throw new Error("PDF Form XObject Matrix must contain exactly six numbers.");
  }
  const values = resolved.asArray().map((item) => Number(item.toString()));
  if (values.some((value) => !Number.isFinite(value))) throw new Error("PDF Form XObject Matrix contains a non-finite value.");
  return { a: values[0], b: values[1], c: values[2], d: values[3], e: values[4], f: values[5] };
}

function contentStreamsFromObject(pdf: PDFDocument, object: PDFObject | undefined): PDFRawStream[] {
  const resolved = resolveObject(pdf, object);
  if (!resolved) return [];
  if (resolved instanceof PDFRawStream) return [resolved];
  if (resolved instanceof PDFArray) {
    const streams: PDFRawStream[] = [];
    for (let index = 0; index < resolved.size(); index += 1) {
      const stream = resolveStream(pdf, resolved.get(index));
      if (!stream) throw new Error("PDF Contents array contains a non-stream object.");
      streams.push(stream);
    }
    return streams;
  }
  throw new Error("PDF Contents is neither a stream nor an array of streams.");
}

function popNumbers(operands: PdfToken[], count: number, operator: string): number[] {
  if (operands.length < count) throw new Error(`PDF ${operator} requires ${count} numeric operands.`);
  const selected = operands.splice(operands.length - count, count);
  if (selected.some((token) => token.kind !== "number")) throw new Error(`PDF ${operator} received a non-numeric operand.`);
  return selected.map((token) => finite((token as Extract<PdfToken, { kind: "number" }>).value, operator));
}

function popName(operands: PdfToken[], operator: string): string {
  const token = operands.pop();
  if (!token || token.kind !== "name") throw new Error(`PDF ${operator} requires a name operand.`);
  return token.value;
}

function strokePath(path: PathState, state: GraphicsState, context: ImportContext): void {
  const ignored = new Set(context.options.ignoredSpotNames ?? []);
  if (state.stroke.spotName && ignored.has(state.stroke.spotName)) return;
  const operation = classify(state.stroke, context.options.rules);
  for (const subpath of path.subpaths) {
    if (subpath.segments.length > 0) context.entities.push(createEntity(subpath, operation, state.stroke, context));
  }
}

function processContent(
  content: string,
  resources: PDFDict | undefined,
  initialState: GraphicsState,
  context: ImportContext,
): void {
  const tokens = tokenizeContent(content);
  const operands: PdfToken[] = [];
  const stateStack: GraphicsState[] = [];
  let state: GraphicsState = {
    ctm: { ...initialState.ctm },
    stroke: { ...initialState.stroke, components: [...initialState.stroke.components] },
  };
  let path = emptyPath();

  for (const token of tokens) {
    if (token.kind !== "operator") {
      operands.push(token);
      continue;
    }
    const operator = token.value;
    switch (operator) {
      case "q":
        stateStack.push({ ctm: { ...state.ctm }, stroke: { ...state.stroke, components: [...state.stroke.components] } });
        operands.length = 0;
        break;
      case "Q": {
        const restored = stateStack.pop();
        if (!restored) throw new Error("PDF graphics-state restore underflow in raw structural import.");
        state = restored;
        operands.length = 0;
        break;
      }
      case "cm": {
        const [a, b, c, d, e, f] = popNumbers(operands, 6, operator);
        state.ctm = multiplyAffine(state.ctm, { a, b, c, d, e, f });
        operands.length = 0;
        break;
      }
      case "w":
        state.stroke.lineWidthPt = popNumbers(operands, 1, operator)[0];
        operands.length = 0;
        break;
      case "CS": {
        const resourceName = popName(operands, operator);
        const resolved = resolvedColorSpace(resources, resourceName, context);
        state.stroke = { ...resolved, lineWidthPt: state.stroke.lineWidthPt };
        operands.length = 0;
        break;
      }
      case "G":
        state.stroke = { ...state.stroke, colorSpace: "gray", components: popNumbers(operands, 1, operator), spotName: undefined, resourceName: "DeviceGray" };
        operands.length = 0;
        break;
      case "RG":
        state.stroke = { ...state.stroke, colorSpace: "rgb", components: popNumbers(operands, 3, operator), spotName: undefined, resourceName: "DeviceRGB" };
        operands.length = 0;
        break;
      case "K":
        state.stroke = { ...state.stroke, colorSpace: "cmyk", components: popNumbers(operands, 4, operator), spotName: undefined, resourceName: "DeviceCMYK" };
        operands.length = 0;
        break;
      case "SC":
      case "SCN": {
        const numbers = operands.filter((operand): operand is Extract<PdfToken, { kind: "number" }> => operand.kind === "number").map((operand) => operand.value);
        if (numbers.length === 0) throw new Error(`PDF ${operator} has no numeric tint/color operands.`);
        state.stroke.components = numbers;
        operands.length = 0;
        break;
      }
      case "m": {
        const [x, y] = popNumbers(operands, 2, operator);
        startSubpath(path, rawPointToMm({ x, y }, state, context));
        operands.length = 0;
        break;
      }
      case "l": {
        const [x, y] = popNumbers(operands, 2, operator);
        appendLine(path, rawPointToMm({ x, y }, state, context));
        operands.length = 0;
        break;
      }
      case "c": {
        const [x1, y1, x2, y2, x3, y3] = popNumbers(operands, 6, operator);
        appendCubic(
          path,
          rawPointToMm({ x: x1, y: y1 }, state, context),
          rawPointToMm({ x: x2, y: y2 }, state, context),
          rawPointToMm({ x: x3, y: y3 }, state, context),
        );
        operands.length = 0;
        break;
      }
      case "v": {
        const active = requireActive(path, operator);
        const [x2, y2, x3, y3] = popNumbers(operands, 4, operator);
        appendCubic(
          path,
          active.current!,
          rawPointToMm({ x: x2, y: y2 }, state, context),
          rawPointToMm({ x: x3, y: y3 }, state, context),
        );
        operands.length = 0;
        break;
      }
      case "y": {
        const [x1, y1, x3, y3] = popNumbers(operands, 4, operator);
        const p3 = rawPointToMm({ x: x3, y: y3 }, state, context);
        appendCubic(path, rawPointToMm({ x: x1, y: y1 }, state, context), p3, p3);
        operands.length = 0;
        break;
      }
      case "h":
        closeSubpath(path);
        operands.length = 0;
        break;
      case "re": {
        const [x, y, width, height] = popNumbers(operands, 4, operator);
        const p0 = rawPointToMm({ x, y }, state, context);
        const p1 = rawPointToMm({ x: x + width, y }, state, context);
        const p2 = rawPointToMm({ x: x + width, y: y + height }, state, context);
        const p3 = rawPointToMm({ x, y: y + height }, state, context);
        startSubpath(path, p0);
        appendLine(path, p1);
        appendLine(path, p2);
        appendLine(path, p3);
        closeSubpath(path);
        operands.length = 0;
        break;
      }
      case "s":
      case "b":
      case "b*":
        if (path.active && !path.active.closed) closeSubpath(path);
        strokePath(path, state, context);
        path = emptyPath();
        operands.length = 0;
        break;
      case "S":
      case "B":
      case "B*":
        strokePath(path, state, context);
        path = emptyPath();
        operands.length = 0;
        break;
      case "Do": {
        if (path.subpaths.some((subpath) => subpath.segments.length > 0)) {
          throw new Error("PDF Form XObject invocation while a path is active is not certified.");
        }
        const xObjectName = popName(operands, operator);
        processXObject(xObjectName, resources, state, context);
        operands.length = 0;
        break;
      }
      default:
        if (FILL_ONLY.has(operator)) {
          if (operator === "n" || operator === "f" || operator === "F" || operator === "f*") path = emptyPath();
          operands.length = 0;
          break;
        }
        if (["M", "J", "j", "d", "ri", "i", "gs", "g", "rg", "k", "cs", "scn"].includes(operator)) {
          operands.length = 0;
          break;
        }
        if (STRUCTURAL_PAINT.has(operator)) throw new Error(`Unhandled structural PDF paint operator ${operator}.`);
        if (path.subpaths.some((subpath) => subpath.segments.length > 0)) {
          throw new Error(`Unsupported PDF operator ${operator} while structural path geometry is active.`);
        }
        operands.length = 0;
        break;
    }
  }
  if (stateStack.length !== 0) throw new Error("PDF graphics-state stack is unbalanced in structural content.");
  if (path.subpaths.some((subpath) => subpath.segments.length > 0)) {
    throw new Error("PDF structural content ends with an unpainted active path.");
  }
}

function processXObject(
  name: string,
  resources: PDFDict | undefined,
  parentState: GraphicsState,
  context: ImportContext,
): void {
  if (!resources) throw new Error(`PDF XObject /${name} has no resource dictionary in scope.`);
  const xObjects = resolveDict(context.pdf, resources.get(PDFName.of("XObject")));
  if (!xObjects) throw new Error(`PDF resources contain no XObject dictionary for /${name}.`);
  const stream = resolveStream(context.pdf, xObjects.get(PDFName.of(name)));
  if (!stream) throw new Error(`PDF XObject /${name} is not a raw stream.`);
  const subtype = resolveObject(context.pdf, stream.dict.get(PDFName.of("Subtype")));
  if (!(subtype instanceof PDFName) || nameText(subtype) !== "Form") {
    throw new Error(`PDF XObject /${name} is not a Form XObject and cannot be structural authority.`);
  }
  if (context.xObjectStack.includes(name)) throw new Error(`Recursive PDF Form XObject cycle detected at /${name}.`);
  const formResources = resolveDict(context.pdf, stream.dict.get(PDFName.of("Resources"))) ?? resources;
  const formMatrix = matrixFromPdfArray(context.pdf, stream.dict.get(PDFName.of("Matrix")));
  context.xObjectStack.push(name);
  try {
    processContent(
      decodeStream(stream),
      formResources,
      {
        ctm: multiplyAffine(parentState.ctm, formMatrix),
        stroke: { ...parentState.stroke, components: [...parentState.stroke.components] },
      },
      context,
    );
  } finally {
    context.xObjectStack.pop();
  }
}

export async function importVectorPdfRawAuthority(
  bytes: Uint8Array,
  options: RawPdfImportOptions,
): Promise<CanonicalDieline> {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0) throw new Error("Raw vector PDF import requires non-empty bytes.");
  if (options.rules.length === 0) throw new Error("Raw vector PDF import requires explicit structural semantic rules.");
  const pdf = await PDFDocument.load(bytes, { updateMetadata: false });
  const pageNumber = options.pageNumber ?? 1;
  if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > pdf.getPageCount()) {
    throw new RangeError(`PDF page ${pageNumber} is outside the document.`);
  }
  const page = pdf.getPage(pageNumber - 1);
  if (page.getRotation().angle % 360 !== 0) throw new Error("Rotated PDF pages are not yet certified for raw structural authority.");
  const mediaBox = page.getMediaBox();
  if (![mediaBox.x, mediaBox.y, mediaBox.width, mediaBox.height].every(Number.isFinite) || mediaBox.width <= 0 || mediaBox.height <= 0) {
    throw new Error("PDF MediaBox must be finite and positive.");
  }
  const resources = page.node.Resources();
  const contents = page.node.Contents();
  const streams = contentStreamsFromObject(pdf, contents);
  if (streams.length === 0) throw new Error("PDF page contains no content stream.");

  const context: ImportContext = {
    pdf,
    options,
    pageNumber,
    mediaBox,
    entities: [],
    objectIndex: 0,
    xObjectStack: [],
  };
  const initialState: GraphicsState = {
    ctm: { ...IDENTITY_AFFINE_MATRIX },
    stroke: { colorSpace: "unknown", components: [], lineWidthPt: 1 },
  };
  for (const stream of streams) processContent(decodeStream(stream), resources, initialState, context);
  if (context.entities.length === 0) throw new Error("PDF page produced no explicitly classified structural authority.");

  return {
    schemaVersion: 2,
    id: options.id,
    units: "mm",
    coordinateSystem: "x-right-y-down",
    widthMm: mediaBox.width * POINTS_TO_MM,
    heightMm: mediaBox.height * POINTS_TO_MM,
    source: {
      id: options.id,
      format: "pdf",
      sourceUnits: "pt",
      name: options.sourceName,
      sha256: options.sourceSha256,
      metadata: options.metadata,
    },
    tolerances: DEFAULT_STRUCTURAL_TOLERANCES,
    entities: context.entities,
    metadata: options.metadata,
  };
}
