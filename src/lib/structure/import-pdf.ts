import type {
  AffineMatrix,
  CanonicalDieline,
  SourceMetadataValue,
  StructuralEntity,
  StructuralOperation,
  Vec2,
  VectorPath,
  VectorSegment,
} from "./vector-domain";
import {
  DEFAULT_STRUCTURAL_TOLERANCES,
  IDENTITY_AFFINE_MATRIX,
} from "./vector-domain";
import { applyAffine, multiplyAffine } from "./vector-math";

const POINTS_TO_MM = 25.4 / 72;

export type PdfStrokeStyle = Readonly<{
  colorSpace: "gray" | "rgb" | "cmyk" | "spot" | "unknown";
  components: readonly number[];
  spotName?: string;
  lineWidthPt: number;
}>;

export type PdfSemanticRule = Readonly<{
  operation: StructuralOperation;
  spotName?: string;
  colorSpace?: PdfStrokeStyle["colorSpace"];
  components?: readonly number[];
  tolerance?: number;
}>;

export type PdfImportOptions = Readonly<{
  id: string;
  sourceName?: string;
  sourceSha256?: string;
  rules: readonly PdfSemanticRule[];
  pageNumber?: number;
  metadata?: Readonly<Record<string, SourceMetadataValue>>;
}>;

export type NormalizedPdfOperator = Readonly<{
  name: string;
  args: readonly unknown[];
}>;

export type PdfOperatorPage = Readonly<{
  widthPt: number;
  heightPt: number;
  originXPt?: number;
  originYPt?: number;
  userUnit?: number;
  rotate?: number;
  operators: readonly NormalizedPdfOperator[];
}>;

type PathState = {
  segments: VectorSegment[];
  start: Vec2 | null;
  current: Vec2 | null;
  closed: boolean;
};

function finiteNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number.`);
  }
  return value;
}

function closeEnough(a: readonly number[], b: readonly number[], tolerance: number): boolean {
  return a.length === b.length && a.every((value, index) => Math.abs(value - b[index]) <= tolerance);
}

function classifyStroke(style: PdfStrokeStyle, rules: readonly PdfSemanticRule[]): StructuralOperation {
  const matches = rules.filter((rule) => {
    const tolerance = rule.tolerance ?? 1e-6;
    if (rule.spotName !== undefined && rule.spotName !== style.spotName) return false;
    if (rule.colorSpace !== undefined && rule.colorSpace !== style.colorSpace) return false;
    if (rule.components !== undefined && !closeEnough(rule.components, style.components, tolerance)) return false;
    return true;
  });
  if (matches.length !== 1) {
    throw new Error(
      matches.length === 0
        ? `PDF stroke has no explicit structural classification (${style.colorSpace} ${style.components.join(",")}${style.spotName ? ` ${style.spotName}` : ""}).`
        : "PDF stroke matches multiple structural classification rules.",
    );
  }
  return matches[0].operation;
}

function sourcePointToMm(point: Vec2, page: PdfOperatorPage): Vec2 {
  const userUnit = page.userUnit ?? 1;
  if (!Number.isFinite(userUnit) || userUnit <= 0) {
    throw new Error("PDF UserUnit must be finite and positive.");
  }
  const originXPt = page.originXPt ?? 0;
  const originYPt = page.originYPt ?? 0;
  return {
    x: (point.x - originXPt) * userUnit * POINTS_TO_MM,
    y: (originYPt + page.heightPt - point.y) * userUnit * POINTS_TO_MM,
  };
}

function transformedPoint(x: number, y: number, ctm: AffineMatrix, page: PdfOperatorPage): Vec2 {
  return sourcePointToMm(applyAffine(ctm, { x, y }), page);
}

function emptyPath(): PathState {
  return { segments: [], start: null, current: null, closed: false };
}

function line(path: PathState, point: Vec2): void {
  if (!path.current) throw new Error("PDF lineTo appears before moveTo.");
  path.segments.push({ kind: "line", start: path.current, end: point });
  path.current = point;
}

function cubic(path: PathState, p1: Vec2, p2: Vec2, p3: Vec2): void {
  if (!path.current) throw new Error("PDF curve appears before moveTo.");
  path.segments.push({ kind: "cubic", p0: path.current, p1, p2, p3 });
  path.current = p3;
}

function close(path: PathState): void {
  if (!path.current || !path.start) {
    throw new Error("PDF closePath appears without an active subpath.");
  }
  const dx = path.current.x - path.start.x;
  const dy = path.current.y - path.start.y;
  if (Math.hypot(dx, dy) > DEFAULT_STRUCTURAL_TOLERANCES.coordinateEpsilonMm) {
    path.segments.push({ kind: "line", start: path.current, end: path.start });
  }
  path.current = path.start;
  path.closed = true;
}

function pathFromState(
  state: PathState,
  id: string,
  pageNumber: number,
  operation: StructuralOperation,
  objectIndex: number,
  sourceId: string,
  sourceName?: string,
): StructuralEntity {
  if (state.segments.length === 0) {
    throw new Error("Cannot stroke an empty PDF structural path.");
  }
  const provenance = {
    sourceId,
    format: "pdf" as const,
    pageNumber,
    objectIndex,
    sourceUnits: "pt" as const,
    metadata: sourceName ? { sourceName } : undefined,
  };
  const vectorPath: VectorPath = {
    id,
    segments: [...state.segments],
    closed: state.closed,
    transform: IDENTITY_AFFINE_MATRIX,
    provenance,
  };
  return {
    id,
    operation,
    path: vectorPath,
    provenance,
    classification: { method: "style-map", sourceValue: operation, confidence: 1 },
  };
}

function parseConstructPath(
  state: PathState,
  args: readonly unknown[],
  ctm: AffineMatrix,
  page: PdfOperatorPage,
  nestedName: (value: unknown) => string,
): void {
  const operations = Array.isArray(args[0]) ? args[0] : null;
  const coordinates = Array.isArray(args[1]) ? args[1] : null;
  if (!operations || !coordinates) {
    throw new Error("Unsupported PDF constructPath payload.");
  }
  let cursor = 0;
  for (const rawOperation of operations) {
    const operation = nestedName(rawOperation);
    switch (operation) {
      case "moveTo": {
        const point = transformedPoint(
          finiteNumber(coordinates[cursor++], "PDF moveTo x"),
          finiteNumber(coordinates[cursor++], "PDF moveTo y"),
          ctm,
          page,
        );
        if (state.segments.length > 0 && state.current && state.start) {
          throw new Error(
            "Multiple PDF subpaths in one paint operation are not yet certified; split them before import.",
          );
        }
        state.start = point;
        state.current = point;
        state.closed = false;
        break;
      }
      case "lineTo":
        line(
          state,
          transformedPoint(
            finiteNumber(coordinates[cursor++], "PDF lineTo x"),
            finiteNumber(coordinates[cursor++], "PDF lineTo y"),
            ctm,
            page,
          ),
        );
        break;
      case "curveTo": {
        const p1 = transformedPoint(
          finiteNumber(coordinates[cursor++], "curve x1"),
          finiteNumber(coordinates[cursor++], "curve y1"),
          ctm,
          page,
        );
        const p2 = transformedPoint(
          finiteNumber(coordinates[cursor++], "curve x2"),
          finiteNumber(coordinates[cursor++], "curve y2"),
          ctm,
          page,
        );
        const p3 = transformedPoint(
          finiteNumber(coordinates[cursor++], "curve x3"),
          finiteNumber(coordinates[cursor++], "curve y3"),
          ctm,
          page,
        );
        cubic(path, p1, p2, p3);
        break;
      }
      case "curveTo2": {
        if (!state.current) throw new Error("PDF curveTo2 appears before moveTo.");
        const p2 = transformedPoint(
          finiteNumber(coordinates[cursor++], "curveTo2 x2"),
          finiteNumber(coordinates[cursor++], "curveTo2 y2"),
          ctm,
          page,
        );
        const p3 = transformedPoint(
          finiteNumber(coordinates[cursor++], "curveTo2 x3"),
          finiteNumber(coordinates[cursor++], "curveTo2 y3"),
          ctm,
          page,
        );
        cubic(path, state.current, p2, p3);
        break;
      }
      case "curveTo3": {
        if (!state.current) throw new Error("PDF curveTo3 appears before moveTo.");
        const p1 = transformedPoint(
          finiteNumber(coordinates[cursor++], "curveTo3 x1"),
          finiteNumber(coordinates[cursor++], "curveTo3 y1"),
          ctm,
          page,
        );
        const p3 = transformedPoint(
          finiteNumber(coordinates[cursor++], "curveTo3 x3"),
          finiteNumber(coordinates[cursor++], "curveTo3 y3"),
          ctm,
          page,
        );
        cubic(path, p1, p3, p3);
        break;
      }
      case "rectangle": {
        const x = finiteNumber(coordinates[cursor++], "rectangle x");
        const y = finiteNumber(coordinates[cursor++], "rectangle y");
        const width = finiteNumber(coordinates[cursor++], "rectangle width");
        const height = finiteNumber(coordinates[cursor++], "rectangle height");
        if (state.segments.length > 0) {
          throw new Error("Multiple PDF subpaths in one paint operation are not certified.");
        }
        const points = [
          transformedPoint(x, y, ctm, page),
          transformedPoint(x + width, y, ctm, page),
          transformedPoint(x + width, y + height, ctm, page),
          transformedPoint(x, y + height, ctm, page),
        ];
        state.start = points[0];
        state.current = points[0];
        line(state, points[1]);
        line(state, points[2]);
        line(state, points[3]);
        close(state);
        break;
      }
      case "closePath":
        close(state);
        break;
      default:
        throw new Error(`Unsupported PDF path operator ${operation}.`);
    }
  }
  if (cursor !== coordinates.length && coordinates.length - cursor !== 4) {
    throw new Error("PDF constructPath coordinate arity is ambiguous.");
  }
}

function normalizeColorSpaceName(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    for (const candidate of value) {
      const nested = normalizeColorSpaceName(candidate);
      if (nested) return nested;
    }
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const key of ["name", "id", "colorSpace", "colorSpaceName"]) {
      if (typeof record[key] === "string") return record[key] as string;
    }
  }
  return null;
}

function styleForColorSpace(
  previous: PdfStrokeStyle,
  rawName: unknown,
): PdfStrokeStyle {
  const name = normalizeColorSpaceName(rawName);
  if (!name) {
    throw new Error("PDF stroking color space does not expose a certifiable name.");
  }
  const normalized = name.replace(/^\//, "").toLowerCase();
  if (normalized === "devicegray" || normalized === "g") {
    return { ...previous, colorSpace: "gray", components: [0], spotName: undefined };
  }
  if (normalized === "devicergb" || normalized === "rgb") {
    return { ...previous, colorSpace: "rgb", components: [0, 0, 0], spotName: undefined };
  }
  if (normalized === "devicecmyk" || normalized === "cmyk") {
    return { ...previous, colorSpace: "cmyk", components: [0, 0, 0, 1], spotName: undefined };
  }
  if (normalized === "pattern") {
    throw new Error("Pattern stroking color spaces are not certified as structural authority.");
  }
  // A named resource such as DieCutBlue/DieCutRed/Bleed is treated as a spot
  // identity only because the import contract still requires an explicit rule
  // for that exact name before a stroked path can become structural geometry.
  return { ...previous, colorSpace: "spot", components: [1], spotName: name.replace(/^\//, "") };
}

export function importVectorPdfOperatorPage(
  page: PdfOperatorPage,
  options: PdfImportOptions,
): CanonicalDieline {
  if (
    !Number.isFinite(page.widthPt) ||
    page.widthPt <= 0 ||
    !Number.isFinite(page.heightPt) ||
    page.heightPt <= 0
  ) {
    throw new Error("PDF page dimensions must be finite and positive.");
  }
  if ((page.rotate ?? 0) % 360 !== 0) {
    throw new Error("Rotated PDF pages are not yet certified for structural import.");
  }
  if (options.rules.length === 0) {
    throw new Error("PDF structural import requires explicit semantic classification rules.");
  }

  const pageNumber = options.pageNumber ?? 1;
  let ctm: AffineMatrix = IDENTITY_AFFINE_MATRIX;
  const ctmStack: AffineMatrix[] = [];
  let style: PdfStrokeStyle = { colorSpace: "unknown", components: [], lineWidthPt: 1 };
  let path = emptyPath();
  const entities: StructuralEntity[] = [];
  let objectIndex = 0;

  const nestedName = (value: unknown) => {
    if (typeof value === "string") return value;
    throw new Error("Nested PDF path operator must be normalized to a name before import.");
  };

  const strokeCurrentPath = () => {
    const operation = classifyStroke(style, options.rules);
    const currentObjectIndex = objectIndex;
    objectIndex += 1;
    entities.push(
      pathFromState(
        path,
        `pdf-p${pageNumber}-o${currentObjectIndex}`,
        pageNumber,
        operation,
        currentObjectIndex,
        options.id,
        options.sourceName,
      ),
    );
    path = emptyPath();
  };

  for (const operator of page.operators) {
    switch (operator.name) {
      case "save":
        ctmStack.push(ctm);
        break;
      case "restore": {
        const restored = ctmStack.pop();
        if (!restored) throw new Error("PDF graphics-state restore underflow.");
        ctm = restored;
        break;
      }
      case "transform": {
        if (operator.args.length < 6) throw new Error("PDF transform requires six numbers.");
        const matrix: AffineMatrix = {
          a: finiteNumber(operator.args[0], "PDF transform a"),
          b: finiteNumber(operator.args[1], "PDF transform b"),
          c: finiteNumber(operator.args[2], "PDF transform c"),
          d: finiteNumber(operator.args[3], "PDF transform d"),
          e: finiteNumber(operator.args[4], "PDF transform e"),
          f: finiteNumber(operator.args[5], "PDF transform f"),
        };
        ctm = multiplyAffine(ctm, matrix);
        break;
      }
      case "setLineWidth":
        style = { ...style, lineWidthPt: finiteNumber(operator.args[0], "PDF line width") };
        break;
      case "setStrokeColorSpace":
        style = styleForColorSpace(style, operator.args[0]);
        break;
      case "setStrokeGray":
        style = {
          ...style,
          colorSpace: "gray",
          components: [finiteNumber(operator.args[0], "PDF gray")],
          spotName: undefined,
        };
        break;
      case "setStrokeRGBColor":
        style = {
          ...style,
          colorSpace: "rgb",
          components: [0, 1, 2].map((index) =>
            finiteNumber(operator.args[index], `PDF RGB ${index}`),
          ),
          spotName: undefined,
        };
        break;
      case "setStrokeCMYKColor":
        style = {
          ...style,
          colorSpace: "cmyk",
          components: [0, 1, 2, 3].map((index) =>
            finiteNumber(operator.args[index], `PDF CMYK ${index}`),
          ),
          spotName: undefined,
        };
        break;
      case "setStrokeColor":
      case "setStrokeColorN": {
        const embeddedName = operator.args.find((value) => typeof value === "string");
        const components = operator.args.filter(
          (value): value is number => typeof value === "number" && Number.isFinite(value),
        );
        if (embeddedName && style.colorSpace !== "spot") {
          style = { ...style, colorSpace: "spot", spotName: embeddedName, components };
          break;
        }
        if (style.colorSpace === "spot") {
          if (!style.spotName) {
            throw new Error("PDF spot stroke has no certifiable separation name.");
          }
          if (components.length === 0) {
            throw new Error(`PDF spot stroke ${style.spotName} has no tint components.`);
          }
          style = { ...style, components };
          break;
        }
        const expectedComponents = style.colorSpace === "gray" ? 1 : style.colorSpace === "rgb" ? 3 : style.colorSpace === "cmyk" ? 4 : 0;
        if (expectedComponents === 0 || components.length !== expectedComponents) {
          throw new Error("PDF generic stroke color cannot be certified for the active color space.");
        }
        style = { ...style, components };
        break;
      }
      case "constructPath":
        parseConstructPath(path, operator.args, ctm, page, nestedName);
        break;
      case "stroke":
      case "closeStroke":
        if (operator.name === "closeStroke" && path.start && path.current && !path.closed) {
          close(path);
        }
        strokeCurrentPath();
        break;
      case "fillStroke":
      case "eoFillStroke":
      case "closeFillStroke":
      case "closeEOFillStroke":
        if (operator.name.startsWith("close") && path.start && path.current && !path.closed) {
          close(path);
        }
        strokeCurrentPath();
        break;
      case "endPath":
        path = emptyPath();
        break;
      case "fill":
      case "eoFill":
      case "setFillColorSpace":
      case "setFillColor":
      case "setFillRGBColor":
      case "setFillGray":
      case "setFillCMYKColor":
      case "setFillColorN":
        break;
      default:
        if (path.segments.length > 0) {
          throw new Error(`Unsupported PDF operator ${operator.name} while a structural path is active.`);
        }
        break;
    }
  }
  if (ctmStack.length !== 0) {
    throw new Error("PDF graphics-state save/restore stack is unbalanced.");
  }
  if (entities.length === 0) {
    throw new Error("PDF page contains no explicitly classified stroked structural geometry.");
  }

  const userUnit = page.userUnit ?? 1;
  return {
    schemaVersion: 2,
    id: options.id,
    units: "mm",
    coordinateSystem: "x-right-y-down",
    widthMm: page.widthPt * userUnit * POINTS_TO_MM,
    heightMm: page.heightPt * userUnit * POINTS_TO_MM,
    source: {
      id: options.id,
      format: "pdf",
      sourceUnits: "pt",
      name: options.sourceName,
      sha256: options.sourceSha256,
      metadata: options.metadata,
    },
    tolerances: DEFAULT_STRUCTURAL_TOLERANCES,
    entities,
    metadata: options.metadata,
  };
}

export async function importVectorPdf(
  bytes: Uint8Array,
  options: PdfImportOptions,
): Promise<CanonicalDieline> {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0) {
    throw new Error("Vector PDF import requires non-empty bytes.");
  }
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const loadingTask = pdfjs.getDocument({ data: bytes, useWorkerFetch: false });
  const document = await loadingTask.promise;
  try {
    const pageNumber = options.pageNumber ?? 1;
    if (pageNumber < 1 || pageNumber > document.numPages) {
      throw new RangeError(`PDF page ${pageNumber} is outside the document.`);
    }
    const page = await document.getPage(pageNumber);
    if (page.rotate % 360 !== 0) {
      throw new Error("Rotated PDF pages are not yet certified for structural import.");
    }
    const operatorList = await page.getOperatorList();
    const opNames = new Map<number, string>();
    for (const [name, value] of Object.entries(pdfjs.OPS)) {
      if (typeof value === "number") opNames.set(value, name);
    }
    const normalizeName = (value: unknown) => {
      if (typeof value === "string") return value;
      if (typeof value === "number") {
        const name = opNames.get(value);
        if (name) return name;
      }
      throw new Error(`Unknown pdf.js operator ${String(value)}.`);
    };
    const operators: NormalizedPdfOperator[] = operatorList.fnArray.map(
      (fn: number, index: number) => {
        const name = normalizeName(fn);
        const rawArgs = operatorList.argsArray[index] ?? [];
        if (name === "constructPath" && Array.isArray(rawArgs[0])) {
          const nested = rawArgs[0].map((nestedFn: unknown) => normalizeName(nestedFn));
          return { name, args: [nested, rawArgs[1], ...rawArgs.slice(2)] };
        }
        return { name, args: rawArgs };
      },
    );
    const view = page.view;
    return importVectorPdfOperatorPage(
      {
        originXPt: view[0],
        originYPt: view[1],
        widthPt: Math.abs(view[2] - view[0]),
        heightPt: Math.abs(view[3] - view[1]),
        userUnit: page.userUnit,
        rotate: page.rotate,
        operators,
      },
      options,
    );
  } finally {
    await loadingTask.destroy();
  }
}
