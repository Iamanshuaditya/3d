import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { test } from "node:test";

const source = readFileSync(new URL("../../public/embed/vortex-embed.js", import.meta.url), "utf8");
const editorUrl = "https://vortex.example.test/embed/store/coffee-cup?host=https%3A%2F%2Fshop.example.test&session=session-1#token=temporary-browser-capability";

type Listener = (event: { origin: string; source: unknown; data: unknown }) => void;
class Element {
  style: Record<string, string> = {};
  attributes: Record<string, string> = {};
  children: Element[] = [];
  parentNode: Element | null = null;
  src = "";
  contentWindow = { postMessage: (message: unknown, origin: string) => { this.sent.push({ message, origin }); } };
  sent: { message: unknown; origin: string }[] = [];
  setAttribute(key: string, value: string) { this.attributes[key] = value; }
  appendChild(child: Element) { child.parentNode = this; this.children.push(child); }
  removeChild(child: Element) { this.children = this.children.filter((entry) => entry !== child); child.parentNode = null; }
}
function fixture() {
  const listeners = new Set<Listener>();
  const context = {
    window: {
      location: { origin: "https://shop.example.test" },
      addEventListener: (_type: string, listener: Listener) => listeners.add(listener),
      removeEventListener: (_type: string, listener: Listener) => listeners.delete(listener),
    },
    document: { createElement: () => new Element() }, URL, Number, Array,
  };
  runInNewContext(source, context);
  const sdk = (context.window as typeof context.window & { Vortex: {
    mount: (container: Element, options: Record<string, unknown>) => { iframe: Element; complete: () => void; destroy: () => void };
  } }).Vortex;
  const container = new Element();
  const send = (frame: Element, payload: object, origin = "https://vortex.example.test", messageSource: unknown = frame.contentWindow) => {
    for (const listener of listeners) listener({ origin, source: messageSource, data: { namespace: "vortex-embed", version: 1, payload } });
  };
  return { sdk, container, listeners, send };
}

test("the loader accepts completion only from the launched frame, origin and session", () => {
  const f = fixture();
  const received: unknown[] = [];
  const mounted = f.sdk.mount(f.container, { editorUrl, onComplete: (value: unknown) => received.push(value) });
  assert.equal(mounted.iframe.src, editorUrl);
  const payload = { type: "completed", sessionId: "session-1", result: { sessionId: "session-1", status: "ready", revision: 7 } };
  f.send(mounted.iframe, payload, "https://evil.test");
  f.send(mounted.iframe, payload, undefined, {});
  f.send(mounted.iframe, { ...payload, sessionId: "another-session" });
  f.send(mounted.iframe, { ...payload, result: { sessionId: "another-session" } });
  assert.equal(received.length, 0);
  f.send(mounted.iframe, payload);
  assert.deepEqual(received, [payload.result]);
  mounted.complete();
  assert.equal(mounted.iframe.sent[0].origin, "https://vortex.example.test");
  assert.equal((mounted.iframe.sent[0].message as { payload: { type: string } }).payload.type, "complete");
  mounted.destroy();
  assert.equal(f.listeners.size, 0);
  assert.equal(f.container.children.length, 0);
});

test("the loader rejects unsafe URLs and sessions created for another host", () => {
  const f = fixture();
  for (const invalid of [editorUrl.replace("shop.example.test", "evil.test"), editorUrl.replace("https://vortex", "javascript://vortex"), editorUrl.replace("/embed/store/coffee-cup", "/account"), editorUrl.replace("https://vortex", "https://user:pass@vortex")]) {
    assert.throws(() => f.sdk.mount(f.container, { editorUrl: invalid }));
  }
  assert.equal(f.container.children.length, 0);
});

test("existing inline integrations retain product/options and the legacy completion contract", () => {
  const f = fixture();
  const results: unknown[] = [];
  const mounted = f.sdk.mount(f.container, { baseUrl: "https://vortex.example.test", client: "store", product: "coffee-cup", options: { material: "paper" }, onComplete: (value: unknown) => results.push(value) });
  const url = new URL(mounted.iframe.src);
  assert.equal(url.pathname, "/embed/store/coffee-cup");
  assert.equal(url.searchParams.get("host"), "https://shop.example.test");
  assert.deepEqual(JSON.parse(url.searchParams.get("options")!), { material: "paper" });
  const completed = { type: "completed", projectId: "project-1", revision: 3 };
  f.send(mounted.iframe, completed);
  assert.deepEqual(results, [completed]);
});
