# Structural Packaging Finalization

This branch is the maker/checker boundary for the structural-packaging V2 work.

## Scope

- keep fold transforms independent from camera/orbit state;
- preserve canonical dieline authority through editor, exact structural mesh,
  UVs and manufacturing output;
- preserve the reviewed hash-locked golden topology profile without modifying
  source CAD vectors;
- keep unknown construction semantics explicit rather than inferred silently;
- run lint, typecheck, the full test suite and a production build in GitHub
  Actions before merge;
- update `QUALITY_STATE.md`, `quality-run-log.md` and `quality-report.json` from
  observed evidence, not implementation claims.

## Golden reference handling

The authorized reference PDF is intentionally not committed. Its SHA-256 is
locked in code and the local verifier/inspector accepts the authorized file as
an argument. Source-derived screenshots, construction inventories and reports
must remain local unless redistribution permission is established.

## Stop condition

Do not call the golden product PASS until exact geometry, window ownership,
flat equivalence, UV round-trip, construction metadata, fold-state behavior,
visual evidence and regression gates all have evidence. CI passing is required
but is not by itself the product-level quality score.
