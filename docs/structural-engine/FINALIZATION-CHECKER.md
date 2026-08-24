# Finalization Checker Protocol

The implementation agent does not approve this branch. The checker uses the
pull-request diff plus CI evidence and reports only PASS, FAIL, BLOCKED, or
NEEDS_REFERENCE.

Required independent checks:

1. No fold-state code changes camera/orbit state.
2. Structural Studio rendering resolves canonical panel meshes when structural
   authority exists and preserves legacy rendering otherwise.
3. Manufacturing geometry reads canonical structural authority and cannot fall
   back to a conflicting legacy dieline for that product.
4. Golden topology repair is source-hash locked, topology-only, <= 0.02 mm and
   exactly four endpoint-to-span repairs for the reviewed PDF.
5. Construction authoring derives adjacency only and leaves direction, angles,
   root, thickness and sequence unresolved until evidence is supplied.
6. Dieline technical linework remains non-printing UI and visually thin.
7. Lint, TypeScript, full tests and production build pass in a clean CI runner.
8. `quality-report.json` remains BLOCKED until golden construction and visual
   acceptance evidence exist; CI success alone must not turn it into PASS.
