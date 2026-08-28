import type { PouchSpec } from "@/types/pouch";
import type { ParameterRecord, ProvenanceLedger } from "@/types/provenance";
import { createProvenanceLedger } from "./ledger";

/**
 * Builds the provenance position for one pouch specification (#24).
 *
 * Two pouches that look alike in the type system can stand on completely
 * different evidence. A source-measured web is `measured`; a parametric SKU is
 * `authored` — a real human choice, but not a manufacturer measurement. The
 * spec's own `sourceReview` and `previewAssumptions` lists are the authority
 * for what stays unresolved or preview-only; nothing here upgrades them.
 */
export function pouchProvenanceLedger(spec: PouchSpec): ProvenanceLedger {
  const web = spec.productionWeb;
  const records: ParameterRecord[] = web
    ? measuredWebRecords(spec, web)
    : authoredWebRecords(spec);

  records.push(...nominalRecords(spec, Boolean(web)));

  if (web) {
    for (const item of web.sourceReview) {
      records.push({
        id: `sourceReview.${item.id}`,
        label: item.observed,
        provenance: "unresolved",
        observed: item.observed,
        needs:
          item.status === "requires-source-vector" ? "source-vector" : "converter-confirmation",
        note: item.note,
      });
    }
    for (const guide of web.referenceGuides ?? []) {
      records.push({
        id: `productionWeb.referenceGuide.${guide.id}`,
        label: guide.label,
        provenance: "unresolved",
        value: guide.positionMm,
        unit: "mm",
        observed: `${guide.label} on the ${guide.axis} axis at ${guide.positionMm} mm`,
        needs: "converter-confirmation",
        note: "Position is preserved exactly; its manufacturing operation is not inferred.",
      });
    }
    for (const assumption of web.previewAssumptions) {
      records.push({
        id: `previewAssumption.${assumption.id}`,
        label: assumption.id,
        provenance: "assumed",
        appliesTo: "preview",
        ...(assumption.valueMm === undefined ? {} : { value: assumption.valueMm, unit: "mm" as const }),
        note: assumption.note,
      });
    }
  }

  records.push(...previewFormRecords(spec, Boolean(web)));

  return createProvenanceLedger(spec.id, records);
}

function measuredWebRecords(
  spec: PouchSpec,
  web: NonNullable<PouchSpec["productionWeb"]>,
): ParameterRecord[] {
  const source = `Source-measured production web for ${spec.name}`;
  const segmentIds = web.segments.map((segment) => `productionWeb.segment.${segment.id}.lengthMm`);
  return [
    {
      id: "productionWeb.widthMm",
      label: "Production web width",
      provenance: "measured",
      value: web.widthMm,
      unit: "mm",
      source,
      note: "Across-web dimension of the printed film. Deliberately not the nominal finished width.",
    },
    {
      id: "productionWeb.repeatMm",
      label: "Production web repeat",
      provenance: "measured",
      value: web.repeatMm,
      unit: "mm",
      source,
      note: "Along-web print repeat covering one complete pouch.",
    },
    {
      id: "productionWeb.laneCount",
      label: "Production lane count",
      provenance: "measured",
      value: web.laneCount,
      unit: "count",
      source,
      note: "Number of pouches across the printed web.",
    },
    ...web.segments.map<ParameterRecord>((segment) => ({
      id: `productionWeb.segment.${segment.id}.lengthMm`,
      label: `${segment.label} length`,
      provenance: "measured",
      value: segment.lengthMm,
      unit: "mm",
      source,
      note: `Measured ${segment.role} region in the flat production web.`,
    })),
    {
      id: "productionWeb.segmentBoundaries",
      label: "Web segment boundaries",
      provenance: "derived",
      derivedFrom: [...segmentIds, "productionWeb.repeatMm"],
      unit: "mm",
      note: "Running start/end positions accumulated from the measured segment lengths.",
    },
    {
      id: "productionWeb.printableRegions",
      label: "Printable artwork regions",
      provenance: "derived",
      derivedFrom: ["productionWeb.segmentBoundaries", "productionWeb.widthMm"],
      note: "Front, gusset and back extents; technical bands are excluded by role, not by guesswork.",
    },
  ];
}

/**
 * A parametric SKU has no manufacturer source to measure. Its web dimensions
 * are still exact and reproducible — they were chosen — so they are authored
 * rather than measured, and print output may stand on them.
 */
function authoredWebRecords(spec: PouchSpec): ParameterRecord[] {
  const approvedBy = "Parametric pouch product definition";
  const repeatMm = spec.height * 2 + spec.gusset + spec.dielineBleed * 2;
  return [
    {
      id: "productionWeb.widthMm",
      label: "Print web width",
      provenance: "authored",
      value: spec.width,
      unit: "mm",
      approvedBy,
      note: "Authored parametric web width. No manufacturer web measurement exists for this SKU.",
    },
    {
      id: "productionWeb.repeatMm",
      label: "Print web repeat",
      provenance: "authored",
      value: repeatMm,
      unit: "mm",
      approvedBy,
      note: "Authored front + gusset + back repeat including declared bleed.",
    },
    {
      id: "productionWeb.laneCount",
      label: "Print lane count",
      provenance: "authored",
      value: 1,
      unit: "count",
      approvedBy,
      note: "Single-lane layout assumed by the parametric builder and approved as the product definition.",
    },
    {
      id: "productionWeb.segmentBoundaries",
      label: "Web segment boundaries",
      provenance: "derived",
      derivedFrom: ["productionWeb.repeatMm"],
      unit: "mm",
      note: "Panel boundaries accumulated from the authored panel lengths.",
    },
    {
      id: "productionWeb.printableRegions",
      label: "Printable artwork regions",
      provenance: "derived",
      derivedFrom: ["productionWeb.segmentBoundaries", "productionWeb.widthMm"],
      note: "Front, gusset and back extents of the authored parametric layout.",
    },
  ];
}

function nominalRecords(spec: PouchSpec, measured: boolean): ParameterRecord[] {
  const shared = measured
    ? { provenance: "measured" as const, source: `Client specification for ${spec.name}` }
    : { provenance: "authored" as const, approvedBy: "Parametric pouch product definition" };
  return [
    {
      ...shared,
      id: "nominal.widthMm",
      label: "Nominal finished width",
      value: spec.width,
      unit: "mm",
      note: "Finished-pouch face width. Never interchangeable with the production web width.",
    },
    {
      ...shared,
      id: "nominal.heightMm",
      label: "Nominal finished height",
      value: spec.height,
      unit: "mm",
      note: "Finished-pouch height.",
    },
    {
      ...shared,
      id: "nominal.gussetWebMm",
      label: "Nominal unfolded gusset",
      value: spec.gusset,
      unit: "mm",
      note: "Unfolded gusset web length. It does not establish an opened or filled body depth.",
    },
  ];
}

/**
 * The 3D body form is a deformable-film preview in every case. It is recorded
 * as an assumption unless the spec itself supplies a certified value, which no
 * current source does.
 */
function previewFormRecords(spec: PouchSpec, measured: boolean): ParameterRecord[] {
  const maxHalfDepth = spec.halfDepth.reduce((max, point) => Math.max(max, point.v), 0);
  const records: ParameterRecord[] = [
    {
      id: "body.openedDepthMm",
      label: "Opened body depth",
      provenance: "assumed",
      appliesTo: "preview",
      value: Number((maxHalfDepth * 2).toFixed(4)),
      unit: "mm",
      note: "Peak face-to-face depth of the preview surface. Film bulge under fill is not certified by any source dimension.",
    },
    {
      id: "closure.sealConstruction",
      label: "Seal and closure construction",
      provenance: "assumed",
      appliesTo: "preview",
      value: spec.topSealHeight,
      unit: "mm",
      note: "Top seal, side fin, notch and zipper form are visual preview parameters, not converter seal specifications.",
    },
  ];
  if (measured) {
    records.push({
      id: "productionWeb.technicalBandMeaning",
      label: "Technical band operation",
      provenance: "unresolved",
      observed: "Non-printing bands and transitions bounded exactly in the measured web",
      needs: "converter-confirmation",
      note: "The bands' extents are measured, but whether each is slit, sealed or a registration allowance is not established.",
    });
  } else {
    records.push({
      id: "productionWeb.technicalBandMeaning",
      label: "Technical band operation",
      provenance: "unresolved",
      observed: "Parametric layout declares no technical bands",
      needs: "source-review",
      note: "A parametric SKU carries no converter band semantics; a manufacturer source is required before claiming any.",
    });
  }
  return records;
}
