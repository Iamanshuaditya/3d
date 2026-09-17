import Link from "next/link";
import { ArrowUpRight, ServerCog, SquareCode } from "lucide-react";
import { CodeBlock } from "./CodeBlock";
import { CodeTabs } from "./CodeTabs";
import { DocsSection } from "./DocsSection";
import * as S from "@/lib/developers/snippets";

const COMPARE: ReadonlyArray<[string, string, string]> = [
  ["Backend required", "Yes", "No"],
  ["API key", "Server-side only", "None — nothing secret in the browser"],
  ["Where the customer designs", "On Vortex, full page", "Inside your own page"],
  ["How access is granted", "Merchant API key", "Client id + exactly registered origin"],
  ["What comes back", "A session your server verifies", "projectId and revision, as a browser event"],
  ["Safe to fulfil from directly", "Yes, after the server check", "No — confirm server-side first"],
  ["Tools available", "All of them", "The ones enabled for your client"],
];

function Callout({ tone = "note", children }: { tone?: "note" | "warn"; children: React.ReactNode }) {
  return (
    <p
      data-reveal="up"
      className={
        tone === "warn"
          ? "mt-5 rounded-xl border border-[#C4714A]/45 bg-[#C4714A]/8 px-5 py-4 text-sm leading-relaxed"
          : "mt-5 rounded-xl border border-[var(--st-line)] bg-[var(--st-raised)] px-5 py-4 text-sm leading-relaxed"
      }
    >
      {children}
    </p>
  );
}

export function IntegrationGuides() {
  return (
    <>
      <DocsSection id="choose" title="Choose your integration" className="border-t-0 pt-0">
        <p data-reveal="up" className="mt-3 max-w-[62ch] text-sm leading-relaxed text-[var(--st-dim)]">
          There are two ways in, and the right one is decided by a single question: can your website keep a
          secret? Everything else follows from that.
        </p>
        <div data-stagger className="mt-7 grid gap-5 md:grid-cols-2">
          <a data-reveal="up" href="#hosted" className="editorial-card group block rounded-2xl border border-[var(--st-line)] p-6">
            <ServerCog aria-hidden="true" className="h-6 w-6 text-[var(--st-dim)]" />
            <h3 className="mt-4 text-lg font-medium tracking-tight">Hosted editor</h3>
            <p className="mt-1 text-xs font-medium uppercase tracking-[0.1em] text-[#A75232]">You have a server</p>
            <p className="mt-3 text-sm leading-relaxed text-[var(--st-dim)]">
              Your backend creates a session, the customer designs on a full Vortex page and returns to you.
              Your server then verifies the design and downloads a print-ready PDF.
            </p>
            <span className="editorial-arrow mt-5 inline-flex items-center gap-2 text-sm font-medium">
              Custom stacks, WooCommerce, a Shopify app →
            </span>
          </a>
          <a data-reveal="up" href="#embed" className="editorial-card group block rounded-2xl border border-[var(--st-line)] p-6">
            <SquareCode aria-hidden="true" className="h-6 w-6 text-[var(--st-dim)]" />
            <h3 className="mt-4 text-lg font-medium tracking-tight">Embedded configurator</h3>
            <p className="mt-1 text-xs font-medium uppercase tracking-[0.1em] text-[#A75232]">You don&apos;t</p>
            <p className="mt-3 text-sm leading-relaxed text-[var(--st-dim)]">
              A script tag and a div. The configurator runs in an iframe on your own page with no API key
              anywhere in the browser — access is granted to your registered origin instead.
            </p>
            <span className="editorial-arrow mt-5 inline-flex items-center gap-2 text-sm font-medium">
              Squarespace, Wix, Webflow, Shopify themes →
            </span>
          </a>
        </div>
        <div data-reveal="up" className="mt-7 overflow-x-auto overscroll-x-contain">
          <table className="w-full min-w-[40rem] text-left text-sm">
            <thead className="border-b border-[var(--st-line)] text-[var(--st-dim)]">
              <tr>
                <th className="py-3 pr-4 font-medium">&nbsp;</th>
                <th className="py-3 pr-4 font-medium">Hosted editor</th>
                <th className="py-3 font-medium">Embedded configurator</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--st-line)]">
              {COMPARE.map(([label, hosted, embedded]) => (
                <tr key={label}>
                  <td className="py-3.5 pr-4 align-top">{label}</td>
                  <td className="py-3.5 pr-4 align-top text-[var(--st-dim)]">{hosted}</td>
                  <td className="py-3.5 align-top text-[var(--st-dim)]">{embedded}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Callout>
          You can use both. A Shopify merchant might embed the configurator on the product page for browsing,
          then have their app create a hosted session when the order needs a production PDF.
        </Callout>
      </DocsSection>

      <DocsSection id="concepts" title="How it fits together">
        <div data-stagger className="mt-5 grid gap-6 lg:grid-cols-2">
          <div data-reveal="up" className="rounded-2xl border border-[var(--st-line)] p-6">
            <p className="font-mono text-xs text-[var(--st-dim)]">Hosted</p>
            <ol className="mt-4 space-y-3 text-sm leading-relaxed text-[var(--st-dim)]">
              <li><span className="text-[var(--st-text)]">1.</span> Your server asks Vortex for a session and gets a one-hour <code>editorUrl</code>.</li>
              <li><span className="text-[var(--st-text)]">2.</span> The customer&apos;s browser goes there and designs.</li>
              <li><span className="text-[var(--st-text)]">3.</span> Back returns them to your <code>returnUrl</code> with <code>vortexSessionId</code>.</li>
              <li><span className="text-[var(--st-text)]">4.</span> Your server reads the session by the id it stored, and downloads the PDF.</li>
            </ol>
          </div>
          <div data-reveal="up" className="rounded-2xl border border-[var(--st-line)] p-6">
            <p className="font-mono text-xs text-[var(--st-dim)]">Embedded</p>
            <ol className="mt-4 space-y-3 text-sm leading-relaxed text-[var(--st-dim)]">
              <li><span className="text-[var(--st-text)]">1.</span> The loader mounts an iframe and declares your page&apos;s origin.</li>
              <li><span className="text-[var(--st-text)]">2.</span> Vortex checks the client, the origin and the product, and fails closed on any of them.</li>
              <li><span className="text-[var(--st-text)]">3.</span> The customer designs without leaving your page.</li>
              <li><span className="text-[var(--st-text)]">4.</span> A <code>completed</code> message hands you <code>projectId</code> and <code>revision</code>.</li>
            </ol>
          </div>
        </div>
        <Callout>
          The iframe is the contract, not a component. Your CSS cannot reach into the editor and its CSS cannot
          leak out, the editor&apos;s three.js and React never meet your bundler, and fixes ship without you
          deploying anything.
        </Callout>
      </DocsSection>

      <DocsSection id="hosted" title="Hosted editor" kicker="Path A">
        <p data-reveal="up" className="mt-3 max-w-[62ch] text-sm leading-relaxed text-[var(--st-dim)]">
          Three calls. Your key never leaves your server, and the design you put into production is one your
          own backend confirmed — not one the browser claimed.
        </p>
        <Callout tone="warn">
          Returning from the editor is <strong>not</strong> proof that a PDF exists. Always re-read the session
          from your server before you fulfil.
        </Callout>
      </DocsSection>

      <DocsSection id="hosted-create" title="Create a session" kicker="01 · Server">
        <p data-reveal="up" className="mt-3 max-w-[62ch] text-sm leading-relaxed text-[var(--st-dim)]">
          Pick the product and a <code>returnUrl</code> on an origin you registered. You get an editor URL valid
          for one hour. Your backend decides which product this customer may open; Vortex does not authenticate
          your storefront users.
        </p>
        <div data-reveal="up" className="mt-5">
          <CodeTabs
            label="Create a session"
            tabs={[
              { id: "node", label: "Node", code: S.CREATE_SESSION },
              { id: "response", label: "201 response", code: S.SESSION_RESPONSE, caption: "application/json" },
            ]}
          />
        </div>
      </DocsSection>

      <DocsSection id="hosted-open" title="Open the full-page editor" kicker="02 · Browser">
        <p data-reveal="up" className="mt-3 max-w-[62ch] text-sm leading-relaxed text-[var(--st-dim)]">
          Navigate to <code>editorUrl</code>. The product opens on its own route with the same artwork tools, 3D
          preview and folding controls as the studio. No browser SDK is needed for this path. <strong>Back</strong>{" "}
          saves pending edits and returns to your <code>returnUrl</code>.
        </p>
        <div data-reveal="up" className="mt-5"><CodeBlock code={S.OPEN_EDITOR} caption="Your product page" /></div>
        <Callout>
          Treat <code>editorUrl</code> as a temporary secret and do not log or alter it. The scoped token lives in
          the URL fragment, which is why third-party cookies are not required.
        </Callout>
      </DocsSection>

      <DocsSection id="hosted-verify" title="Verify the design and retrieve its PDF" kicker="03 · Server">
        <p data-reveal="up" className="mt-3 max-w-[62ch] text-sm leading-relaxed text-[var(--st-dim)]">
          Use the <code>sessionId</code> you stored, never an unverified reference from the browser. Status{" "}
          <code>ready</code> means a PDF exists for the current saved revision; <code>saved</code> means a preview
          product finished without one.
        </p>
        <div data-reveal="up" className="mt-5"><CodeBlock code={S.VERIFY_DOWNLOAD} caption="Your backend" /></div>
        <p data-reveal="up" className="mt-4 max-w-[62ch] text-sm leading-relaxed text-[var(--st-dim)]">
          The download responds with <code>application/pdf</code> and an <code>X-Content-SHA256</code> header you can
          check against <code>artifact.sha256</code>. Keep the revision, the PDF and the print notes with the order,
          and check the status again before fulfilment if you let customers keep editing.
        </p>
      </DocsSection>

      <DocsSection id="embed" title="Embedded configurator" kicker="Path B">
        <p data-reveal="up" className="mt-3 max-w-[62ch] text-sm leading-relaxed text-[var(--st-dim)]">
          A script tag and a container. There is no API key in this path at all — Vortex grants access by the
          client id plus the exact origin of the page doing the mounting, and refuses everything else.
        </p>
        <Callout tone="warn">
          Because nothing here is authenticated by your server, a <code>completed</code> event is a claim, not a
          receipt. Use it to move the customer along; confirm server-side before anything is manufactured.
        </Callout>
      </DocsSection>

      <DocsSection id="embed-inline" title="Inline on your page">
        <p data-reveal="up" className="mt-3 max-w-[62ch] text-sm leading-relaxed text-[var(--st-dim)]">
          <code>Vortex.mount()</code> takes a container and returns a handle. The frame reports its own height, so the
          iframe grows with the content unless you pass <code>autoResize: false</code>.
        </p>
        <div data-reveal="up" className="mt-5"><CodeBlock code={S.EMBED_INLINE} caption="Anywhere in your HTML" /></div>
      </DocsSection>

      <DocsSection id="embed-modal" title="As a modal">
        <p data-reveal="up" className="mt-3 max-w-[62ch] text-sm leading-relaxed text-[var(--st-dim)]">
          <code>Vortex.open()</code> puts the same frame in a dialog with its own close button and focus handling. It
          requires a server-created <code>editorUrl</code>, so it belongs to the hosted path — the loader rejects any
          URL whose <code>host</code> parameter is not the current origin.
        </p>
        <div data-reveal="up" className="mt-5"><CodeBlock code={S.EMBED_MODAL} caption="Your product page" /></div>
      </DocsSection>

      <DocsSection id="embed-events" title="Events">
        <p data-reveal="up" className="mt-3 max-w-[62ch] text-sm leading-relaxed text-[var(--st-dim)]">
          The loader handles the envelope and the origin check for you. If you listen directly, you must do both
          yourself — every message is namespaced <code>vortex-embed</code> and versioned, and anything else on your
          window is noise.
        </p>
        <div data-reveal="up" className="mt-5"><CodeBlock code={S.EMBED_EVENTS_RAW} caption="Without the loader" /></div>
      </DocsSection>

      <DocsSection id="wordpress" title="WordPress and WooCommerce" kicker="Platform">
        <p data-reveal="up" className="mt-3 max-w-[62ch] text-sm leading-relaxed text-[var(--st-dim)]">
          WordPress runs PHP, so it can hold a key — which means you should prefer the hosted path and get a
          verified PDF. Use the embed only where you want the configurator inline on a page.
        </p>
        <div data-reveal="up" className="mt-5">
          <CodeTabs
            label="WordPress"
            tabs={[
              { id: "session", label: "Create a session (PHP)", code: S.WORDPRESS_PHP },
              { id: "cart", label: "WooCommerce cart + order", code: S.WOOCOMMERCE_CART },
              { id: "shortcode", label: "Embed shortcode", code: S.WORDPRESS_SHORTCODE },
            ]}
          />
        </div>
        <Callout>
          Put <code>VORTEX_API_KEY</code> in <code>wp-config.php</code> and keep this in a site-specific plugin. A key in a
          theme file ends up in a public repository or a theme export sooner or later.
        </Callout>
      </DocsSection>

      <DocsSection id="shopify" title="Shopify" kicker="Platform">
        <p data-reveal="up" className="mt-3 max-w-[62ch] text-sm leading-relaxed text-[var(--st-dim)]">
          A Shopify theme has no server you control, so a theme-only integration must use the embed and carry the
          design forward as a line item property. For a verified production PDF you need an app with a real
          backend.
        </p>
        <div data-reveal="up" className="mt-5">
          <CodeTabs
            label="Shopify"
            tabs={[
              { id: "liquid", label: "Theme (embed)", code: S.SHOPIFY_LIQUID },
              { id: "app", label: "App backend (hosted)", code: S.SHOPIFY_APP },
            ]}
          />
        </div>
        <Callout tone="warn">
          Register both <code>your-store.myshopify.com</code> and the custom domain. Origins are matched exactly and
          wildcards are rejected, so a shop reached on two domains needs two entries or the configurator will
          refuse to load on one of them.
        </Callout>
      </DocsSection>

      <DocsSection id="nocode" title="Squarespace, Wix and Webflow" kicker="Platform">
        <p data-reveal="up" className="mt-3 max-w-[62ch] text-sm leading-relaxed text-[var(--st-dim)]">
          Identical markup in all three — a Code Block, an HTML element, or an Embed component. There is no server
          in this setup, so pair it with a completion mode of <code>quote</code> or <code>inquiry</code> and let Vortex
          record the design, rather than pretending a browser event is an order.
        </p>
        <div data-reveal="up" className="mt-5"><CodeBlock code={S.NOCODE_EMBED} caption="Paste into an embed block" /></div>
        <p data-reveal="up" className="mt-5 text-sm leading-relaxed text-[var(--st-dim)]">
          Want to see it behave before you paste anything?{" "}
          <Link href="/developers/demo" className="editorial-link font-medium text-[var(--st-text)]">
            Open the live demo <ArrowUpRight aria-hidden="true" className="inline h-3.5 w-3.5" />
          </Link>
        </p>
      </DocsSection>
    </>
  );
}
