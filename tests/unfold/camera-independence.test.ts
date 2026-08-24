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
  assert.doesNotMatch(
    studio,
    /unfold\.status\?\.isFlat[\s\S]{0,1200}setPendingPreset/,
    "flat/fold state must not trigger a camera preset",
  );

  assert.doesNotMatch(presentation, /dielineCameraPreset|defaultCameraPreset/);
  assert.match(
    presentation,
    /Camera state is deliberately absent from this contract/,
    "the presentation contract should document the camera/fold separation",
  );
});
