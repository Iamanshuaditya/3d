import { SaxesParser, type SaxesTagNS } from "saxes";
import {
  IDENTITY_AFFINE_MATRIX,
  type AffineMatrix,
  type ArcSegment,
  type CanonicalDieline,
  type CanonicalDielineSource,
  type CubicBezierSegment,
  type EllipticalArcSegment,
  type OperationClassification,
  type QuadraticBezierSegment,
  type SourceMetadataValue,
  type SourceProvenance,
  type StructuralEntity,
  type StructuralOperation,
  type SourceUnit,
  type Vec2,
  type VectorPath,
  type VectorSegment,
} from "./vector-domain";
import {
  affineScale,
  affineTranslation,
  multiplyAffine,
} from "./vector-math";
import {
  assertCanonicalDieline,
  createStructuralTolerances,
  isStructuralOperation,
} from "./vector-validation";

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
const INKSCAPE_NAMESPACE = "http://www.inkscape.org/namespaces/inkscape";
const DEFAULT_DPI = 96;
const TAU = Math.PI * 2;

export type SvgImportIssue = Readonly<{
  severity: "warning" | "error";
  code: string;
  message: string;
  elementId?: string;
}>;

export type SvgOperationMapping = Readonly<{
  /** Exact, case-insensitive layer label or group id to semantic operation. */
  layers?: Readonly<Record<string, StructuralOperation>>;
  /** Exact element id to semantic operation. */
  ids?: Readonly<Record<string, StructuralOperation>>;
  /** Normalized CSS stroke value to semantic operation. Import aid only. */
  strokes?: Readonly<Record<string, StructuralOperation>>;
  /** Used only when no explicit/layer/id/style rule matched. */
  defaultOperation?: StructuralOperation;
}>;

export type ImportStructuralSvgOptions = Readonly<{
  id: string;
  sourceId?: string;
  sourceName?: string;
  sourceUri?: string;
  sourceSha256?: string;
  dpi?: number;
  operationMapping?: SvgOperationMapping;
  /** Reject unclassified geometry instead of reporting and skipping it. */
  strict?: boolean;
  topologySnapMm?: number;
  curveFlatteningMm?: number;
}>;

export type SvgImportResult = Readonly<{
  dieline: CanonicalDieline;
  issues: readonly SvgImportIssue[];
}>;

type SvgStyle = Readonly<{
  stroke?: string;
  fill?: string;
  display?: string;
  visibility?: string;
  operation?: string;
  clipPath?: string;
  mask?: string;
  overflow?: string;
}>;

type ElementFrame = Readonly<{
  transform: AffineMatrix;
  sourceTransform: AffineMatrix;
  style: SvgStyle;
  layerName?: string;
  ignored: boolean;
  displayNone: boolean;
  authorityBlock?: string;
}>;

type RootGeometry = Readonly<{
  widthMm: number;
  heightMm: number;
  userToMillimetres: AffineMatrix;
  sourceUnits: SourceUnit;
}>;

type MutableSubpath = {
  segments: VectorSegment[];
  start: Vec2;
  current: Vec2;
  closed: boolean;
};

type ParsedSubpath = Readonly<{
  segments: readonly VectorSegment[];
  closed: boolean;
}>;

type PathToken = Readonly<{ kind: "command"; value: string } | { kind: "number"; value: number }>;

function normalizedLookup<T>(
  record: Readonly<Record<string, T>> | undefined,
  key: string,
  normalizeKey: (value: string) => string = (value) => value.trim().toLowerCase(),
) {
  if (!record) return undefined;
  const normalized = normalizeKey(key);
  return Object.entries(record).find(([candidate]) => normalizeKey(candidate) === normalized)?.[1];
}

function finite(value: number, label: string): number {
  if (!Number.isFinite(value)) throw new Error(`${label} must be finite`);
  return value;
}

function lengthToMillimetres(raw: string, dpi: number): number {
  const match = raw.trim().match(
    /^([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)\s*(mm|cm|m|in|pt|pc|px|q)?$/i,
  );
  if (!match) throw new Error(`Unsupported SVG length "${raw}"`);
  const value = finite(Number(match[1]), "SVG length");
  const unit = (match[2] ?? "px").toLowerCase();
  switch (unit) {
    case "mm":
      return value;
    case "cm":
      return value * 10;
    case "m":
      return value * 1000;
    case "in":
      return value * 25.4;
    case "pt":
      return (value * 25.4) / 72;
    case "pc":
      return (value * 25.4) / 6;
    case "q":
      return value * 0.25;
    case "px":
      return (value * 25.4) / dpi;
    default:
      throw new Error(`Unsupported SVG length unit "${unit}"`);
  }
}

function parseViewBox(raw: string | undefined): readonly [number, number, number, number] | null {
  if (!raw) return null;
  const values = raw.trim().split(/[\s,]+/).filter(Boolean).map(Number);
  if (values.length !== 4 || values.some((value) => !Number.isFinite(value))) {
    throw new Error("SVG viewBox must contain four finite numbers");
  }
  if (values[2] <= 0 || values[3] <= 0) throw new Error("SVG viewBox dimensions must be positive");
  return values as [number, number, number, number];
}

function rootGeometry(attributes: Record<string, string>, dpi: number): RootGeometry {
  const viewBox = parseViewBox(attributes.viewBox ?? attributes.viewbox);
  const rawWidth = attributes.width;
  const rawHeight = attributes.height;
  if (!rawWidth || !rawHeight) {
    throw new Error(
      "Structural SVG requires explicit width and height; a viewBox alone has no authoritative physical scale",
    );
  }
  const widthMm = lengthToMillimetres(rawWidth, dpi);
  const heightMm = lengthToMillimetres(rawHeight, dpi);
  if (widthMm <= 0 || heightMm <= 0) throw new Error("SVG physical dimensions must be positive");

  if (!viewBox) {
    const userMm = 25.4 / dpi;
    return {
      widthMm,
      heightMm,
      userToMillimetres: affineScale(userMm),
      sourceUnits: "px",
    };
  }

  const [minX, minY, viewWidth, viewHeight] = viewBox;
  const aspectTokens = (attributes.preserveAspectRatio ?? "xMidYMid meet").trim().split(/\s+/);
  if (aspectTokens[0] === "defer") aspectTokens.shift();
  const [alignment = "xMidYMid", meetOrSlice = "meet", ...unexpectedAspectTokens] = aspectTokens;
  const validAlignments = [
    "none",
    "xMinYMin", "xMidYMin", "xMaxYMin",
    "xMinYMid", "xMidYMid", "xMaxYMid",
    "xMinYMax", "xMidYMax", "xMaxYMax",
  ];
  if (
    !validAlignments.includes(alignment) ||
    !["meet", "slice"].includes(meetOrSlice) ||
    unexpectedAspectTokens.length > 0
  ) {
    throw new Error(`Unsupported SVG preserveAspectRatio value "${attributes.preserveAspectRatio}"`);
  }
  const scaleX = widthMm / viewWidth;
  const scaleY = heightMm / viewHeight;
  let sx = scaleX;
  let sy = scaleY;
  let offsetX = 0;
  let offsetY = 0;

  if (alignment !== "none") {
    const uniform = meetOrSlice === "slice" ? Math.max(scaleX, scaleY) : Math.min(scaleX, scaleY);
    sx = sy = uniform;
    const extraX = widthMm - viewWidth * uniform;
    const extraY = heightMm - viewHeight * uniform;
    offsetX = alignment.includes("xMax") ? extraX : alignment.includes("xMid") ? extraX / 2 : 0;
    offsetY = alignment.includes("YMax") ? extraY : alignment.includes("YMid") ? extraY / 2 : 0;
  }

  return {
    widthMm,
    heightMm,
    userToMillimetres: {
      a: sx,
      b: 0,
      c: 0,
      d: sy,
      e: offsetX - minX * sx,
      f: offsetY - minY * sy,
    },
    sourceUnits: "unitless",
  };
}

function parseTransform(raw: string | undefined): AffineMatrix {
  if (!raw?.trim()) return IDENTITY_AFFINE_MATRIX;
  const functionPattern = /([a-zA-Z]+)\s*\(([^)]*)\)/g;
  let matrix = IDENTITY_AFFINE_MATRIX;
  let match: RegExpExecArray | null;
  let consumed = "";
  while ((match = functionPattern.exec(raw))) {
    consumed += match[0];
    const name = match[1].toLowerCase();
    const values = match[2].trim().split(/[\s,]+/).filter(Boolean).map(Number);
    if (values.some((value) => !Number.isFinite(value))) {
      throw new Error(`Invalid SVG ${name} transform`);
    }
    let next: AffineMatrix;
    switch (name) {
      case "matrix":
        if (values.length !== 6) throw new Error("SVG matrix() requires six values");
        next = { a: values[0], b: values[1], c: values[2], d: values[3], e: values[4], f: values[5] };
        break;
      case "translate":
        if (values.length < 1 || values.length > 2) throw new Error("SVG translate() requires one or two values");
        next = affineTranslation(values[0], values[1] ?? 0);
        break;
      case "scale":
        if (values.length < 1 || values.length > 2) throw new Error("SVG scale() requires one or two values");
        next = affineScale(values[0], values[1] ?? values[0]);
        break;
      case "rotate": {
        if (values.length !== 1 && values.length !== 3) throw new Error("SVG rotate() requires one or three values");
        const angle = (values[0] * Math.PI) / 180;
        const cosine = Math.cos(angle);
        const sine = Math.sin(angle);
        const rotation: AffineMatrix = { a: cosine, b: sine, c: -sine, d: cosine, e: 0, f: 0 };
        next = values.length === 1
          ? rotation
          : multiplyAffine(
              affineTranslation(values[1], values[2]),
              multiplyAffine(rotation, affineTranslation(-values[1], -values[2])),
            );
        break;
      }
      case "skewx": {
        if (values.length !== 1) throw new Error("SVG skewX() requires one value");
        next = { a: 1, b: 0, c: Math.tan((values[0] * Math.PI) / 180), d: 1, e: 0, f: 0 };
        break;
      }
      case "skewy": {
        if (values.length !== 1) throw new Error("SVG skewY() requires one value");
        next = { a: 1, b: Math.tan((values[0] * Math.PI) / 180), c: 0, d: 1, e: 0, f: 0 };
        break;
      }
      default:
        throw new Error(`Unsupported SVG transform ${name}()`);
    }
    // SVG transform lists are matrix-post-multiplied: the rightmost function
    // acts on local coordinates first.
    matrix = multiplyAffine(matrix, next);
  }
  if (!consumed || raw.replace(functionPattern, "").replace(/[\s,]/g, "") !== "") {
    throw new Error(`Malformed SVG transform "${raw}"`);
  }
  return matrix;
}

function parseInlineStyle(raw: string | undefined): Record<string, string> {
  if (!raw) return {};
  if (raw.includes("/*") || raw.includes("*/")) {
    throw new Error("CSS comments are not supported in structural SVG inline styles");
  }
  const declarations = new Map<string, { value: string; important: boolean }>();
  for (const rawEntry of raw.split(";")) {
    const entry = rawEntry.trim();
    if (!entry) continue;
    const colon = entry.indexOf(":");
    if (colon <= 0) throw new Error(`Malformed SVG inline style declaration "${entry}"`);
    const name = entry.slice(0, colon).trim().toLowerCase();
    if (!name || name.includes("\\")) {
      throw new Error(`Unsupported SVG inline style property "${name}"`);
    }
    let value = entry.slice(colon + 1).trim();
    const importantMatch = value.match(/\s*!important\s*$/i);
    const important = Boolean(importantMatch);
    if (importantMatch) value = value.slice(0, importantMatch.index).trim();
    if (/!\s*important/i.test(value)) {
      throw new Error(`Malformed !important priority for SVG inline style property "${name}"`);
    }
    const previous = declarations.get(name);
    if (!previous || important || !previous.important) {
      declarations.set(name, { value, important });
    }
  }
  return Object.fromEntries(
    Array.from(declarations, ([name, declaration]) => [name, declaration.value]),
  );
}

const CSS_GEOMETRY_OR_ACTIVE_PROPERTIES = new Set([
  "animation",
  "animation-name",
  "clip",
  "cx",
  "cy",
  "d",
  "height",
  "offset-anchor",
  "offset-distance",
  "offset-path",
  "offset-position",
  "offset-rotate",
  "path",
  "points",
  "r",
  "rotate",
  "rx",
  "ry",
  "scale",
  "transform",
  "transform-box",
  "transform-origin",
  "transition",
  "translate",
  "width",
  "x",
  "x1",
  "x2",
  "y",
  "y1",
  "y2",
]);

function unsupportedInlineCssReason(inline: Readonly<Record<string, string>>): string | undefined {
  const property = Object.keys(inline).find(
    (name) =>
      CSS_GEOMETRY_OR_ACTIVE_PROPERTIES.has(name) ||
      name.startsWith("animation-") ||
      name.startsWith("transition-") ||
      name === "overflow-x" ||
      name === "overflow-y",
  );
  return property
    ? `CSS property "${property}" can alter structural geometry and is not supported`
    : undefined;
}

function resolveVisibility(value: string | undefined, inherited: string | undefined): string | undefined {
  if (value === undefined) return inherited;
  const normalized = value.trim().toLowerCase();
  if (normalized === "inherit" || normalized === "unset") return inherited;
  if (normalized === "initial") return "visible";
  if (["visible", "hidden", "collapse"].includes(normalized)) return normalized;
  throw new Error(`Unsupported SVG visibility value "${value}"`);
}

function resolveDisplay(value: string | undefined, inherited: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const normalized = value.trim().toLowerCase();
  if (normalized === "inherit") return inherited;
  if (normalized === "unset" || normalized === "initial") return undefined;
  if (normalized === "revert" || normalized === "revert-layer") {
    throw new Error(`Unsupported SVG display cascade value "${value}"`);
  }
  return normalized;
}

function resolveOverflow(value: string | undefined, inherited: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const normalized = value.trim().toLowerCase();
  if (normalized === "inherit") return inherited;
  if (normalized === "unset" || normalized === "initial") return "visible";
  if (["visible", "hidden", "scroll", "auto", "clip"].includes(normalized)) return normalized;
  throw new Error(`Unsupported SVG overflow value "${value}"`);
}

function mergedStyle(parent: SvgStyle, attributes: Record<string, string>): SvgStyle {
  const inline = parseInlineStyle(attributes.style);
  const unsupportedCss = unsupportedInlineCssReason(inline);
  if (unsupportedCss) throw new Error(unsupportedCss);
  // Inline declarations outrank presentation attributes in the SVG cascade.
  const property = (name: string) => inline[name] ?? attributes[name];
  return {
    stroke: property("stroke") ?? parent.stroke,
    fill: property("fill") ?? parent.fill,
    // `display` is not inherited. Ancestor display:none is tracked by the
    // element frame because descendants cannot override a hidden subtree.
    display: resolveDisplay(property("display"), parent.display),
    visibility: resolveVisibility(property("visibility"), parent.visibility),
    operation:
      attributes["data-operation"] ??
      attributes.operation ??
      inline["--structural-operation"] ??
      parent.operation,
    clipPath: property("clip-path"),
    mask: property("mask"),
    overflow: resolveOverflow(property("overflow"), parent.overflow),
  };
}

function normalizeExplicitOperation(value: string | undefined): StructuralOperation | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  return isStructuralOperation(normalized) ? normalized : null;
}

function normalizePaint(value: string): string {
  const normalized = value.trim().toLowerCase().replace(/\s+/g, "");
  if (/^#[0-9a-f]{3}$/.test(normalized)) {
    return `#${normalized[1]}${normalized[1]}${normalized[2]}${normalized[2]}${normalized[3]}${normalized[3]}`;
  }
  const rgb = normalized.match(/^rgb\((\d+),(\d+),(\d+)\)$/);
  if (rgb) {
    return `#${rgb.slice(1).map((channel) => Math.max(0, Math.min(255, Number(channel))).toString(16).padStart(2, "0")).join("")}`;
  }
  return normalized;
}

function classifyOperation(
  attributes: Record<string, string>,
  style: SvgStyle,
  layerName: string | undefined,
  mapping: SvgOperationMapping | undefined,
): { operation: StructuralOperation; classification: OperationClassification } | null {
  const explicitSource = attributes["data-operation"] ?? attributes.operation ?? style.operation;
  const explicit = normalizeExplicitOperation(explicitSource);
  if (explicitSource !== undefined && !explicit) {
    throw new Error(`Unsupported explicit structural operation "${explicitSource}"`);
  }
  if (explicit) {
    return {
      operation: explicit,
      classification: { method: "explicit", sourceValue: explicitSource?.trim(), confidence: 1 },
    };
  }
  const id = attributes.id;
  if (id) {
    const operation = normalizedLookup(mapping?.ids, id);
    if (operation) return { operation, classification: { method: "authored", sourceValue: id, confidence: 1 } };
  }
  if (layerName) {
    const operation = normalizedLookup(mapping?.layers, layerName);
    if (operation) return { operation, classification: { method: "layer-map", sourceValue: layerName, confidence: 1 } };
  }
  if (style.stroke) {
    const normalized = normalizePaint(style.stroke);
    const operation = normalizedLookup(mapping?.strokes, normalized, normalizePaint);
    if (operation) return { operation, classification: { method: "style-map", sourceValue: normalized, confidence: 1 } };
  }
  if (mapping?.defaultOperation) {
    return {
      operation: mapping.defaultOperation,
      classification: { method: "inferred", sourceValue: "defaultOperation", confidence: 0.5 },
    };
  }
  return null;
}

function validateOperationMapping(mapping: SvgOperationMapping | undefined): void {
  if (!mapping) return;
  const validateRecord = (
    label: string,
    record: Readonly<Record<string, StructuralOperation>> | undefined,
    normalizeKey: (value: string) => string,
  ) => {
    if (!record) return;
    const seen = new Map<string, string>();
    for (const [key, operation] of Object.entries(record)) {
      const normalizedKey = normalizeKey(key);
      if (!normalizedKey) throw new Error(`SVG ${label} mapping contains an empty key`);
      const prior = seen.get(normalizedKey);
      if (prior !== undefined) {
        throw new Error(
          `Ambiguous SVG ${label} mapping keys "${prior}" and "${key}" normalize identically`,
        );
      }
      seen.set(normalizedKey, key);
      if (typeof operation !== "string" || !isStructuralOperation(operation)) {
        throw new Error(`SVG ${label} mapping "${key}" has invalid operation "${String(operation)}"`);
      }
    }
  };
  validateRecord("layer", mapping.layers, (value) => value.trim().toLowerCase());
  validateRecord("id", mapping.ids, (value) => value.trim().toLowerCase());
  validateRecord("stroke", mapping.strokes, normalizePaint);
  if (
    mapping.defaultOperation !== undefined &&
    (typeof mapping.defaultOperation !== "string" || !isStructuralOperation(mapping.defaultOperation))
  ) {
    throw new Error(`SVG default operation "${String(mapping.defaultOperation)}" is invalid`);
  }
}

function tokenizePathData(data: string): PathToken[] {
  const tokens: PathToken[] = [];
  const pattern = /([AaCcHhLlMmQqSsTtVvZz])|([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)/g;
  let match: RegExpExecArray | null;
  let end = 0;
  while ((match = pattern.exec(data))) {
    const skipped = data.slice(end, match.index).replace(/[\s,]/g, "");
    if (skipped) throw new Error(`Unsupported SVG path syntax near "${skipped}"`);
    if (match[1]) tokens.push({ kind: "command", value: match[1] });
    else tokens.push({ kind: "number", value: finite(Number(match[2]), "SVG path number") });
    end = pattern.lastIndex;
  }
  const trailing = data.slice(end).replace(/[\s,]/g, "");
  if (trailing) throw new Error(`Unsupported SVG path syntax near "${trailing}"`);
  return tokens;
}

function svgArcToCenter(
  start: Vec2,
  rxInput: number,
  ryInput: number,
  rotationDegrees: number,
  largeArc: number,
  sweep: number,
  end: Vec2,
): EllipticalArcSegment | null {
  let radiusX = Math.abs(rxInput);
  let radiusY = Math.abs(ryInput);
  if (radiusX === 0 || radiusY === 0 || (start.x === end.x && start.y === end.y)) return null;
  const rotationRad = ((rotationDegrees % 360) * Math.PI) / 180;
  const cosine = Math.cos(rotationRad);
  const sine = Math.sin(rotationRad);
  const dx = (start.x - end.x) / 2;
  const dy = (start.y - end.y) / 2;
  const xPrime = cosine * dx + sine * dy;
  const yPrime = -sine * dx + cosine * dy;

  const radiiScale = xPrime * xPrime / (radiusX * radiusX) + yPrime * yPrime / (radiusY * radiusY);
  if (radiiScale > 1) {
    const scale = Math.sqrt(radiiScale);
    radiusX *= scale;
    radiusY *= scale;
  }
  const numerator = Math.max(
    0,
    radiusX * radiusX * radiusY * radiusY -
      radiusX * radiusX * yPrime * yPrime -
      radiusY * radiusY * xPrime * xPrime,
  );
  const denominator =
    radiusX * radiusX * yPrime * yPrime + radiusY * radiusY * xPrime * xPrime;
  const coefficient = (largeArc === sweep ? -1 : 1) * Math.sqrt(denominator === 0 ? 0 : numerator / denominator);
  const cxPrime = coefficient * ((radiusX * yPrime) / radiusY);
  const cyPrime = coefficient * (-(radiusY * xPrime) / radiusX);
  const center = {
    x: cosine * cxPrime - sine * cyPrime + (start.x + end.x) / 2,
    y: sine * cxPrime + cosine * cyPrime + (start.y + end.y) / 2,
  };
  const angleBetween = (ux: number, uy: number, vx: number, vy: number) =>
    Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  const ux = (xPrime - cxPrime) / radiusX;
  const uy = (yPrime - cyPrime) / radiusY;
  const vx = (-xPrime - cxPrime) / radiusX;
  const vy = (-yPrime - cyPrime) / radiusY;
  const startAngleRad = angleBetween(1, 0, ux, uy);
  let sweepAngleRad = angleBetween(ux, uy, vx, vy);
  if (!sweep && sweepAngleRad > 0) sweepAngleRad -= TAU;
  if (sweep && sweepAngleRad < 0) sweepAngleRad += TAU;
  // A non-zero endpoint span must never disappear merely because its angular
  // sweep is below floating-point resolution at this source scale. Replacing
  // it with a line would discard source vector semantics, so fail explicitly
  // and require a better-conditioned source coordinate system.
  if (
    Math.abs(sweepAngleRad) <= Number.EPSILON ||
    startAngleRad + sweepAngleRad === startAngleRad
  ) {
    throw new Error(
      "SVG arc is numerically ill-conditioned at the supplied source scale",
    );
  }
  return {
    kind: "elliptical-arc",
    center,
    radiusX,
    radiusY,
    rotationRad,
    startAngleRad,
    sweepAngleRad,
  };
}

function parseSvgPathData(data: string): ParsedSubpath[] {
  const tokens = tokenizePathData(data);
  const paths: ParsedSubpath[] = [];
  let index = 0;
  let command = "";
  let previousCommand = "";
  let current = { x: 0, y: 0 };
  const state: { subpath: MutableSubpath | null } = { subpath: null };
  let lastCubicControl: Vec2 | null = null;
  let lastQuadraticControl: Vec2 | null = null;

  const hasNumber = () => tokens[index]?.kind === "number";
  const takeNumber = () => {
    const token = tokens[index++];
    if (!token || token.kind !== "number") throw new Error(`SVG path command ${command} is missing a number`);
    return token.value;
  };
  const takePoint = (relative: boolean): Vec2 => {
    const point = { x: takeNumber(), y: takeNumber() };
    return relative ? { x: current.x + point.x, y: current.y + point.y } : point;
  };
  const begin = (point: Vec2) => {
    if (state.subpath?.segments.length) {
      paths.push({ segments: state.subpath.segments, closed: state.subpath.closed });
    }
    state.subpath = { segments: [], start: point, current: point, closed: false };
    current = point;
  };
  const append = (segment: VectorSegment, endpoint: Vec2) => {
    if (!state.subpath) begin(current);
    state.subpath!.segments.push(segment);
    state.subpath!.current = endpoint;
    current = endpoint;
  };
  const resetControls = () => {
    lastCubicControl = null;
    lastQuadraticControl = null;
  };

  while (index < tokens.length) {
    if (tokens[index].kind === "command") command = (tokens[index++] as Extract<PathToken, { kind: "command" }>).value;
    if (!command) throw new Error("SVG path data must begin with a command");
    const relative = command === command.toLowerCase();
    const upper = command.toUpperCase();

    if (upper === "Z") {
      const activeSubpath = state.subpath;
      if (!activeSubpath) throw new Error("SVG close command has no open subpath");
      if (current.x !== activeSubpath.start.x || current.y !== activeSubpath.start.y) {
        append({ kind: "line", start: current, end: activeSubpath.start }, activeSubpath.start);
      }
      activeSubpath.closed = true;
      resetControls();
      previousCommand = command;
      command = "";
      continue;
    }

    if (!hasNumber()) throw new Error(`SVG path command ${command} has no coordinates`);
    switch (upper) {
      case "M": {
        const point = takePoint(relative);
        begin(point);
        resetControls();
        previousCommand = command;
        command = relative ? "l" : "L";
        break;
      }
      case "L": {
        const endpoint = takePoint(relative);
        append({ kind: "line", start: current, end: endpoint }, endpoint);
        resetControls();
        previousCommand = command;
        break;
      }
      case "H": {
        const value = takeNumber();
        const endpoint = { x: relative ? current.x + value : value, y: current.y };
        append({ kind: "line", start: current, end: endpoint }, endpoint);
        resetControls();
        previousCommand = command;
        break;
      }
      case "V": {
        const value = takeNumber();
        const endpoint = { x: current.x, y: relative ? current.y + value : value };
        append({ kind: "line", start: current, end: endpoint }, endpoint);
        resetControls();
        previousCommand = command;
        break;
      }
      case "C": {
        const p0 = current;
        const p1 = takePoint(relative);
        const p2 = takePoint(relative);
        const p3 = takePoint(relative);
        append({ kind: "cubic", p0, p1, p2, p3 } satisfies CubicBezierSegment, p3);
        lastCubicControl = p2;
        lastQuadraticControl = null;
        previousCommand = command;
        break;
      }
      case "S": {
        const p0 = current;
        const p1: Vec2 = previousCommand.toUpperCase() === "C" || previousCommand.toUpperCase() === "S"
          ? { x: 2 * current.x - (lastCubicControl?.x ?? current.x), y: 2 * current.y - (lastCubicControl?.y ?? current.y) }
          : current;
        const p2 = takePoint(relative);
        const p3 = takePoint(relative);
        append({ kind: "cubic", p0, p1, p2, p3 } satisfies CubicBezierSegment, p3);
        lastCubicControl = p2;
        lastQuadraticControl = null;
        previousCommand = command;
        break;
      }
      case "Q": {
        const p0 = current;
        const p1 = takePoint(relative);
        const p2 = takePoint(relative);
        append({ kind: "quadratic", p0, p1, p2 } satisfies QuadraticBezierSegment, p2);
        lastQuadraticControl = p1;
        lastCubicControl = null;
        previousCommand = command;
        break;
      }
      case "T": {
        const p0 = current;
        const p1: Vec2 = previousCommand.toUpperCase() === "Q" || previousCommand.toUpperCase() === "T"
          ? { x: 2 * current.x - (lastQuadraticControl?.x ?? current.x), y: 2 * current.y - (lastQuadraticControl?.y ?? current.y) }
          : current;
        const p2 = takePoint(relative);
        append({ kind: "quadratic", p0, p1, p2 } satisfies QuadraticBezierSegment, p2);
        lastQuadraticControl = p1;
        lastCubicControl = null;
        previousCommand = command;
        break;
      }
      case "A": {
        const radiusX = takeNumber();
        const radiusY = takeNumber();
        if (radiusX < 0 || radiusY < 0) throw new Error("SVG arc radii must not be negative");
        const rotation = takeNumber();
        const largeArc = takeNumber();
        const sweep = takeNumber();
        if ((largeArc !== 0 && largeArc !== 1) || (sweep !== 0 && sweep !== 1)) {
          throw new Error("SVG arc flags must be 0 or 1");
        }
        const endpoint = takePoint(relative);
        if (current.x === endpoint.x && current.y === endpoint.y) {
          current = endpoint;
          resetControls();
          previousCommand = command;
          break;
        }
        const arc = svgArcToCenter(current, radiusX, radiusY, rotation, largeArc, sweep, endpoint);
        append(arc ?? { kind: "line", start: current, end: endpoint }, endpoint);
        resetControls();
        previousCommand = command;
        break;
      }
      default:
        throw new Error(`Unsupported SVG path command ${command}`);
    }
  }

  if (state.subpath?.segments.length) {
    paths.push({ segments: state.subpath.segments, closed: state.subpath.closed });
  }
  return paths;
}

function parsePoints(raw: string): Vec2[] {
  const values: number[] = [];
  const pattern = /[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/g;
  let match: RegExpExecArray | null;
  let end = 0;
  while ((match = pattern.exec(raw))) {
    if (raw.slice(end, match.index).replace(/[\s,]/g, "") !== "") {
      throw new Error("SVG points contain unsupported syntax");
    }
    values.push(finite(Number(match[0]), "SVG point coordinate"));
    end = pattern.lastIndex;
  }
  if (raw.slice(end).replace(/[\s,]/g, "") !== "") {
    throw new Error("SVG points contain unsupported syntax");
  }
  if (values.length < 4 || values.length % 2 !== 0) {
    throw new Error("SVG points must contain finite x/y pairs");
  }
  return Array.from({ length: values.length / 2 }, (_, index) => ({
    x: values[index * 2],
    y: values[index * 2 + 1],
  }));
}

function linesFromPoints(points: readonly Vec2[], closed: boolean): VectorSegment[] {
  const segments: VectorSegment[] = [];
  for (let index = 1; index < points.length; index += 1) {
    segments.push({ kind: "line", start: points[index - 1], end: points[index] });
  }
  if (
    closed &&
    (points[points.length - 1].x !== points[0].x || points[points.length - 1].y !== points[0].y)
  ) {
    segments.push({ kind: "line", start: points[points.length - 1], end: points[0] });
  }
  return segments;
}

function geometryLength(
  raw: string | undefined,
  fallback: number,
  dpi: number,
): number {
  if (raw === undefined || raw.trim() === "") return fallback;
  if (/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(raw.trim())) {
    return finite(Number(raw), "SVG geometry length");
  }
  // SVG absolute geometry lengths are first resolved to CSS px/current user
  // units. The viewBox CTM is applied afterward. Dividing by the viewBox's
  // canonical mm/user scale would incorrectly cancel or distort that CTM.
  const mm = lengthToMillimetres(raw, dpi);
  return mm / (25.4 / dpi);
}

function shapeSubpaths(
  localName: string,
  attributes: Record<string, string>,
  dpi: number,
): ParsedSubpath[] {
  const x = (name: string, fallback = 0) => geometryLength(attributes[name], fallback, dpi);
  const y = (name: string, fallback = 0) => geometryLength(attributes[name], fallback, dpi);
  switch (localName) {
    case "path":
      if (!attributes.d?.trim()) throw new Error("SVG path is missing d");
      return parseSvgPathData(attributes.d);
    case "line": {
      const start = { x: x("x1"), y: y("y1") };
      const end = { x: x("x2"), y: y("y2") };
      return [{ segments: [{ kind: "line", start, end }], closed: false }];
    }
    case "polyline": {
      const points = parsePoints(attributes.points ?? "");
      return [{ segments: linesFromPoints(points, false), closed: false }];
    }
    case "polygon": {
      const points = parsePoints(attributes.points ?? "");
      return [{ segments: linesFromPoints(points, true), closed: true }];
    }
    case "rect": {
      const left = x("x");
      const top = y("y");
      const width = x("width");
      const height = y("height");
      if (width <= 0 || height <= 0) throw new Error("SVG rect width/height must be positive");
      let radiusX = x("rx", Number.NaN);
      let radiusY = y("ry", Number.NaN);
      if (Number.isNaN(radiusX) && Number.isNaN(radiusY)) {
        const points = [
          { x: left, y: top },
          { x: left + width, y: top },
          { x: left + width, y: top + height },
          { x: left, y: top + height },
        ];
        return [{ segments: linesFromPoints(points, true), closed: true }];
      }
      if (Number.isNaN(radiusX)) radiusX = radiusY;
      if (Number.isNaN(radiusY)) radiusY = radiusX;
      if (radiusX < 0 || radiusY < 0) throw new Error("SVG rect corner radii must not be negative");
      radiusX = Math.min(Math.abs(radiusX), width / 2);
      radiusY = Math.min(Math.abs(radiusY), height / 2);
      if (radiusX === 0 || radiusY === 0) {
        const points = [
          { x: left, y: top },
          { x: left + width, y: top },
          { x: left + width, y: top + height },
          { x: left, y: top + height },
        ];
        return [{ segments: linesFromPoints(points, true), closed: true }];
      }
      const segments: VectorSegment[] = [
        { kind: "line", start: { x: left + radiusX, y: top }, end: { x: left + width - radiusX, y: top } },
        { kind: "elliptical-arc", center: { x: left + width - radiusX, y: top + radiusY }, radiusX, radiusY, rotationRad: 0, startAngleRad: -Math.PI / 2, sweepAngleRad: Math.PI / 2 },
        { kind: "line", start: { x: left + width, y: top + radiusY }, end: { x: left + width, y: top + height - radiusY } },
        { kind: "elliptical-arc", center: { x: left + width - radiusX, y: top + height - radiusY }, radiusX, radiusY, rotationRad: 0, startAngleRad: 0, sweepAngleRad: Math.PI / 2 },
        { kind: "line", start: { x: left + width - radiusX, y: top + height }, end: { x: left + radiusX, y: top + height } },
        { kind: "elliptical-arc", center: { x: left + radiusX, y: top + height - radiusY }, radiusX, radiusY, rotationRad: 0, startAngleRad: Math.PI / 2, sweepAngleRad: Math.PI / 2 },
        { kind: "line", start: { x: left, y: top + height - radiusY }, end: { x: left, y: top + radiusY } },
        { kind: "elliptical-arc", center: { x: left + radiusX, y: top + radiusY }, radiusX, radiusY, rotationRad: 0, startAngleRad: Math.PI, sweepAngleRad: Math.PI / 2 },
      ];
      return [{ segments, closed: true }];
    }
    case "circle": {
      const radius = x("r");
      if (radius <= 0) throw new Error("SVG circle radius must be positive");
      const segment: ArcSegment = {
        kind: "arc",
        center: { x: x("cx"), y: y("cy") },
        radius,
        startAngleRad: 0,
        sweepAngleRad: TAU,
      };
      return [{ segments: [segment], closed: true }];
    }
    case "ellipse": {
      const radiusX = x("rx");
      const radiusY = y("ry");
      if (radiusX <= 0 || radiusY <= 0) throw new Error("SVG ellipse radii must be positive");
      const segment: EllipticalArcSegment = {
        kind: "elliptical-arc",
        center: { x: x("cx"), y: y("cy") },
        radiusX,
        radiusY,
        rotationRad: 0,
        startAngleRad: 0,
        sweepAngleRad: TAU,
      };
      return [{ segments: [segment], closed: true }];
    }
    default:
      return [];
  }
}

function namespacedAttribute(tag: SaxesTagNS, namespace: string, localName: string): string | undefined {
  for (const attribute of Object.values(tag.attributes)) {
    if (attribute.local === localName && attribute.uri === namespace) return attribute.value;
  }
  return undefined;
}

function layerLabel(
  tag: SaxesTagNS,
  attributes: Record<string, string>,
  parentLayerName: string | undefined,
): string | undefined {
  const inkscapeGroupMode =
    namespacedAttribute(tag, INKSCAPE_NAMESPACE, "groupmode") ?? attributes["inkscape:groupmode"];
  const inkscapeLabel =
    namespacedAttribute(tag, INKSCAPE_NAMESPACE, "label") ?? attributes["inkscape:label"];
  if (inkscapeGroupMode?.trim().toLowerCase() === "layer") {
    return inkscapeLabel ?? attributes.id;
  }
  if (attributes["data-layer"]) return attributes["data-layer"];
  // Many simple CAD SVGs use one top-level group id as a layer. Never let an
  // ordinary nested subgroup id erase an already-established semantic layer.
  if (!parentLayerName) return attributes.id;
  return undefined;
}

function metadataAttributes(attributes: Record<string, string>): Readonly<Record<string, SourceMetadataValue>> {
  const entries = Object.entries(attributes).filter(([name]) =>
    ["id", "class", "stroke", "fill", "stroke-width", "data-operation"].includes(name),
  );
  return Object.fromEntries(entries);
}

export function importStructuralSvg(
  svg: string,
  options: ImportStructuralSvgOptions,
): SvgImportResult {
  if (!options.id.trim()) throw new Error("Structural SVG import id must not be empty");
  const dpi = options.dpi ?? DEFAULT_DPI;
  if (!Number.isFinite(dpi) || dpi <= 0) throw new Error("SVG DPI must be finite and positive");
  validateOperationMapping(options.operationMapping);

  const issues: SvgImportIssue[] = [];
  const entities: StructuralEntity[] = [];
  const frames: ElementFrame[] = [];
  const sourceElementIds = new Set<string>();
  const rootState: { value: RootGeometry | null } = { value: null };
  let elementIndex = 0;
  let source: CanonicalDielineSource = {
    id: options.sourceId ?? options.id,
    format: "svg",
    sourceUnits: "unitless",
    ...(options.sourceName ? { name: options.sourceName } : {}),
    ...(options.sourceUri ? { uri: options.sourceUri } : {}),
    ...(options.sourceSha256 ? { sha256: options.sourceSha256 } : {}),
  };

  const parser = new SaxesParser({ xmlns: true, fragment: false });
  parser.on("error", (error) => {
    throw error;
  });
  parser.on("processinginstruction", ({ target }) => {
    if (target.trim().toLowerCase() === "xml-stylesheet") {
      throw new Error(
        "External XML stylesheets are not supported as structural SVG authority",
      );
    }
  });
  parser.on("doctype", () => {
    throw new Error("SVG doctypes are not supported as deterministic structural authority");
  });
  parser.on("opentag", (tag) => {
    const localName = tag.local.toLowerCase();
    const attributes = Object.fromEntries(
      Object.values(tag.attributes).map((attribute) => [attribute.name, attribute.value]),
    );
    const explicitId = attributes.id;
    if (explicitId !== undefined) {
      if (!explicitId.trim()) throw new Error("SVG element id must not be empty");
      if (sourceElementIds.has(explicitId)) {
        throw new Error(`Duplicate explicit SVG element id "${explicitId}"`);
      }
      sourceElementIds.add(explicitId);
    }
    const eventHandler = Object.keys(attributes).find((name) => /^on[a-z]/i.test(name));
    if (eventHandler) {
      throw new Error(
        `SVG event handler "${eventHandler}" is not supported as deterministic structural authority`,
      );
    }
    if (
      localName.startsWith("animate") ||
      ["discard", "script", "set", "switch"].includes(localName)
    ) {
      throw new Error(
        `SVG ${localName} content is active or conditional and cannot be structural authority`,
      );
    }
    if (localName === "svg" && tag.uri !== SVG_NAMESPACE && tag.uri !== "") {
      throw new Error(`Unsupported SVG namespace ${tag.uri}`);
    }
    const isDocumentRoot = rootState.value === null;
    if (isDocumentRoot) {
      if (localName !== "svg") throw new Error("Structural SVG root element must be <svg>");
      rootState.value = rootGeometry(attributes, dpi);
    } else if (localName === "svg") {
      throw new Error("Nested SVG viewports are not supported by the structural importer");
    }
    const root = rootState.value;
    if (!root) throw new Error("Structural SVG root geometry was not initialized");

    const parent = frames[frames.length - 1];
    const inheritedTransform = parent?.transform ?? root.userToMillimetres;
    const inheritedSourceTransform = parent?.sourceTransform ?? IDENTITY_AFFINE_MATRIX;
    const ownTransform = parseTransform(attributes.transform);
    const transform = multiplyAffine(inheritedTransform, ownTransform);
    const sourceTransform = multiplyAffine(inheritedSourceTransform, ownTransform);
    const style = mergedStyle(parent?.style ?? {}, attributes);
    const layerName = localName === "g"
      ? layerLabel(tag, attributes, parent?.layerName) ?? parent?.layerName
      : parent?.layerName;
    const ignored = Boolean(
      parent?.ignored || ["defs", "symbol", "clippath", "mask", "pattern", "marker"].includes(localName),
    );
    const displayNone = Boolean(parent?.displayNone || style.display?.trim().toLowerCase() === "none");
    const clipPath = style.clipPath?.trim().toLowerCase();
    const mask = style.mask?.trim().toLowerCase();
    const overflow = style.overflow?.trim().toLowerCase();
    const authorityBlock =
      parent?.authorityBlock ??
      (clipPath && clipPath !== "none"
        ? "uses clip-path; exact structural clipping is not implemented"
        : mask && mask !== "none"
          ? "uses a mask; exact structural clipping is not implemented"
          : overflow && overflow !== "visible"
            ? `uses overflow=${overflow}; exact structural viewport clipping is not implemented`
            : undefined);
    frames.push({
      transform,
      sourceTransform,
      style,
      layerName,
      ignored,
      displayNone,
      ...(authorityBlock ? { authorityBlock } : {}),
    });

    if (localName === "style") {
      throw new Error(
        "Embedded CSS stylesheets are not supported as structural SVG authority",
      );
    }
    if (localName === "use" || localName === "image") {
      const classification = classifyOperation(attributes, style, layerName, options.operationMapping);
      const unsupportedStructuralUse = Boolean(classification || (options.strict && localName === "use"));
      const message = localName === "image"
        ? "Raster images are visual references and cannot be classified as production geometry"
        : "SVG use elements are not expanded; provide explicit structural paths";
      issues.push({
        severity: unsupportedStructuralUse ? "error" : "warning",
        code: localName === "image" ? "raster-image-ignored" : "use-element-unsupported",
        message,
        ...(attributes.id ? { elementId: attributes.id } : {}),
      });
      return;
    }
    if (ignored) return;
    const supported = ["path", "line", "polyline", "polygon", "rect", "circle", "ellipse"];
    if (!supported.includes(localName)) {
      const potentiallyRenderedUnsupported = [
        "foreignobject",
        "mesh",
        "text",
        "textpath",
        "tspan",
      ].includes(localName);
      if (
        potentiallyRenderedUnsupported &&
        classifyOperation(attributes, style, layerName, options.operationMapping)
      ) {
        issues.push({
          severity: "error",
          code: "classified-geometry-unsupported",
          message: `Classified SVG ${localName} geometry is unsupported and cannot be silently omitted`,
          ...(attributes.id ? { elementId: attributes.id } : {}),
        });
      }
      return;
    }
    if (tag.uri !== SVG_NAMESPACE && tag.uri !== "") {
      issues.push({
        severity: "warning",
        code: "foreign-namespace-geometry-ignored",
        message: `Ignored ${localName} geometry outside the SVG namespace`,
        ...(attributes.id ? { elementId: attributes.id } : {}),
      });
      return;
    }
    if (displayNone || ["hidden", "collapse"].includes(style.visibility?.trim().toLowerCase() ?? "")) {
      return;
    }

    elementIndex += 1;
    const elementId = attributes.id || `${localName}-${elementIndex}`;
    try {
      if (authorityBlock) {
        throw new Error(
          `SVG geometry "${elementId}" ${authorityBlock}`,
        );
      }
      const classification = classifyOperation(attributes, style, layerName, options.operationMapping);
      if (!classification) {
        const issue: SvgImportIssue = {
          severity: options.strict ? "error" : "warning",
          code: "unclassified-operation",
          message: `Skipped SVG geometry "${elementId}" because no structural operation matched`,
          elementId,
        };
        issues.push(issue);
        if (options.strict) throw new Error(issue.message);
        return;
      }
      const paths = shapeSubpaths(localName, attributes, dpi);
      paths.forEach((parsed, subpathIndex) => {
        const suffix = paths.length > 1 ? `-${subpathIndex + 1}` : "";
        const id = `${elementId}${suffix}`;
        const provenance: SourceProvenance = {
          sourceId: source.id,
          format: "svg",
          entityId: elementId,
          ...(layerName ? { layerName } : {}),
          objectIndex: elementIndex,
          sourceUnits: root.sourceUnits,
          sourceTransform,
          metadata: {
            element: localName,
            ...metadataAttributes(attributes),
          },
        };
        const path: VectorPath = {
          id: `${id}-path`,
          segments: parsed.segments.map((segment, sourceSegmentIndex) => ({
            ...segment,
            provenance: {
              source: provenance,
              sourceSegmentIndex,
              sourceParameterRange: [0, 1] as const,
            },
          })),
          closed: parsed.closed,
          transform,
          provenance,
        };
        entities.push({
          id,
          operation: classification.operation,
          path,
          provenance,
          classification: classification.classification,
        });
      });
    } catch (error) {
      issues.push({
        severity: "error",
        code: "invalid-svg-geometry",
        message: error instanceof Error ? error.message : String(error),
        elementId,
      });
      if (options.strict) throw error;
    }
  });
  parser.on("closetag", () => {
    frames.pop();
  });
  parser.write(svg).close();

  const root = rootState.value;
  if (!root) throw new Error("Structural SVG has no root geometry");
  source = { ...source, sourceUnits: root.sourceUnits };
  if (issues.some((issue) => issue.severity === "error")) {
    throw new Error(`Structural SVG import failed: ${issues.filter((issue) => issue.severity === "error").map((issue) => issue.message).join("; ")}`);
  }
  if (!entities.length) throw new Error("Structural SVG contains no classified vector geometry");

  const dieline: CanonicalDieline = {
    schemaVersion: 2,
    id: options.id,
    units: "mm",
    coordinateSystem: "x-right-y-down",
    widthMm: root.widthMm,
    heightMm: root.heightMm,
    source,
    tolerances: createStructuralTolerances({
      ...(options.topologySnapMm === undefined ? {} : { topologySnapMm: options.topologySnapMm }),
      ...(options.curveFlatteningMm === undefined ? {} : { curveFlatteningMm: options.curveFlatteningMm }),
    }),
    entities,
    metadata: {
      importer: "structural-svg-v2",
      dpi,
      issueCount: issues.length,
    },
  };
  assertCanonicalDieline(dieline);
  return { dieline, issues };
}
