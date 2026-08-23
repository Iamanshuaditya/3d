# CFF2 / CF2 manufacturing export research

Research date: 2026-08-23. Status: format research complete enough to design an exporter boundary; production export is **not** implemented or certified.

## Conclusion

CFF2 (Common File Format Revision 2, commonly stored as `.cf2`, `.cff`, or `.cff2`) is a plain-ASCII exchange format for carton/corrugated cutting-die geometry. It can represent manufacturing line types, auxiliary rule types, straight lines, arcs, bridges, text/dimensions, repeated sub-designs, transforms, drawing limits, and metric/imperial geometry.

An in-house writer for Vortex's authoritative cut/crease geometry is technically reasonable. Calling it production-compatible is not reasonable until files round-trip through real target CAD systems and vendor-specific line-type profiles are agreed with manufacturing partners. No maintained, credible, permissively licensed CFF2 packaging parser/writer was found during this research; the visible programmatic implementation found was commercial Aspose.CAD. We should implement a small audited writer, not add an opaque converter dependency, and validate it against Esko/Impact/Prinect fixtures.

## Sources and provenance

The available [Common File Format Revision 2 specification copy](https://forums.autodesk.com/autodesk/attachments/autodesk/autocad-forum-en/16552/1/CFF2%20File%20Format.pdf) is a nine-page document whose PDF metadata dates its creation to 1998 and later modification to 2014. It describes the grammar but does not state modern licensing terms or identify a standards body. It should be treated as a technical reference, not as proof of a freely licensed standard text.

Current vendor documentation confirms continuing packaging use:

- [Esko/Tilia Phoenix](https://docs.tilialabs.com/phoenix/userguide/phoenixoutput/projects/) calls CFF2 an industry-standard cutting format, supports millimeters/inches and character encoding, and exports selected layouts, media, dielines, and marks.
- [Heidelberg Prinect](https://onlinehelp.prinect-lounge.com/Prinect_PDF_Toolbox/Version2021/en/Prinect/CFF2_presettings/CFF2_presettings-1.htm) imports `.cf2`/`.cff`, maps CFF2 line types to PDF spot colors, and permits additional line types.
- [Arden Impact](https://support.ardensoftware.com/support/solutions/articles/101000496474-cff1-cff2) exposes header, pointage precision, mirrored-block compatibility, and customer parameter settings.
- [Esko PackEdge manual](https://docs.esko.com/docs/en-us/packedge/20/userguide/pdf/packedge.pdf) documents CFF2 contour/region export and explicit line-type selection.
- [Aspose.CAD's CF2 API](https://reference.aspose.com/cad/java/com.aspose.cad.fileformats.cf2/package-frame) demonstrates a parser object model, but Aspose is a commercial dependency and not a permissively licensed implementation.

Searches of GitHub, npm, and general package indexes did not locate a maintained permissive CFF2 packaging implementation. Font CFF/CFF2 libraries are unrelated Adobe Compact Font Format implementations and must not be confused with packaging CFF2.

## Wire structure

The specification defines a compact comma-delimited ASCII file. A representative shape is:

```text
$BOF
V2
<optional order/header lines>
END
MAIN,<design-name>
UM
LL,<min-x>,<min-y>
UR,<max-x>,<max-y>
SCALE,1,1
<geometry and subroutine calls>
END
<optional SUB blocks>
$EOF
```

`V2` identifies Revision 2. `UM` selects metric geometry and `UI` imperial geometry. Pointage remains in 1/72-inch points even when geometry units change. Drawing values should be emitted accurately to two decimal places in millimeters; the specification permits up to 0.05 mm arc-center adjustment for rounding.

The historical specification limits non-text syntax to a small ASCII character set, uses commas as delimiters, and recommends stripping spaces/trailing zeros outside text. A conservative writer should emit ASCII, LF line endings, finite decimal numbers, no exponent notation, and normalized `-0` as `0`.

## Geometry records

Straight line:

```text
L,<pointage>,<line-type>,<aux-type>,<sx>,<sy>,<ex>,<ey>,<bridge-count>,<bridge-width>
```

Arc:

```text
A,<pointage>,<line-type>,<aux-type>,<sx>,<sy>,<ex>,<ey>,<cx>,<cy>,<direction>,<bridge-count>,<bridge-width>
```

Text uses a `T` record followed by the text string on the next line. Repeated geometry may be declared in `SUB,<name>` ... `END` blocks and placed with:

```text
C,<sub-name>,<x>,<y>,<angle>,<scale-x>,<scale-y>
```

Negative scale mirrors an inserted block. Arden documents a real compatibility limitation: ArtPro does not accept negative block scales, so Impact optionally bakes mirroring into geometry. Vortex's first writer should flatten transforms and emit positive scale to maximize interoperability.

## Manufacturing line types

The Revision 2 document lists:

| Type | Historical meaning |
| ---: | --- |
| 1 | Cut |
| 2 | Crease |
| 3 | Perforation; auxiliary data carries cut/gap |
| 4 | Score / half-cut |
| 40 | Matrix/Rillma |
| 41 | Zipper |
| 42 | Cut/crease; auxiliary data carries cut/crease/land |
| 43 | Draw, do not burn into die |
| 44 | Burn, do not rule |
| 45 | Safety edge |
| 46 | Dimensions/text |
| 99 | Punch shape |

Auxiliary types qualify rule dimensions/behavior and can depend on customer parameter files. They are not safe to invent globally.

Vendor behavior is not perfectly uniform. Heidelberg's UI documentation labels its predefined types 1-4 as cutting, creasing, perforating, and cutting/creasing, while the historical document and modern Esko material distinguish type 4 half-cut from type 42 cut/crease. Therefore Vortex must use a named manufacturing `Cff2Profile`; it must not bury a universal integer mapping in the geometry model.

Initial profile proposal:

```ts
type Cff2Profile = {
  id: string;
  units: "mm" | "in";
  lineTypes: {
    cut: { type: number; auxiliaryType: number; pointage: number };
    crease: { type: number; auxiliaryType: number; pointage: number };
    perforation?: { type: number; auxiliaryType: number; pointage: number };
  };
  flattenMirrors: boolean;
  decimalPlaces: number;
};
```

## Fit with Vortex

CFF2 must derive from the same structural paths used by the carton editor, procedural 3D geometry, unfolding, PDF, and SVG. The exporter receives normalized physical manufacturing geometry; it never reads React state, Three.js meshes, or screen coordinates.

```ts
interface ProductionExporter<TResult> {
  readonly format: "pdf" | "svg" | "cff2";
  supports(job: NormalizedProductionJob): boolean;
  export(job: NormalizedProductionJob): Promise<TResult>;
}
```

The authoritative intermediate should distinguish open/closed path primitives and semantic operations (`cut`, `crease`, optional `perforation`) in millimeters. PDF/SVG/CFF2 adapters serialize that one model.

## Recommended implementation scope

Phase 1 writer:

- one flattened `MAIN` design;
- `UM` metric output;
- explicit bounds and positive scale;
- finite straight lines and circular arcs;
- profile-mapped cut and crease records;
- no order/customer header;
- no text, dimensions, punches, bridges, or subroutines unless a target partner requires them;
- deterministic ordering and decimal formatting;
- checksum and exporter metadata stored with the production artifact.

Phase 2 should only follow partner fixtures and may add perforation, bridges, repeated layouts/subroutines, imperial output, or customer auxiliary mappings.

## Acceptance before enabling downloads

1. Obtain known-good cut/crease fixtures from at least two target CAD systems or manufacturing partners.
2. Import Vortex output into those systems and re-export it.
3. Compare bounds, units, path count, endpoints, arc centers/direction, and semantic line types within explicit tolerances.
4. Confirm that no cut path becomes crease/half-cut and vice versa.
5. Validate mirrored/chiral cartons with physical outside-print orientation fixtures.
6. Reject non-finite coordinates, unsupported curve primitives, unclosed required contours, and unknown semantic operations.
7. Store the exact product version, project revision, exporter/profile version, bytes, and SHA-256 as an immutable artifact.

Until those checks pass, UI language must say “experimental CFF2” or omit the download entirely. PDF and authoritative SVG remain the safer first manufacturing outputs.
