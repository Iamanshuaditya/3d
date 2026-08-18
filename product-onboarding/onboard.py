"""Product onboarding CLI.

  python onboard.py inspect products/<id>            # capability report
  python onboard.py build   products/<id>            # manifest -> GLB + metadata + templates
  python onboard.py validate products/<id>           # mathematical UV validation

Requires: trimesh numpy pillow pygltflib (see requirements.txt).
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from lib import build as build_mod
from lib import assets as assets_mod
from lib import inspector
from lib import validate_math


def main() -> int:
    if len(sys.argv) < 3:
        print(__doc__)
        return 1
    cmd, product_dir = sys.argv[1], Path(sys.argv[2])
    if cmd == "inspect":
        manifest = product_dir / "manifest.json"
        source = (json.loads(manifest.read_text())["source"]
                  if manifest.exists() else "source.glb")
        rep = inspector.inspect_glb(product_dir / source)
        out = product_dir / "inspection.json"
        out.write_text(json.dumps(rep, indent=2))
        for m in rep["meshes"]:
            uv = m["uv"]
            uvs = (f"charts={uv['charts']} cov={uv['coverage']} ovl={uv['overlap_fraction']}"
                   if uv["present"] else "NO-UV")
            print(f"{m['node']:24} faces={m['faces']:7} {m['shape']['class']:18} "
                  f"{uvs:40} -> {m['recommended_strategy']}")
        print(f"\nwrote {out}")
    elif cmd == "build":
        regions = build_mod.build(product_dir)
        product = assets_mod.gen_assets(product_dir)
        print(json.dumps({"regions": [r["id"] for r in regions["regions"]],
                          "surfaces": [s["id"] for s in product["editableSurfaces"]],
                          "glb": str(product_dir / "product-customizable.glb")}, indent=2))
    elif cmd == "integrate":
        import shutil
        repo = Path(__file__).parent.parent
        product = json.loads((product_dir / "product.json").read_text())
        glb_dst = repo / "public/models" / f"{product['id']}-customizable.glb"
        shutil.copy(product_dir / "product-customizable.glb", glb_dst)
        gen_dir = repo / "src/lib/configurator/generated"
        gen_dir.mkdir(exist_ok=True)
        shutil.copy(product_dir / "product.json", gen_dir / f"{product['id']}.product.json")
        print(f"copied GLB -> {glb_dst}\ncopied product.json -> {gen_dir}")
        print("Register it in product-config.ts via onboardedProduct(...) if not already.")
    elif cmd == "validate":
        result = validate_math.validate(product_dir)
        print(json.dumps(result, indent=2))
        return 0 if result["passed"] else 2
    else:
        print(__doc__)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
