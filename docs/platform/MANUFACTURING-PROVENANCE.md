# Manufacturing-fact provenance

Issue #24. A convincing 3D preview and a certified manufacturing claim are not
the same thing, and the difference is invisible in a plain number. A `110` that
came off a client web drawing and a `78` that exists only to make a pouch look
filled have the same type, the same unit, and completely different standing.

This module records where every critical value came from, and refuses
production claims that rest on values which cannot support them.

## The five statuses

| Status | Meaning | May back a production claim |
|---|---|---|
| `measured` | Read from a client/manufacturer source document | yes |
| `derived` | Computed exactly from other certifiable parameters | yes |
| `authored` | Chosen and approved by a human against a stated basis | yes |
| `assumed` | A visual preview assumption | **no** |
| `unresolved` | Observed in the source, meaning not established | **no** |

A `derived` record names the parameters it is computed from, and the ledger
refuses to build if any of them is `assumed` or `unresolved`. Without that rule
a preview number could re-enter the ledger wearing a certifiable label, which
is precisely the blurring this exists to stop.

## Values that must never collapse into each other

- nominal finished width vs production web width
- unfolded gusset web vs opened/filled visual body depth
- technical/slitting bands vs the printable artwork region
- measured dieline semantics vs visual 3D relief

The Nexibles RSTZ fixture keeps all four pairs apart, and
`tests/platform/manufacturing-provenance.test.ts` fails if any of them merges.

## Claims and scope

`PACKAGING_CLAIMS` states, centrally, what production output asserts. Each
claim names the exact parameters it stands on, so adding an export path cannot
quietly introduce an unchecked assertion.

- **`production-output` scope** — asserted by the print-ready sheet. A refused
  claim is a preflight **error** and the export fails closed.
- **`preview` scope** — asserted only by the 3D view. A refused claim is
  recorded as **info** and never blocks anything.

A claim whose parameters are entirely absent from a ledger is *not applicable*
rather than refused: an apparel GLB has no printed film web, and refusing its
export for a claim it never makes would be a false positive, not caution.
Declaring *some* of a claim's parameters and not the rest stays applicable, so
a genuine gap still blocks.

## Certified output metadata

`PreflightReport.provenance` carries the claims an artifact is entitled to
make. It is built by filtering supported claims out of the ledger, never
assembled by hand, so an assumed or unresolved parameter has no path into
certified metadata. Refusals stay recorded alongside, rather than being
dropped.

## Where to look

| Concern | File |
|---|---|
| Vocabulary and record types | `src/types/provenance.ts` |
| Ledger construction and validation | `src/lib/provenance/ledger.ts` |
| Claim registry and evaluation | `src/lib/provenance/claims.ts` |
| Pouch spec → ledger | `src/lib/provenance/pouch-ledger.ts` |
| Product config → ledger | `src/lib/provenance/resolve-provenance.ts` |
| Operator diagnostics view | `src/lib/provenance/diagnostics.ts` |
| Preflight gate | `src/lib/print/provenance-preflight.ts` |

Operators see the ledger per product on `/admin/products`: the status counts,
each claim's state, the outstanding unresolved semantics with what each one
needs, and the preview assumptions listed apart from the measured facts.

## Adding a product

1. Record measured values with the source that establishes them.
2. Record anything the source shows but does not explain as `unresolved`, with
   `needs` set to what would settle it. Do not guess.
3. Record preview-only values as `assumed`. They are allowed and expected;
   they simply cannot back a production claim.
4. Run the product through `/admin/products` and confirm the ledger reads the
   way the source actually reads.
