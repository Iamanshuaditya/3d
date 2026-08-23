import { test } from "node:test";
import assert from "node:assert/strict";
import { CARTONS } from "@/lib/configurator/carton-spec";
import { cartonCanFlatten, cartonHinges } from "@/lib/configurator/carton-topology";
import {
  anglesAtStage,
  cartonUnfoldPlan,
  derivedPlan,
  validateUnfoldPlan,
} from "@/lib/configurator/unfold-plan";
import { resolveProductPresentation } from "@/lib/configurator/presentation";
import { PRODUCTS } from "@/lib/configurator/product-config";
import type { UnfoldPlan } from "@/types/unfold";

const mailer = CARTONS["mailer-box"];
const burger = CARTONS["burger-box"];

test("every registered carton produces a structurally valid plan", () => {
  for (const spec of Object.values(CARTONS)) {
    const hinges = cartonHinges(spec);
    const plan = cartonUnfoldPlan(spec);
    assert.ok(plan, `${spec.id} has no plan`);
    const errors = validateUnfoldPlan(plan!, hinges);
    assert.deepEqual(errors, [], `${spec.id}: ${errors.join(" ")}`);
  }
});

test("a flattenable carton's plan ends with every hinge flat", () => {
  const plan = cartonUnfoldPlan(mailer)!;
  assert.equal(plan.reachesFlat, true);
  const final = anglesAtStage(plan, plan.steps.length);
  for (const hinge of cartonHinges(mailer)) {
    assert.equal(final[hinge.id], hinge.flatAngleDeg, `${hinge.id} is not flat`);
  }
});

test("stage 0 is the assembled pose and stages are absolute, not cumulative", () => {
  const plan = cartonUnfoldPlan(mailer)!;
  const hinges = cartonHinges(mailer);
  const assembled = anglesAtStage(plan, 0);
  for (const hinge of hinges) {
    assert.equal(assembled[hinge.id], hinge.assembledAngleDeg);
  }
  // Recomputing a stage always yields the same pose regardless of the route
  // taken to it — this is what makes mid-animation clicking safe.
  assert.deepEqual(anglesAtStage(plan, 3), anglesAtStage(plan, 3));
  assert.deepEqual(anglesAtStage(plan, 99), anglesAtStage(plan, plan.steps.length));
  assert.deepEqual(anglesAtStage(plan, -5), anglesAtStage(plan, 0));
});

test("the mailer's authored sequence opens the lid before flattening anything", () => {
  const plan = cartonUnfoldPlan(mailer)!;
  assert.equal(plan.source, "authored");
  assert.equal(plan.steps[0].id, "open");
  assert.equal(anglesAtStage(plan, 1).LID_TOP, mailer.lidOpenAngle);
  // The tray is untouched until the lid assembly is down.
  const afterLid = anglesAtStage(plan, 4);
  assert.equal(afterLid.LID_TOP, 0);
  assert.equal(afterLid.BACK, 90);
  assert.equal(afterLid.LEFT, 90);
});

test("derived fallback orders children before their parents", () => {
  const hinges = cartonHinges(mailer);
  const plan = derivedPlan(hinges);
  assert.equal(plan.source, "derived");
  assert.equal(plan.reachesFlat, true);
  assert.deepEqual(validateUnfoldPlan(plan, hinges), []);

  const flattenStage = (id: string) =>
    plan.steps.findIndex((step) => step.targets[id] === 0);
  assert.ok(flattenStage("LID_TUCK") < flattenStage("LID_TOP"));
  assert.ok(flattenStage("LID_TOP") < flattenStage("BACK"));
  assert.ok(flattenStage("DUST_BL") < flattenStage("LEFT"));
});

test("the dependency rule rejects a parent that flattens before its child", () => {
  const hinges = cartonHinges(mailer);
  const bad: UnfoldPlan = {
    assembled: Object.fromEntries(hinges.map((h) => [h.id, h.assembledAngleDeg])),
    steps: [
      { id: "walls", label: "Walls", targets: { LEFT: 0 } },
      { id: "flaps", label: "Flaps", targets: { DUST_BL: 0 } },
    ],
    reachesFlat: false,
    source: "authored" as const,
  };
  const errors = validateUnfoldPlan(bad, hinges);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /DUST_BL.*parent.*LEFT/);
});

test("an unknown hinge id in an authored step fails loudly", () => {
  assert.throws(
    () =>
      cartonUnfoldPlan({
        ...mailer,
        unfold: {
          mode: "hinge-graph",
          steps: [{ id: "x", label: "x", hingeIds: ["NOT_A_PANEL"], to: "flat" }],
        },
      }),
    /not in the articulation graph/,
  );
});

test("only the primary articulation can target the open pose", () => {
  assert.throws(
    () =>
      cartonUnfoldPlan({
        ...mailer,
        unfold: {
          mode: "hinge-graph",
          steps: [{ id: "x", label: "x", hingeIds: ["LEFT"], to: "open" }],
        },
      }),
    /has no open angle/,
  );
});

// ---------------------------------------------------------------- capability

test("the tapered clamshell reports open-close, never progressive unfolding", () => {
  // Its trays are generated shells, not folding dieline panels, so it has no
  // honest flat pose. Claiming one would animate a lie.
  assert.equal(cartonCanFlatten(burger), false);
  const plan = cartonUnfoldPlan(burger)!;
  assert.equal(plan.steps.length, 1);
  assert.equal(plan.reachesFlat, false);
  assert.equal(resolveProductPresentation(PRODUCTS["burger-box-001"]).mode, "open-close");
});

test("a construction that cannot flatten may not author an unfold sequence", () => {
  assert.throws(
    () =>
      cartonUnfoldPlan({
        ...burger,
        unfold: {
          mode: "hinge-graph",
          steps: [{ id: "x", label: "x", hingeIds: ["LID_ASSEMBLY"], to: "flat" }],
        },
      }),
    /cannot reach a flat dieline/,
  );
});

test("presentation is derived per product, and non-articulated products get no control", () => {
  assert.equal(resolveProductPresentation(PRODUCTS["mailer-box-001"]).mode, "progressive-unfold");
  for (const id of ["bottle-001", "pouch-001", "mug", "soda-can", "meshy-pouch-001"]) {
    assert.equal(resolveProductPresentation(PRODUCTS[id]).mode, "static", id);
  }
});

test("declared-but-undriveable GLB articulation is reported, not silently dropped", () => {
  const presentation = resolveProductPresentation({
    ...PRODUCTS["mug"],
    articulation: { mode: "glb-nodes", hinges: [] },
  });
  assert.equal(presentation.mode, "unsupported");
});
