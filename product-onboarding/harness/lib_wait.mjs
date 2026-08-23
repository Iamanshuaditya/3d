/**
 * Wait until a studio product is actually on screen.
 *
 * The 3D column paints its canvas element before the model exists, and the
 * "Loading 3D preview…" overlay can appear a beat AFTER the canvas does — so a
 * single absence check races the fallback and photographs a spinner. Require
 * the overlay to be absent across consecutive polls instead.
 */
export async function waitForModel(page, { timeout = 90000 } = {}) {
  await page.waitForSelector("section[aria-label='3D preview'] canvas", { timeout });
  const deadline = Date.now() + timeout;
  let clear = 0;
  while (Date.now() < deadline) {
    const loading = await page.evaluate(() =>
      document.body.innerText.includes("Loading 3D preview"),
    );
    clear = loading ? 0 : clear + 1;
    if (clear >= 4) {
      await page.waitForTimeout(1500);
      return;
    }
    await page.waitForTimeout(400);
  }
  throw new Error("timed out waiting for the 3D preview to finish loading");
}
