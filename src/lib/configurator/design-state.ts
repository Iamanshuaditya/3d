import type {
  DesignDocument,
  DesignElement,
  EditableSection,
  EditableSurface,
  ImageElement,
  ProductConfig,
  TextElement,
} from "@/types/configurator";

/** past / present / future history wrapper (§29). */
export type History<T> = {
  past: T[];
  present: T;
  future: T[];
  /** Snapshot before the first transient update in the active gesture. */
  transientBase?: T;
};

const HISTORY_LIMIT = 50;

export function createHistory<T>(present: T): History<T> {
  return { past: [], present, future: [] };
}

export function createEmptyDocument(config: ProductConfig): DesignDocument {
  const surfaces: DesignDocument["surfaces"] = {};
  for (const surface of config.editableSurfaces) {
    surfaces[surface.id] = {
      elements: [],
      // The substrate is composited by DesignEditor into the GPU texture. It
      // is not user artwork and therefore must not pollute editable state.
      background: null,
    };
  }
  return { productId: config.id, surfaces };
}

let idCounter = 0;
/** Deterministic, collision-free within a session. */
export function nextId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${idCounter}`;
}

export type DesignAction =
  | { type: "add"; surfaceId: string; element: DesignElement }
  | {
      type: "update";
      surfaceId: string;
      id: string;
      patch: Partial<ImageElement> & Partial<TextElement>;
    }
  | { type: "remove"; surfaceId: string; id: string }
  | { type: "reorder"; surfaceId: string; id: string; direction: "up" | "down" }
  | { type: "background"; surfaceId: string; color: string | null }
  | { type: "resetSurface"; surfaceId: string }
  | { type: "replace"; document: DesignDocument };

function applyAction(doc: DesignDocument, action: DesignAction): DesignDocument {
  if (action.type === "replace") return action.document;

  const surface = doc.surfaces[action.surfaceId];
  if (!surface) return doc;

  const withSurface = (elements: DesignElement[], background = surface.background) => ({
    ...doc,
    surfaces: { ...doc.surfaces, [action.surfaceId]: { elements, background } },
  });

  switch (action.type) {
    case "add":
      return withSurface([...surface.elements, action.element]);

    case "update":
      return withSurface(
        surface.elements.map((el) =>
          el.id === action.id ? ({ ...el, ...action.patch } as DesignElement) : el,
        ),
      );

    case "remove":
      return withSurface(surface.elements.filter((el) => el.id !== action.id));

    case "reorder": {
      const index = surface.elements.findIndex((el) => el.id === action.id);
      if (index === -1) return doc;
      const target = action.direction === "up" ? index + 1 : index - 1;
      if (target < 0 || target >= surface.elements.length) return doc;
      const next = [...surface.elements];
      [next[index], next[target]] = [next[target], next[index]];
      return withSurface(next);
    }

    case "background":
      return withSurface(surface.elements, action.color);

    case "resetSurface":
      return withSurface([], null);

    default:
      return doc;
  }
}

/**
 * Actions flagged transient (e.g. every pointer move during a drag) mutate the
 * present without pushing history, so one drag collapses into one undo step.
 */
export function reduceHistory(
  state: History<DesignDocument>,
  action: DesignAction,
  options: { transient?: boolean } = {},
): History<DesignDocument> {
  const nextPresent = applyAction(state.present, action);
  if (nextPresent === state.present) return state;

  if (options.transient) {
    return {
      ...state,
      present: nextPresent,
      transientBase: state.transientBase ?? state.present,
    };
  }

  const base = state.transientBase ?? state.present;
  const past = [...state.past, base].slice(-HISTORY_LIMIT);
  return { past, present: nextPresent, future: [] };
}

export function undo(state: History<DesignDocument>): History<DesignDocument> {
  if (!state.past.length) return state;
  const previous = state.past[state.past.length - 1];
  return {
    past: state.past.slice(0, -1),
    present: previous,
    future: [state.present, ...state.future],
    transientBase: undefined,
  };
}

export function redo(state: History<DesignDocument>): History<DesignDocument> {
  if (!state.future.length) return state;
  const [next, ...rest] = state.future;
  return {
    past: [...state.past, state.present],
    present: next,
    future: rest,
    transientBase: undefined,
  };
}

/** Commits the current present as a history checkpoint (used at drag end). */
export function commit(state: History<DesignDocument>): History<DesignDocument> {
  if (state.transientBase === undefined) return state;
  const past = [...state.past, state.transientBase].slice(-HISTORY_LIMIT);
  return { past, present: state.present, future: [] };
}

/** Abandons an in-progress gesture without creating an undo checkpoint. */
export function cancelTransient(
  state: History<DesignDocument>,
): History<DesignDocument> {
  if (state.transientBase === undefined) return state;
  return {
    past: state.past,
    present: state.transientBase,
    future: state.future,
  };
}

/** Centred, aspect-preserving placement for freshly uploaded artwork (§13). */
export function fitElement(
  naturalWidth: number,
  naturalHeight: number,
  surfaceWidth: number,
  surfaceHeight: number,
  coverage = 0.55,
): { x: number; y: number; width: number; height: number } {
  const maxW = surfaceWidth * coverage;
  const maxH = surfaceHeight * coverage;
  const scale = Math.min(maxW / naturalWidth, maxH / naturalHeight);
  const width = naturalWidth * scale;
  const height = naturalHeight * scale;
  return {
    x: (surfaceWidth - width) / 2,
    y: (surfaceHeight - height) / 2,
    width,
    height,
  };
}

export type SectionBox = { x: number; y: number; width: number; height: number };

/** Converts printer-authored centimetre panel metadata to editor pixels. */
export function sectionBox(
  surface: EditableSurface,
  section: EditableSection,
): SectionBox {
  return {
    x: (section.xCm / surface.physicalWidthCm) * surface.editorWidth,
    y: (section.yCm / surface.physicalHeightCm) * surface.editorHeight,
    width: (section.widthCm / surface.physicalWidthCm) * surface.editorWidth,
    height: (section.heightCm / surface.physicalHeightCm) * surface.editorHeight,
  };
}

/** Top-left coordinates for a Konva node whose rotation origin is top-left. */
export function centeredOrigin(
  box: SectionBox,
  width: number,
  height: number,
  rotation: number,
): { x: number; y: number } {
  const centerX = box.x + box.width / 2;
  const centerY = box.y + box.height / 2;
  const normalized = ((rotation % 360) + 360) % 360;
  if (normalized === 90) return { x: centerX + height / 2, y: centerY - width / 2 };
  if (normalized === 270) return { x: centerX - height / 2, y: centerY + width / 2 };
  if (normalized === 180) return { x: centerX + width / 2, y: centerY + height / 2 };
  return { x: centerX - width / 2, y: centerY - height / 2 };
}

/** Fits and auto-orients new content to one Vistaprint panel section. */
export function fitElementToSection(
  naturalWidth: number,
  naturalHeight: number,
  box: SectionBox,
  rotation: number,
  coverage = 0.72,
) {
  const quarterTurn = Math.abs(rotation % 180) === 90;
  const maxUnrotatedWidth = (quarterTurn ? box.height : box.width) * coverage;
  const maxUnrotatedHeight = (quarterTurn ? box.width : box.height) * coverage;
  const scale = Math.min(
    maxUnrotatedWidth / naturalWidth,
    maxUnrotatedHeight / naturalHeight,
  );
  const width = naturalWidth * scale;
  const height = naturalHeight * scale;
  return {
    ...centeredOrigin(box, width, height, rotation),
    width,
    height,
    rotation,
  };
}

/** Storage-agnostic serialization (§41). */
export function serializeDesign(doc: DesignDocument): string {
  return JSON.stringify(doc);
}

export function deserializeDesign(raw: string): DesignDocument | null {
  try {
    const parsed = JSON.parse(raw) as DesignDocument;
    if (!parsed || typeof parsed !== "object" || !parsed.surfaces) return null;
    return parsed;
  } catch {
    return null;
  }
}
