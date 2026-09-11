"use client";

import { useEffect, useState } from "react";
import { ArrowRight, ArrowUpRight, Check, Download, Send } from "lucide-react";
import { FEATURED_PRODUCTS } from "@/lib/configurator/library-showcase";
import { ProductPoster } from "@/components/gallery/ProductPoster";
import type { EditorSessionLaunch, EditorSessionResult } from "@/lib/embed/editor-session-types";

const SESSION_ENDPOINT = "/api/demo/editor-session";
const DEMO_STORAGE_KEY = "vortex-api-demo-session";
type ApiResponse = { status: number; statusText: string; durationMs: number; body: unknown; request?: unknown };
type DemoSnapshot = { launch: EditorSessionLaunch; response: ApiResponse | null; autoOpen: boolean };

function responseJson(response: ApiResponse) {
  return JSON.stringify(response.body, (key: string, value: unknown) =>
    key === "editorUrl" && typeof value === "string" ? value.replace(/#.*$/, "#token=[hidden]") : value, 2);
}

export function IntegrationDemo({ enabled }: { enabled: boolean }) {
  const [productId, setProductId] = useState("blender-pouch-v3-preview");
  const [hostOrigin, setHostOrigin] = useState("");
  const [autoOpen, setAutoOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [apiResponse, setApiResponse] = useState<ApiResponse | null>(null);
  const [launch, setLaunch] = useState<EditorSessionLaunch | null>(null);
  const [result, setResult] = useState<EditorSessionResult | null>(null);
  const [returnStatus, setReturnStatus] = useState<string | null>(null);
  const feature = FEATURED_PRODUCTS.find((product) => product.productId === productId)!;
  const requestBody = { productId, ...(hostOrigin ? { hostOrigin, returnUrl: `${hostOrigin}/developers/demo` } : {}),
    referenceId: "client-demo", ...(launch?.productId === productId ? { resumeSessionId: launch.sessionId } : {}) };

  useEffect(() => {
    let active = true;
    async function restoreSession() {
      setHostOrigin(window.location.origin);
      setReady(true);
      try {
        const raw = sessionStorage.getItem(DEMO_STORAGE_KEY);
        if (!raw) return;
        const cached = JSON.parse(raw) as DemoSnapshot;
        if (!cached.launch || !FEATURED_PRODUCTS.some((product) => product.productId === cached.launch.productId)) return;
        const returnedId = new URLSearchParams(window.location.search).get("vortexSessionId");
        if (returnedId && returnedId !== cached.launch.sessionId) return;
        setProductId(cached.launch.productId);
        setLaunch(cached.launch);
        setApiResponse(cached.response);
        setAutoOpen(cached.autoOpen);
        const token = new URLSearchParams(new URL(cached.launch.editorUrl).hash.slice(1)).get("token") ?? "";
        const response = await fetch(`${SESSION_ENDPOINT}?sessionId=${encodeURIComponent(cached.launch.sessionId)}`, {
          headers: { "x-vortex-session": token }, cache: "no-store",
        });
        if (!active) return;
        if (!response.ok) throw new Error("Send the API request again to renew this session and continue your design.");
        const data = await response.json() as { result: EditorSessionResult | null; status: string };
        if (!active) return;
        setResult(data.result);
        setReturnStatus(`Server verified · ${response.status} ${response.statusText} · ${data.status}`);
      } catch (failure) {
        if (active) setError(failure instanceof Error ? failure.message : "The saved session could not be restored.");
      }
    }
    void restoreSession();
    return () => { active = false; };
  }, []);

  function openEditor(session: EditorSessionLaunch, response = apiResponse) {
    setError(null);
    try {
      sessionStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify({ launch: session, response, autoOpen } satisfies DemoSnapshot));
      window.location.assign(session.editorUrl);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "The editor could not be opened.");
    }
  }

  async function sendRequest() {
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    setResult(null);
    setReturnStatus(null);
    setLaunch(null);
    setApiResponse(null);
    const started = performance.now();
    try {
      const response = await fetch(SESSION_ENDPOINT, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });
      const data: unknown = await response.json();
      const exchange = { status: response.status, statusText: response.statusText, request: requestBody,
        durationMs: Math.round(performance.now() - started), body: data };
      setApiResponse(exchange);
      if (!response.ok) {
        const failure = data as { error?: { message?: string } };
        throw new Error(failure.error?.message ?? "The session could not be created.");
      }
      const session = data as EditorSessionLaunch;
      setLaunch(session);
      if (autoOpen) openEditor(session, exchange);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Please try again.");
    } finally { setBusy(false); }
  }

  async function download() {
    if (!launch || !result?.artifact) return;
    try {
      // The local demonstration uses its scoped browser capability. Merchant
      // backends download from the authenticated session/artifact endpoint.
      const token = new URLSearchParams(new URL(launch.editorUrl).hash.slice(1)).get("token") ?? "";
      const response = await fetch(`/api/v1/production-artifacts/${result.artifact.id}/content`, {
        headers: { "x-vortex-session": token }, cache: "no-store",
      });
      if (!response.ok) throw new Error("Reopen the design to download its PDF.");
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = result.artifact.filename;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Download failed."); }
  }

  return <>
    <div className="mb-6 flex items-center gap-5 rounded-2xl border border-[var(--st-line)] p-4 sm:gap-7">
      <div className="h-28 w-24 shrink-0 overflow-hidden rounded-xl bg-[#e1e2e5]"><ProductPoster key={feature.productId} src={feature.poster} name={feature.name} /></div>
      <div className="min-w-0 flex-1">
        <label htmlFor="demo-product" className="mb-2 block text-sm font-medium">Choose a product</label>
        <select id="demo-product" value={productId} disabled={busy} onChange={(event) => {
          setProductId(event.target.value); setLaunch(null); setApiResponse(null); setResult(null); setError(null); setReturnStatus(null);
          sessionStorage.removeItem(DEMO_STORAGE_KEY);
        }} className="h-11 w-full max-w-md rounded-xl border border-[var(--st-line)] bg-white px-3 text-sm disabled:opacity-50">
          {FEATURED_PRODUCTS.map((product) => <option key={product.productId} value={product.productId}>{product.name}</option>)}
        </select>
        <p className="mt-2 text-xs leading-relaxed text-[var(--st-dim)]">
          {productId === "blender-pouch-v3-preview" ? "Saved visual preview · Production PDF is not available for this pouch yet."
            : "Design, save, and download a PDF. Review the print notes before production."}
        </p>
      </div>
    </div>
    <div className="grid gap-5 lg:grid-cols-2">
      <section aria-label="API request" className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-[var(--st-line)]">
        <div className="border-b border-[var(--st-line)] px-5 py-4">
          <h2 className="text-base font-semibold">1. Send the API request</h2>
          <p className="mt-3 flex flex-wrap items-center gap-2 font-mono text-xs"><span className="rounded-md bg-emerald-50 px-2 py-1 font-semibold text-emerald-800">POST</span><span>{SESSION_ENDPOINT}</span></p>
        </div>
        <div className="flex flex-1 flex-col p-5">
          <p className="mb-3 font-mono text-xs text-[var(--st-dim)]">{apiResponse?.request ? "Last sent request · application/json" : "Content-Type: application/json"}</p>
          <pre aria-label="Request JSON" className="min-h-36 whitespace-pre-wrap break-all rounded-xl bg-[#17191c] p-4 font-mono text-xs leading-relaxed text-[#e2e3e6]">{JSON.stringify(apiResponse?.request ?? requestBody, null, 2)}</pre>
          <label className="mb-4 mt-5 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={autoOpen} disabled={busy} onChange={(event) => setAutoOpen(event.target.checked)} className="h-4 w-4 accent-[#17191c]" />
            Open full-page editor automatically after the response
          </label>
          <button type="button" onClick={() => void sendRequest()} disabled={!enabled || !ready || busy}
            className="mt-auto inline-flex min-h-12 items-center justify-between gap-4 rounded-xl bg-[var(--st-text)] px-5 text-sm font-medium text-white hover:bg-black disabled:opacity-50">
            {busy ? "Sending request…" : "Send API request"} <Send className="h-4 w-4" />
          </button>
        </div>
      </section>
      <section aria-label="API response" className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-[var(--st-line)]">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--st-line)] px-5 py-4">
          <h2 className="text-base font-semibold">2. Inspect the response</h2>
          <p role="status" className={`font-mono text-xs ${apiResponse && apiResponse.status < 400 ? "text-emerald-700" : "text-[var(--st-dim)]"}`}>
            {busy ? "Waiting for the API…" : apiResponse ? `${apiResponse.status} ${apiResponse.statusText} · ${apiResponse.durationMs} ms` : "No request sent"}
          </p>
        </div>
        <div className="flex flex-1 flex-col p-5">
          {apiResponse ? <>
            <pre aria-label="Response JSON" className="max-h-64 overflow-auto whitespace-pre-wrap break-all rounded-xl bg-[#17191c] p-4 font-mono text-xs leading-relaxed text-[#e2e3e6]">{responseJson(apiResponse)}</pre>
            <p className="mb-4 mt-3 text-xs leading-relaxed text-[var(--st-dim)]">Live response from the server. The temporary URL token is hidden here; the Open editor button uses the complete returned URL.</p>
          </> : <div className="flex min-h-56 flex-1 flex-col items-center justify-center gap-3 rounded-xl bg-[var(--st-raised)] p-6 text-center text-sm text-[var(--st-dim)]"><ArrowRight className="h-6 w-6" /><p>Send a request to see its status,<br />session ID, product ID, and editor URL.</p></div>}
          <button type="button" onClick={() => { if (launch) openEditor(launch); }} disabled={!launch || !ready || busy}
            className="mt-auto inline-flex min-h-12 items-center justify-between gap-4 rounded-xl border border-[var(--st-line)] px-5 text-sm font-medium hover:bg-[var(--st-raised)] disabled:opacity-40">
            {result ? "Reopen saved design" : "Open full-page editor"} <ArrowUpRight className="h-4 w-4" />
          </button>
        </div>
      </section>
    </div>
    <section className="mt-5 rounded-2xl border border-[var(--st-line)] p-5">
      <h2 className="text-base font-semibold">3. The response becomes the editor</h2>
      <p className="mt-2 text-sm leading-relaxed text-[var(--st-dim)]">Navigate to the returned <code>editorUrl</code>. The product opens as a full-page workspace with its design tools, 3D preview, and a Back button. Back saves pending edits and returns to your <code>returnUrl</code>.</p>
      <pre className="mt-4 overflow-auto rounded-xl bg-[#17191c] p-4 font-mono text-xs leading-relaxed text-[#e2e3e6]"><code>{"const session = await response.json();\nwindow.location.assign(session.editorUrl);"}</code></pre>
    </section>
    <p className="mt-4 text-xs leading-relaxed text-[var(--st-dim)]">
      {enabled ? "Local development demo: this page calls /api/demo/editor-session, using the same session service and editor as the merchant API."
        : "Sending requests in this keyless playground is available only on localhost in development."}
      {" "}On your live website, your backend calls <code>POST /api/v1/editor-sessions</code> with its server API key, then returns the session to your browser.
    </p>
    {error && <p role="alert" className="mt-5 rounded-xl bg-red-50 p-4 text-sm text-red-800">{error}</p>}
    {returnStatus && <p role="status" className="mt-5 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-900">{returnStatus}. Your session and design are preserved.</p>}
    {result && <section aria-label="Completed design" className="mt-6 rounded-2xl border border-[var(--st-line)] p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="flex items-center gap-2 text-lg font-semibold"><Check className="h-5 w-5" /> {result.status === "ready" ? "Design and PDF ready" : "Preview saved"}</h2>
        {result.artifact && <button type="button" onClick={() => void download()} className="inline-flex items-center gap-2 rounded-lg border border-[var(--st-line)] px-4 py-2 text-sm font-medium"><Download className="h-4 w-4" /> Download PDF</button>}
      </div>
      <p className="mt-2 text-sm text-[var(--st-dim)]">The API confirmed this result after returning from the editor.</p>
      <pre className="mt-4 overflow-auto rounded-xl bg-[#17191c] p-5 text-xs leading-relaxed text-[#e2e3e6]">{JSON.stringify({ sessionId: result.sessionId, productId: result.productId, revision: result.revision, status: result.status, artifact: result.artifact }, null, 2)}</pre>
    </section>}
  </>;
}
