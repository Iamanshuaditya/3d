import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const STUDIO_SHELL = new URL("../../src/components/studio/StudioShell.tsx", import.meta.url);
const PRESENTATION = new URL("../../src/lib/configurator/presentation.ts", import.meta.url);

test("fold state never owns a Studio camera preset", async () => {
  const [studio, presentation] = await Promise.all([
    readFile(STUDIO_SHELL, "utf8"),
    readFile(PRESENTATION, "utf8"),
  ]);

  assert.doesNotMatch(studio, /dielineCameraPreset/);
  assert.doesNotMatch(studio, /defaultCameraPreset/);
  assert.doesNotMatch(studio, /wasFlatRef|movedCameraRef/);
  assert.doesNotMatch(studio, /useEffect\s*\([^)]*unfold\.status\?\.isFlat/);

  // The only remaining preset mutations clear a preset after an explicit
  // camera action finishes. Fold state may still drive `dielineView`, which is
  // a structural/material presentation flag and deliberately not a camera
  // mutation.
  const presetCalls = [...studio.matchAll(/setPendingPreset\(([^)]*)\)/g)].map(
    (match) => match[1].trim(),
  );
  assert.deepEqual(
    presetCalls,
    ["null", "null"],
    "Studio may clear an explicit camera preset, but folding must not assign one",
  );
  assert.match(studio, /dielineView=\{Boolean\(unfold\.status\?\.isFlat\)\}/);

  assert.doesNotMatch(presentation, /dielineCameraPreset|defaultCameraPreset/);
  assert.match(
    presentation,
    /Camera state is deliberately absent from this contract/,
    "the presentation contract should document the camera/fold separation",
  );
});
