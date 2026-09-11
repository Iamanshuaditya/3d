# Blender stand-up pouch

Open **Stand-up pouch · Blender master** in the product library at `/`. Its card opens the shared Studio at `/?product=blender-pouch-v3-preview`. `/route` points to the same root entry point, and `/test/pouch` redirects to this editor. `/studio` preserves product, project, version and options while redirecting to root; `/test` returns to the library.

There is one editor shell and one shared preview viewport. Inflation, Flat/Filled, Animate/Pause, Default, camera views and Satin/Gloss live beside the same artwork tools used by the other library products. Full-screen preview shares the editor's inflation and finish state. Cartons retain their existing unfold/refold stages; these controls never claim that the pouch's empty pose is a manufacturing dieline.

The preview uses the exported Blender master directly. Its `Inflation` morph runs from flat film at 0 to the filled pouch at 1. Width is 180 mm, height is 260 mm, full base depth is approximately 44 mm, and the gusset floor is inset by 8.3 mm. Side heat seals remain straight. The underside has a smooth centre and a rounded perimeter collar; the zipper is part of the film surface.

## Artwork and guides

The existing Studio editor drives one 2256 × 720 artwork canvas. The 564 × 180 mm sheet runs continuously **front → bottom gusset → back**, with section lengths 260, 44 and 260 mm. Front and gusset content turns -90° on the sheet; back content turns +90°. All three regions read correctly from outside the assembled pouch. Shared UVs preserve artwork across both face/gusset joins. The single outer contour is a cut guide; the two joins and central gusset fold are dashed fold guides.

This arrangement follows the [VistaPrint US stand-up pouch template](https://www.vistaprint.com/packaging/custom-pouches/stand-up-pouches), inspected under Specs & Templates on September 7, 2026. The downloaded 3.25 × 4.75 × 2 inch variant confirms one horizontal film strip. Our sheet uses the authored Blender model's dimensions and outlines; VistaPrint's size-specific bleed and safe-area dimensions are not copied into this different format.

The GLB carries UVs and the `Inflation` morph. `generated/blender-pouch-v3.json` records the GLB checksum, panel bounds and guide polylines extracted from Blender's UV boundaries and material transitions. The same coordinates drive the editor and downloadable SVG. Editor labels, selection boxes and technical guides are excluded from the downloadable artwork PNG.

This is an authored visual model and UV atlas. It is not a manufacturer-approved production web. The library registers a versioned preview product, and `previewOnly` keeps its artwork in memory rather than saving a project. The header says **Session only** and provides artwork PNG, GLB and guide SVG downloads. Download the artwork PNG before leaving. The native Blender file remains the editable master.

## Export from Blender

Open `Stand-Up Pouch - Straight Sides Deep Gusset.blend`, select its main `Scene`, and run `scripts/blender/export_stand_up_pouch.py` in Blender. For example, Blender's Python console can run `exec(compile(open(path).read(), path, 'exec'), {'__file__': path})` with `path` set to that script's absolute path.

The exporter evaluates the same subdivision at both poses, constructs a baked mesh with an explicit morph target, and exports only the selected object in the active scene. Blender's **Apply Modifiers** export option would discard the shape key, so it stays off. The master keeps its editable subdivision and laminate-thickness modifiers. The closed browser shell uses a single exterior surface.

The exporter writes the GLB and manifest together. Its V coordinates already follow glTF conventions; the canvas texture uses `flipY=false`. The GLB URL includes the manifest checksum so a new export cannot silently reuse the previous browser cache entry.

## Validation

Run `npx tsx --test tests/pacdora-lab/blender-pouch.test.ts` to verify the export's single-object boundary, checksum, morph topology, straight rails, flat/filled depth, inset floor, artwork orientation, continuous base joins and single sheet outline. The face-orientation and continuous-join regressions failed against the previous square atlas and passed after the horizontal remap. The earlier underside-winding regression also failed before its correction.

Browser checks completed with front demo artwork, readable back and underside labels, 0/50/100% inflation, fixed view presets, horizontal SVG download and clean 2256 × 720 PNG download. Blender front, side, underside and hero renders were inspected during the geometry revision. These checks concern the visual asset, not manufacturing certification.

Lint, TypeScript and the production build pass. The repository-wide test run has seven existing job-queue failures in `shared-coordination.test.ts`, reproduced on an untouched checkout of `7e7dc53`. Those tests claim jobs using a fixed August 29, 2026 clock while enqueue defaults to the current date. The nine PostgreSQL integration tests require their external database and are skipped locally.
