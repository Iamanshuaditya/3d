# Production lifecycle

Status: browser production PDF generation and the existing print engine remain operational. Persistent server-side `ProductionArtifact` snapshots are planned P4 work and are not yet claimed as complete.

## Existing engine to preserve

The current print modules normalize design state, validate effective PPI/bleed/geometry, generate production PDFs, attach PDF/X-oriented metadata and ICC output intent, and separate technical cut/crease paths. Physical surface definitions remain authoritative.

## Target server workflow

```text
project + exact revision + exact product version
                    │
                    ▼
          server validation/preflight
                    │
                    ▼
        normalized immutable print job
                    │
                    ▼
 PDF / SVG / justified CF2 exporter
                    │
                    ▼
 checksum + stored ProductionArtifact
```

A production artifact will contain project ID/revision, product version/configuration, kind, object-store key, SHA-256, byte size, preflight report, lifecycle status, and timestamps. The public DTO will omit the storage key.

## Immutability

An order or approval references an artifact and the exact project revision that generated it. Editing revision 10 into revision 11 never changes artifact A for revision 10; generating again creates artifact B.

Generation must reject unknown assets, mismatched product versions/configurations, failed preflight, and client-provided production assertions. Price, PPI, dimensions, status, and artifact identity are re-derived or verified server-side.

## Export boundary

Exporters will implement a format-neutral server interface. PDF keeps the current engine. Packaging SVG must derive cut/crease/bleed paths from the same structural geometry used by 2D and 3D. CF2 will only be added after documented format research and interoperability fixtures; Studio will not contain format-specific manufacturing logic.
