import Link from "next/link";
import { ArrowLeft, ArrowUpRight, Download } from "lucide-react";

export const metadata = { title: "Editor API · Vortex Studio", description: "Open a product editor and retrieve its saved PDF in three steps." };

const createCode = `// Your backend: POST /api/design-session
const response = await fetch(VORTEX_URL + "/api/v1/editor-sessions", {
  method: "POST",
  headers: {
    Authorization: "Bearer " + process.env.VORTEX_API_KEY,
    "Content-Type": "application/json"
  },
  body: JSON.stringify({
    productId: "mailer-box-001",
    returnUrl: "https://shop.example.com/design-complete"
  })
});
if (!response.ok) throw new Error("Could not create editor session");
const session = await response.json();
// Store session.sessionId with your cart item.
// Return session to your browser.`;
const openCode = `<script>
  async function customize() {
    const response = await fetch("/api/design-session", { method: "POST" });
    if (!response.ok) throw new Error("Could not open editor");
    const session = await response.json();
    window.location.assign(session.editorUrl);
  }
</script>
<button onclick="customize()">Customize</button>`;
const downloadCode = `// Your backend: use the sessionId stored with your cart item.
const headers = { Authorization: "Bearer " + process.env.VORTEX_API_KEY };
const response = await fetch(
  VORTEX_URL + "/api/v1/editor-sessions/" + sessionId, { headers }
);
if (!response.ok) throw new Error("Could not verify design");
const session = await response.json();
if (session.status !== "ready") throw new Error("PDF is not ready");
const pdf = await fetch(
  new URL(session.result.artifact.downloadUrl, VORTEX_URL), { headers }
);
if (!pdf.ok) throw new Error("Could not download PDF");
const bytes = await pdf.arrayBuffer();`;

export default function DevelopersPage() {
  return <main className="mx-auto w-full max-w-6xl px-5 py-8 sm:px-8 sm:py-12">
    <nav aria-label="Developer navigation" className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--st-line)] pb-6">
      <Link href="/" className="inline-flex items-center gap-2 text-sm text-[var(--st-dim)]"><ArrowLeft className="h-4 w-4" /> Product library</Link>
      <a href="/integration.md" download className="inline-flex items-center gap-2 text-sm font-medium"><Download className="h-4 w-4" /> Download guide</a>
    </nav>
    <header className="grid gap-8 py-12 sm:py-16 lg:grid-cols-[1.5fr_1fr] lg:items-end">
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-[var(--st-dim)]">Vortex for developers</p>
        <h1 className="mt-4 text-4xl font-medium leading-[1.06] tracking-tight sm:text-6xl">Your storefront.<br />One editor API.</h1>
      </div>
      <div>
        <p className="max-w-sm text-base leading-relaxed text-[var(--st-dim)]">Pass a product ID. Open its full-page editor. Return with a saved design and, for supported products, a PDF.</p>
        <Link href="/developers/demo" className="mt-6 inline-flex min-h-12 items-center gap-6 rounded-full bg-[var(--st-text)] px-5 text-sm font-medium text-white hover:bg-black">Try the API live <ArrowUpRight className="h-4 w-4" /></Link>
        <p className="mt-3 text-xs leading-relaxed text-[var(--st-dim)]">Click Send, inspect the real response, then open the returned editor URL.</p>
      </div>
    </header>
    <p className="rounded-xl border border-[var(--st-line)] bg-[var(--st-raised)] px-5 py-4 text-sm leading-relaxed">Before you start: get your Vortex host URL and server API key, and register your website’s exact origin. Keep the key on your backend.</p>
    <div className="divide-y divide-[var(--st-line)]">
      {[
        { title: "Create a session", label: "01 · Server", detail: "Choose the product and a returnUrl on your registered website. The API returns an editor URL valid for one hour. Pass hostOrigin when you have more than one registered origin.", code: createCode },
        { title: "Open the full-page editor", label: "02 · Browser", detail: "Navigate to editorUrl. The selected product opens on its own route with all design tools and a Back button. Back saves pending edits and returns to returnUrl with vortexSessionId. No browser SDK is required.", code: openCode },
        { title: "Verify the design and retrieve its PDF", label: "03 · Server", detail: "After the customer returns, verify the session stored with your cart item. The return URL identifies the session; your backend confirms the current saved revision and PDF. Preview products return saved without a PDF.", code: downloadCode },
      ].map((step) => <section key={step.label} className="grid gap-6 py-10 lg:grid-cols-[0.7fr_1.3fr] lg:gap-12">
        <div><p className="font-mono text-xs text-[var(--st-dim)]">{step.label}</p><h2 className="mt-3 text-2xl font-medium tracking-tight">{step.title}</h2><p className="mt-3 text-sm leading-relaxed text-[var(--st-dim)]">{step.detail}</p></div>
        <pre className="min-w-0 overflow-auto rounded-2xl bg-[#17191c] p-5 text-xs leading-[1.8] text-[#e2e3e6] sm:p-6"><code>{step.code}</code></pre>
      </section>)}
    </div>
    <section className="border-t border-[var(--st-line)] py-10">
      <h2 className="text-2xl font-medium tracking-tight">Start with these products</h2>
      <div className="mt-5 overflow-x-auto"><table className="w-full text-left text-sm">
        <thead className="border-b border-[var(--st-line)] text-[var(--st-dim)]"><tr><th className="py-3 font-medium">Product</th><th className="px-4 py-3 font-medium">productId</th><th className="py-3 font-medium">Output</th></tr></thead>
        <tbody className="divide-y divide-[var(--st-line)]">
          <tr><td className="py-4">Mailer box</td><td className="px-4 font-mono text-xs">mailer-box-001</td><td>PDF artwork + dieline</td></tr>
          <tr><td className="py-4">Paper coffee cup</td><td className="px-4 font-mono text-xs">coffee-cup</td><td>PDF label artwork</td></tr>
          <tr><td className="py-4">Stand-up pouch</td><td className="px-4 font-mono text-xs">blender-pouch-v3-preview</td><td>Saved visual preview</td></tr>
        </tbody>
      </table></div>
      <p className="mt-4 max-w-3xl text-sm leading-relaxed text-[var(--st-dim)]">A generated PDF is not manufacturer certification. Review the returned print notes with your printer. The coffee cup exports a rectangular artwork area; it is not a curved cup manufacturing dieline. The original pouch returns <code>saved</code>, with no PDF.</p>
    </section>
    <section className="grid gap-6 border-t border-[var(--st-line)] py-10 text-sm sm:grid-cols-2">
      <div><h2 className="font-semibold">Continue an existing design</h2><p className="mt-2 leading-relaxed text-[var(--st-dim)]">Create another session with the same <code>productId</code> and <code>resumeSessionId</code>. The saved project and product version are preserved. The previous editor URL stops working.</p></div>
      <div><h2 className="font-semibold">Know when it’s ready</h2><p className="mt-2 leading-relaxed text-[var(--st-dim)]"><code>editing</code> → <code>ready</code> means a PDF exists for the current saved revision. Preview sessions return <code>saved</code>. An edit after completion requires finishing again.</p></div>
    </section>
    <footer className="flex flex-wrap items-center justify-between gap-4 border-t border-[var(--st-line)] py-6 text-sm text-[var(--st-dim)]"><span>Vortex Studio · Editor API v1</span><a href="/integration.md" download className="font-medium text-[var(--st-text)]">Get the complete short guide →</a></footer>
  </main>;
}
