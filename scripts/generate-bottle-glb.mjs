/**
 * Bottle asset factory (SYSTEM A).
 *
 * Produces /public/models/bottle.glb to the Blender-to-Web contract:
 *   PRODUCT_ROOT
 *     ├── BODY         MeshPhysicalMaterial  "BottleBodyMaterial"
 *     ├── CAP          MeshStandardMaterial  "CapMaterial"
 *     └── PRINT_AREA   MeshStandardMaterial  "PrintAreaMaterial"  (UV 0..1, seam at rear)
 *
 * This is normally Blender's job. It is scripted here so the pipeline is
 * reproducible and so the web engine has a valid asset to consume. Replacing
 * this with a Blender-authored GLB requires no application changes, provided
 * the mesh names, scale and UV convention below are preserved.
 *
 * Geometry constants are chosen so the label's circumference:height ratio is
 * exactly 4:1, matching the 2048x512 editor canvas with zero distortion.
 */
import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import fs from "node:fs";
import path from "node:path";

// GLTFExporter's binary path uses the browser FileReader API. Node has Blob but
// not FileReader, so provide the minimal surface the exporter actually touches:
// readAsArrayBuffer() -> result -> onloadend().
if (typeof globalThis.FileReader === "undefined") {
  globalThis.FileReader = class FileReaderPolyfill {
    readAsArrayBuffer(blob) {
      blob
        .arrayBuffer()
        .then((buf) => {
          this.result = buf;
          this.onloadend?.();
        })
        .catch((err) => {
          this.error = err;
          this.onerror?.(err);
        });
    }
  };
}

// ---- Contract constants -----------------------------------------------------
export const BOTTLE = {
  bodyRadius: 0.32,
  labelRadius: 0.325, // 5mm proud of the body: no z-fighting, no visible float
  labelBottom: 0.12,
  labelTop: 0.63, // height 0.51 -> circumference 2.042 -> 4.004:1
  radialSegments: 96,
};

/** Open cylinder with explicitly authored UVs. Seam is placed at the rear (-Z). */
function createLabelGeometry({ radius, bottom, top, radialSegments }) {
  const heightSegments = 1;
  const positions = [];
  const normals = [];
  const uvs = [];
  const indices = [];

  // thetaStart = PI puts u=0 at -Z (rear). Front (+Z) therefore lands at u=0.5,
  // i.e. the horizontal centre of the artwork — where designers expect it.
  const thetaStart = Math.PI;

  for (let iy = 0; iy <= heightSegments; iy++) {
    const v = iy / heightSegments;
    const y = bottom + v * (top - bottom);
    for (let ix = 0; ix <= radialSegments; ix++) {
      const u = ix / radialSegments;
      const theta = thetaStart + u * Math.PI * 2;
      const sin = Math.sin(theta);
      const cos = Math.cos(theta);
      positions.push(radius * sin, y, radius * cos);
      normals.push(sin, 0, cos); // outward
      uvs.push(u, v); // v=0 bottom, v=1 top
    }
  }

  const row = radialSegments + 1;
  for (let iy = 0; iy < heightSegments; iy++) {
    for (let ix = 0; ix < radialSegments; ix++) {
      const a = iy * row + ix;
      const b = a + 1;
      const c = a + row;
      const d = c + 1;
      // Counter-clockwise seen from OUTSIDE the cylinder. Getting this backwards
      // culls the near wall and shows the label's reverse side through the body.
      indices.push(a, b, c, b, d, c);
    }
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(indices);
  return g;
}

/** Bottle silhouette: base bevel, straight body, rounded shoulder, neck, lip. */
function bottleProfile() {
  const pts = [];
  const add = (x, y) => pts.push(new THREE.Vector2(x, y));

  add(0.0, 0.0);
  add(0.28, 0.0);
  add(0.315, 0.018); // base bevel
  add(0.32, 0.05);
  add(0.32, 0.68); // straight body (label lives here)

  // rounded shoulder: quarter-arc from body radius in to the neck
  const shoulderSteps = 14;
  for (let i = 1; i <= shoulderSteps; i++) {
    const t = i / shoulderSteps;
    const a = (t * Math.PI) / 2;
    add(0.32 - (0.32 - 0.135) * Math.sin(a), 0.68 + 0.17 * (1 - Math.cos(a)));
  }

  add(0.135, 0.9); // neck
  add(0.15, 0.915); // lip flare
  add(0.15, 0.95);
  add(0.132, 0.962);
  add(0.0, 0.962); // close the top
  return pts;
}

function build() {
  const root = new THREE.Group();
  root.name = "PRODUCT_ROOT";

  // ---- BODY ----
  const bodyGeo = new THREE.LatheGeometry(bottleProfile(), BOTTLE.radialSegments);
  bodyGeo.computeVertexNormals();
  const bodyMat = new THREE.MeshPhysicalMaterial({
    name: "BottleBodyMaterial",
    color: new THREE.Color("#dfe6ea"),
    roughness: 0.18,
    metalness: 0.0,
    transmission: 0.55,
    thickness: 0.35,
    ior: 1.46,
    clearcoat: 0.5,
    clearcoatRoughness: 0.25,
  });
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.name = "BODY";
  root.add(body);

  // ---- CAP ----
  const capProfile = [];
  capProfile.push(new THREE.Vector2(0.0, 0.9));
  capProfile.push(new THREE.Vector2(0.163, 0.9));
  capProfile.push(new THREE.Vector2(0.168, 0.912));
  capProfile.push(new THREE.Vector2(0.168, 1.03));
  capProfile.push(new THREE.Vector2(0.158, 1.045)); // top bevel
  capProfile.push(new THREE.Vector2(0.0, 1.045));
  const capGeo = new THREE.LatheGeometry(capProfile, BOTTLE.radialSegments);
  capGeo.computeVertexNormals();
  const capMat = new THREE.MeshStandardMaterial({
    name: "CapMaterial",
    color: new THREE.Color("#23282d"),
    roughness: 0.38,
    metalness: 0.15,
  });
  const cap = new THREE.Mesh(capGeo, capMat);
  cap.name = "CAP";
  root.add(cap);

  // ---- PRINT_AREA ----
  const labelGeo = createLabelGeometry({
    radius: BOTTLE.labelRadius,
    bottom: BOTTLE.labelBottom,
    top: BOTTLE.labelTop,
    radialSegments: BOTTLE.radialSegments,
  });
  const labelMat = new THREE.MeshStandardMaterial({
    name: "PrintAreaMaterial",
    color: new THREE.Color("#ffffff"),
    roughness: 0.55,
    metalness: 0.0,
    transparent: true,
    side: THREE.FrontSide,
  });
  const label = new THREE.Mesh(labelGeo, labelMat);
  label.name = "PRINT_AREA";
  root.add(label);

  return root;
}

const root = build();
const outDir = path.join(process.cwd(), "public", "models");
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, "bottle.glb");

const exporter = new GLTFExporter();
exporter.parse(
  root,
  (glb) => {
    fs.writeFileSync(outFile, Buffer.from(glb));
    const circumference = 2 * Math.PI * BOTTLE.labelRadius;
    const labelHeight = BOTTLE.labelTop - BOTTLE.labelBottom;
    let tris = 0;
    root.traverse((o) => {
      if (o.isMesh) tris += o.geometry.index.count / 3;
    });
    console.log(`wrote ${outFile} (${(fs.statSync(outFile).size / 1024).toFixed(1)} KB)`);
    console.log(`triangles: ${tris}`);
    console.log(
      `label circumference ${circumference.toFixed(3)} / height ${labelHeight.toFixed(3)} = ${(
        circumference / labelHeight
      ).toFixed(3)}:1`,
    );
  },
  (err) => {
    console.error("GLB export failed:", err);
    process.exit(1);
  },
  { binary: true },
);
