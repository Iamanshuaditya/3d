import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import * as THREE from "three";
import {
  applyStructuralHingeAngles,
  buildPlanarGraph,
  certifyStructuralFoldRuntime,
  createStraightTuckCartonDieline,
  createStructuralTree,
  extractStructuralPanels,
  inspectStructuralConstruction,
  measureFlatPanelEquivalence,
  resolveStructuralRig,
  structuralAssembledPose,
  type StraightTuckCartonParams,
  type StructuralConstructionSpec,
} from "@/lib/structure";

/**
 * Does the structural engine generalise, or is it fitted to one carton?
 *
 * Every golden gate is source-locked to a single licensed lock-bottom carton:
 * its checksum, its 17 panels, its 16 crease chains. Passing them proves that
 * file is reproduced exactly. It cannot prove the engine handles a different
 * construction, because nothing else has ever been through the same pipeline.
 *
 * A straight-tuck carton differs in every way that matters: 13 panels instead
 * of 17, no diagonal lock, and — the demanding part — flap relief gaps that
 * make each flap fold line alternate between cut and crease along one
 * collinear run. The topology stage has to split those runs by classification
 * rather than treating each as a single edge.
 *
 * Authored from parameters, so these fixtures are fully redistributable.
 */

type Case = Readonly<{ label: string; params: Omit<StraightTuckCartonParams, "sourceSha256"> }>;

const CASES: readonly Case[] = [
  {
    label: "tall carton 90 x 60 x 160",
    params: { id: "st-90x60x160", widthMm: 90, depthMm: 60, heightMm: 160, flapMm: 55, glueMm: 15, flapGapMm: 2 },
  },
  {
    label: "squat wide carton 200 x 120 x 70",
    params: { id: "st-200x120x70", widthMm: 200, depthMm: 120, heightMm: 70, flapMm: 110, glueMm: 20, flapGapMm: 3 },
  },
  {
    label: "slim carton 45 x 30 x 120",
    params: { id: "st-45x30x120", widthMm: 45, depthMm: 30, heightMm: 120, flapMm: 26, glueMm: 10, flapGapMm: 1.5 },
  },
];

/** Sole handedness that yields the nominal box with the printed face outside. */
const BODY_ANGLE_DEG = -90;
const FLAP_ANGLE_DEG = 90;

function build(params: Omit<StraightTuckCartonParams, "sourceSha256">) {
  const probe = createStraightTuckCartonDieline({ ...params, sourceSha256: "0".repeat(64) });
  const sha256 = createHash("sha256").update(probe.canonicalParameterJson).digest("hex");
  const layout = createStraightTuckCartonDieline({ ...params, sourceSha256: sha256 });
  const graph = buildPlanarGraph(layout.dieline);
  const panels = extractStructuralPanels(layout.dieline, graph);
  const inventory = inspectStructuralConstruction(layout.dieline, graph, panels);
  return { layout, graph, panels, inventory, sha256 };
}

/** Body panels run left to right; each flapped body panel owns two flaps. */
function constructionSpec(
  built: ReturnType<typeof build>,
): StructuralConstructionSpec {
  const { layout, panels, inventory, sha256 } = built;
  const sorted = [...panels].sort((a, b) => a.bounds.minX - b.bounds.minX);

  // Group panels into horizontal bands. Height is not a safe discriminator: on
  // a squat carton the flaps are taller than the body. The body band is the
  // only one with five panels, because it alone carries the glue seam.
  const bands = new Map<string, typeof sorted>();
  for (const panel of sorted) {
    const key = `${panel.bounds.minY.toFixed(3)}:${panel.bounds.maxY.toFixed(3)}`;
    bands.set(key, [...(bands.get(key) ?? []), panel]);
  }
  const bodyBand = [...bands.values()].find((band) => band.length === 5);
  assert.ok(bodyBand, "a straight-tuck sheet must contain one five-panel body band");
  const bodyPanels = bodyBand;
  const bodyBandTop = bodyPanels[0].bounds.minY;
  const bodyBandBottom = bodyPanels[0].bounds.maxY;

  const sourceOf = (a: string, b: string) => {
    const key = [a, b].sort().join("|");
    const candidate = inventory.hingeCandidates.find(
      (c) => [c.panelAId, c.panelBId].sort().join("|") === key,
    );
    assert.ok(candidate, `no derived hinge joins ${a} and ${b}`);
    return candidate.source;
  };

  const [glue, root, ...rest] = bodyPanels;
  const hinges = [
    { id: "body-seam", parentPanelId: root.id, childPanelId: glue.id, source: sourceOf(root.id, glue.id), assembledAngleDeg: -BODY_ANGLE_DEG },
  ];
  let parent = root;
  for (const [index, panel] of rest.entries()) {
    hinges.push({ id: `body-${index}`, parentPanelId: parent.id, childPanelId: panel.id, source: sourceOf(parent.id, panel.id), assembledAngleDeg: BODY_ANGLE_DEG });
    parent = panel;
  }

  // Each remaining panel is a flap; its parent is the body panel it touches.
  const bodyIds = new Set(bodyPanels.map((p) => p.id));
  for (const panel of panels) {
    if (bodyIds.has(panel.id)) continue;
    const candidate = inventory.hingeCandidates.find(
      (c) => c.panelAId === panel.id || c.panelBId === panel.id,
    );
    assert.ok(candidate, `flap ${panel.id} has no derived hinge`);
    const parentId = candidate.panelAId === panel.id ? candidate.panelBId : candidate.panelAId;
    const isTop = panel.bounds.maxY <= bodyBandTop + 1e-6;
    assert.ok(
      isTop || panel.bounds.minY >= bodyBandBottom - 1e-6,
      `flap ${panel.id} sits neither above nor below the body band`,
    );
    hinges.push({
      id: `flap-${panel.id}`,
      parentPanelId: parentId,
      childPanelId: panel.id,
      source: sourceOf(parentId, panel.id),
      assembledAngleDeg: isTop ? -FLAP_ANGLE_DEG : FLAP_ANGLE_DEG,
    });
  }

  return {
    schemaVersion: 1,
    sourceLock: { canonicalSchemaVersion: 2, dielineId: layout.dieline.id, sha256 },
    rootPanelId: root.id,
    boardThicknessMm: 0.45,
    hinges,
  };
}

function assembled(built: ReturnType<typeof build>) {
  const rig = resolveStructuralRig(built.layout.dieline, built.graph, built.panels, constructionSpec(built));
  const material = new THREE.MeshBasicMaterial();
  const tree = createStructuralTree(built.layout.dieline, built.panels, rig, [material, material, material]);
  applyStructuralHingeAngles(tree, structuralAssembledPose(rig));
  tree.root.updateMatrixWorld(true);
  return { rig, tree };
}

for (const { label, params } of CASES) {
  test(`${label}: the engine decomposes a construction it has never seen`, () => {
    const built = build(params);
    const { expected } = built.layout;
    assert.equal(built.panels.length, expected.panelCount);
    assert.equal(built.inventory.hingeCandidates.length, expected.hingeCount);
    assert.equal(built.inventory.formsTree, true, "the derived hinge graph must be a tree");
    assert.equal(
      built.inventory.unresolvedCreases.length,
      0,
      "every authored crease must resolve to a panel pair",
    );
  });

  test(`${label}: flattened geometry reproduces the authored sheet`, () => {
    const built = build(params);
    const report = measureFlatPanelEquivalence(built.layout.dieline, built.panels);
    assert.equal(report.passesBoundaryGate, true);
    assert.ok(
      report.bidirectionalHausdorffMm < built.layout.dieline.tolerances.boundaryComparisonMm,
      `boundary deviation ${report.bidirectionalHausdorffMm} mm exceeds the gate`,
    );
    assert.ok(
      Math.abs(report.sourceAreaMm2 - report.derivedAreaMm2) < 1e-6,
      "panel union area must equal the source sheet area",
    );
  });

  test(`${label}: folds to its nominal outside dimensions`, () => {
    const built = build(params);
    const { tree } = assembled(built);
    const size = new THREE.Box3().setFromObject(tree.root).getSize(new THREE.Vector3()).multiplyScalar(100);
    const { assembledWidthMm: w, assembledDepthMm: d, assembledHeightMm: h } = built.layout.expected;
    const board = 0.45 * 2 + 0.05;
    assert.ok(Math.abs(size.x - w) <= board, `width ${size.x.toFixed(2)} != ${w}`);
    assert.ok(Math.abs(size.y - d) <= board, `depth ${size.y.toFixed(2)} != ${d}`);
    assert.ok(Math.abs(size.z - h) <= board, `height ${size.z.toFixed(2)} != ${h}`);
    tree.dispose();
  });

  test(`${label}: the printed face ends up outside every panel`, () => {
    const built = build(params);
    const { tree } = assembled(built);
    const centroid = new THREE.Box3().setFromObject(tree.root).getCenter(new THREE.Vector3());
    for (const [id, mesh] of Object.entries(tree.meshes)) {
      const geometry = mesh.geometry;
      const position = geometry.getAttribute("position");
      const normal = geometry.getAttribute("normal");
      const printed = geometry.groups[0];
      const outward = new THREE.Vector3()
        .fromBufferAttribute(normal, printed.start)
        .transformDirection(mesh.matrixWorld)
        .normalize();
      const centre = new THREE.Vector3();
      for (let index = 0; index < position.count; index += 1) {
        centre.add(mesh.localToWorld(new THREE.Vector3().fromBufferAttribute(position, index)));
      }
      centre.multiplyScalar(1 / position.count);
      assert.ok(
        outward.dot(centre.sub(centroid).normalize()) > 0,
        `${id}: the printed face points into the carton`,
      );
    }
    tree.dispose();
  });

  test(`${label}: survives repeated folding without drift`, () => {
    const built = build(params);
    const rig = resolveStructuralRig(
      built.layout.dieline, built.graph, built.panels, constructionSpec(built),
    );
    const certificate = certifyStructuralFoldRuntime(built.layout.dieline, built.panels, rig, 100);
    assert.equal(certificate.passed, true, "100-cycle certificate failed");
    assert.equal(certificate.geometryIdentityStable, true, "geometry was rebuilt during folding");
    assert.equal(certificate.maxFlatWorldMatrixDrift, 0, "flat pose drifted");
  });
}

test("a dieline without a source digest cannot compile a construction", () => {
  assert.throws(
    () => createStraightTuckCartonDieline({
      id: "bad", widthMm: 90, depthMm: 60, heightMm: 160, flapMm: 55, glueMm: 15, flapGapMm: 2,
      sourceSha256: "not-a-digest",
    }),
    /64-character hexadecimal digest/,
    "the generator must fail closed on an invalid digest",
  );
});

test("flap relief gaps wider than the panel are rejected", () => {
  assert.throws(
    () => createStraightTuckCartonDieline({
      id: "bad", widthMm: 90, depthMm: 20, heightMm: 160, flapMm: 55, glueMm: 15, flapGapMm: 12,
      sourceSha256: "a".repeat(64),
    }),
    /consume the whole flap/,
  );
});
