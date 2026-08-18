// Capture front + 3/4 + side of a pouch product, composited into one strip.
import { chromium } from "playwright-core";
const id = process.argv[2];
const b = await chromium.launch({ channel: "chrome", headless: true });
const p = await b.newPage({ viewport: { width: 1700, height: 1000 } });
await p.goto(`http://localhost:3000/studio?product=${id}`, { waitUntil: "networkidle", timeout: 120000 });
await p.waitForTimeout(6500);
await p.screenshot({ path: `/tmp/v-${id}-initial.png` });
// orbit: drag on the 3D panel to get a lower/front view like the user's
const cx = 1390, cy = 520;
await p.mouse.move(cx, cy); await p.mouse.down();
await p.mouse.move(cx - 260, cy + 60, { steps: 15 }); await p.mouse.up();
await p.waitForTimeout(1200);
await p.screenshot({ path: `/tmp/v-${id}-orbit.png` });
await b.close();
console.log("views saved", id);
