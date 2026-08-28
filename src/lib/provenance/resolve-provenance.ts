import type { ProductConfig } from "@/types/configurator";
import type { ParameterRecord, ProvenanceLedger } from "@/types/provenance";
import { POUCHES } from "@/lib/configurator/pouch-spec";
import { createProvenanceLedger } from "./ledger";
import { pouchProvenanceLedger } from "./pouch-ledger";

/**
 * Resolves the provenance position for a runtime product configuration (#24).
 *
 * Every construction gets a ledger. A product with nothing to declare would
 * otherwise be indistinguishable from a product whose declarations were simply
 * forgotten, and only one of those is safe to export.
 */
export function resolveManufacturingProvenance(product: ProductConfig): ProvenanceLedger {
  if (product.manufacturingProvenance) {
    return createProvenanceLedger(product.id, product.manufacturingProvenance.records);
  }
  if (product.pouchSpecId) {
    const spec = POUCHES[product.pouchSpecId];
    if (spec) return pouchProvenanceLedger(spec);
  }
  if (product.flatSheetSpec) return flatSheetLedger(product);
  if (product.cartonSpec || product.cartonSpecId) return cartonLedger(product);
  return createProvenanceLedger(product.id, []);
}

function flatSheetLedger(product: ProductConfig): ProvenanceLedger {
  const sheet = product.flatSheetSpec;
  if (!sheet) return createProvenanceLedger(product.id, []);
  const approvedBy = `Flat-sheet product definition for ${product.name}`;
  const records: ParameterRecord[] = [
    {
      id: "productionWeb.widthMm",
      label: "Trim width",
      provenance: "authored",
      value: sheet.trimWidthMm,
      unit: "mm",
      approvedBy,
      note: "Authored finished trim width; the sheet is printed one-up.",
    },
    {
      id: "productionWeb.repeatMm",
      label: "Trim height",
      provenance: "authored",
      value: sheet.trimHeightMm,
      unit: "mm",
      approvedBy,
      note: "Authored finished trim height.",
    },
    {
      id: "productionWeb.laneCount",
      label: "Lane count",
      provenance: "authored",
      value: 1,
      unit: "count",
      approvedBy,
      note: "A flat sheet is exported one-up; imposition is the printer's step.",
    },
    {
      id: "productionWeb.segmentBoundaries",
      label: "Trim and bleed boundaries",
      provenance: "derived",
      derivedFrom: ["productionWeb.widthMm", "productionWeb.repeatMm"],
      unit: "mm",
      note: `Bleed ${sheet.bleedMm} mm and safe-area inset ${sheet.safeAreaInsetMm} mm offset from the authored trim box.`,
    },
    {
      id: "productionWeb.printableRegions",
      label: "Printable region",
      provenance: "derived",
      derivedFrom: ["productionWeb.segmentBoundaries"],
      note: "A flat sheet has a single printable region bounded by the trim box plus bleed.",
    },
  ];
  return createProvenanceLedger(product.id, records);
}

/**
 * A structural carton built from an imported vector authority is measured: its
 * geometry is the source file. A legacy panel-rect carton was authored.
 */
function cartonLedger(product: ProductConfig): ProvenanceLedger {
  const authority = product.cartonSpec?.structural;
  const measured = Boolean(authority);
  const shared = measured
    ? {
        provenance: "measured" as const,
        source: `Canonical production dieline imported for ${product.name}`,
      }
    : {
        provenance: "authored" as const,
        approvedBy: `Folded-carton product definition for ${product.name}`,
      };
  const widthMm = authority?.dieline.widthMm ?? product.cartonSpec?.width ?? 0;
  const heightMm = authority?.dieline.heightMm ?? product.cartonSpec?.height ?? 0;
  const records: ParameterRecord[] = [
    {
      ...shared,
      id: "productionWeb.widthMm",
      label: "Dieline sheet width",
      value: widthMm,
      unit: "mm",
      note: measured
        ? "Canonical dieline bounds in millimetres; the source vector is the authority."
        : "Authored dieline sheet width for a legacy panel-rect carton.",
    },
    {
      ...shared,
      id: "productionWeb.repeatMm",
      label: "Dieline sheet height",
      value: heightMm,
      unit: "mm",
      note: measured
        ? "Canonical dieline bounds in millimetres."
        : "Authored dieline sheet height for a legacy panel-rect carton.",
    },
    {
      ...shared,
      id: "productionWeb.laneCount",
      label: "Lane count",
      value: 1,
      unit: "count",
      note: "One carton per exported dieline.",
    },
    {
      id: "productionWeb.segmentBoundaries",
      label: "Panel boundaries",
      provenance: "derived",
      derivedFrom: ["productionWeb.widthMm", "productionWeb.repeatMm"],
      unit: "mm",
      note: measured
        ? "Panel extents extracted from the canonical dieline's cut and crease spans."
        : "Panel extents accumulated from the authored panel rectangles.",
    },
    {
      id: "productionWeb.printableRegions",
      label: "Printable panels",
      provenance: "derived",
      derivedFrom: ["productionWeb.segmentBoundaries"],
      note: "Printable panel faces excluding glue and technical areas.",
    },
  ];
  if (!measured) {
    records.push({
      id: "productionWeb.technicalBandMeaning",
      label: "Glue and technical area operation",
      provenance: "unresolved",
      observed: "Legacy panel-rect carton without an imported vector authority",
      needs: "source-vector",
      note: "Import the production dieline before claiming converter semantics for glue flaps or technical areas.",
    });
  }
  return createProvenanceLedger(product.id, records);
}
