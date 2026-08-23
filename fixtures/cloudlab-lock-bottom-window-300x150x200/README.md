# Local Golden Reference Fixture

This directory records the benchmark contract for the 300 x 150 x 200 mm
"Lock Bottom and top incl. window" carton without redistributing the supplied
PDF or screenshots.

## Licensing and provenance

The source was supplied in an authorized user workspace for analysis. No
licence or ownership evidence currently permits committing competitor/reference
assets to this public repository.

Do not commit:

- the source PDF;
- reference screenshots or videos;
- extracted artwork;
- coordinate-for-coordinate traced replacements.

## Local acquisition

1. Obtain the PDF through an account or source you are authorized to use.
2. Copy it to this directory as `source.local.pdf`.
3. Verify it before running golden checks:

   ```bash
   shasum -a 256 source.local.pdf
   wc -c source.local.pdf
   ```

4. The values must match `reference-manifest.json` exactly.
5. Place private screenshot/video evidence under `reference-images/` or
   `private/`. Generated local comparison artifacts belong under `output/`.

All of those locations are ignored by this fixture's narrow `.gitignore`.

## What may be committed

- The hash and object-count manifest.
- Audit documentation and importer expectations.
- Independently authored diagnostic artwork.
- Independently authored public fixtures covering equivalent topology.

If redistribution permission is later confirmed, add explicit licence and
provenance documentation before changing this policy.

## Exact source expectations

The local source is a one-page true vector PDF with:

- no raster images or text;
- one 70-edge outer cut cycle;
- one 8-edge chamfered window cycle;
- 24 crease source segments;
- named `/DieCutBlue`, `/DieCutRed`, and `/DieCutGreen` separations;
- an approximately 712.4 x 470.0 mm cut envelope;
- deliberate approximately 0.3 mm details that must survive normalization.

See `reference-manifest.json` and
`../../docs/structural-engine/REFERENCE-INVENTORY.md` for complete evidence.

## Construction metadata status

No fold metadata is committed here. Fold direction, angles, hierarchy,
sequence, seam, lock/tuck destinations, stock, and print-side convention need
authored manufacturing validation. Until then, consumers must report that
construction metadata is required rather than guessing.
