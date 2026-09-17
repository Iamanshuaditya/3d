import { CodeBlock } from "./CodeBlock";
import { DocsSection, DocsTable } from "./DocsSection";
import {
  API_ERRORS, EMBED_COMMANDS, EMBED_ERRORS, EMBED_EVENTS, EMBED_FEATURES, PRODUCTS, SESSION_FIELDS,
} from "@/lib/developers/reference";
import { EMBED_CLIENTS_ENV, OPERATOR_SETUP, RESULT_SHAPE } from "@/lib/developers/snippets";

const LIMITS: ReadonlyArray<[string, string]> = [
  ["Origins are exact", "No wildcards, ever. www and apex, staging, and a Shopify store's myshopify.com plus its custom domain each need their own entry."],
  ["Editor URLs expire in one hour", "They carry a scoped token in the fragment. Treat them as secrets: don't log, publish or rewrite them."],
  ["60 session creations per minute", "Per client, on POST /api/v1/editor-sessions. A 429 means back off, not retry immediately."],
  ["Keys are server-only", "The merchant key is never sent to the frame, and there are no CORS headers on the API — a browser cannot call it cross-origin by design."],
  ["Content Security Policy", "If your site sets one, allow your Vortex host in script-src, style-src and frame-src."],
  ["A browser callback is not a receipt", "Confirm the session from your server before manufacturing. This applies to both paths."],
  ["A PDF is not certification", "Review result.warnings with your printer. The cup exports a rectangular artwork area, not a curved manufacturing dieline."],
];

export function ApiReference() {
  return (
    <>
      <DocsSection id="products" title="Products" kicker="Reference">
        <DocsTable
          head={["Product", "productId", "Output", "Completion status"]}
          rows={PRODUCTS}
          mono={[1, 3]}
        />
        <p data-reveal="up" className="mt-4 max-w-[62ch] text-sm leading-relaxed text-[var(--st-dim)]">
          The stand-up pouch is a visual prototype. Asking for <code>mode: &quot;pdf&quot;</code> on it returns 422, as does
          any product when your client does not have <code>downloadArtifact</code> enabled.
        </p>
      </DocsSection>

      <DocsSection id="fields" title="Session fields" kicker="Reference">
        <p data-reveal="up" className="mt-3 max-w-[62ch] text-sm leading-relaxed text-[var(--st-dim)]">
          The body of <code>POST /api/v1/editor-sessions</code>. Only <code>productId</code> is required.
        </p>
        <DocsTable head={["Field", "Type", "Notes"]} rows={SESSION_FIELDS} mono={[0, 1]} />
      </DocsSection>

      <DocsSection id="result" title="Result shape" kicker="Reference">
        <p data-reveal="up" className="mt-3 max-w-[62ch] text-sm leading-relaxed text-[var(--st-dim)]">
          What <code>GET /api/v1/editor-sessions/&#123;sessionId&#125;</code> returns as <code>result</code>, and what rides along
          on a <code>completed</code> event when the session has one.
        </p>
        <div data-reveal="up" className="mt-5"><CodeBlock code={RESULT_SHAPE} caption="result" /></div>
        <h3 data-reveal="up" className="mt-9 text-base font-medium">Frame → host events</h3>
        <DocsTable head={["Event", "Payload", "Meaning"]} rows={EMBED_EVENTS} mono={[0, 1]} />
        <h3 data-reveal="up" className="mt-9 text-base font-medium">Host → frame commands</h3>
        <DocsTable head={["Call", "Effect"]} rows={EMBED_COMMANDS} mono={[0]} />
      </DocsSection>

      <DocsSection id="errors" title="Errors" kicker="Reference">
        <p data-reveal="up" className="mt-3 max-w-[62ch] text-sm leading-relaxed text-[var(--st-dim)]">
          The API answers with <code>{"{ error: { code, message } }"}</code>. Show a retry message and never fulfil from a
          failed or unverified state.
        </p>
        <DocsTable head={["Status", "Codes", "What it means"]} rows={API_ERRORS} mono={[0, 1]} />
        <h3 data-reveal="up" className="mt-9 text-base font-medium">Embed error codes</h3>
        <p data-reveal="up" className="mt-2 max-w-[62ch] text-sm leading-relaxed text-[var(--st-dim)]">
          These arrive on the <code>error</code> event rather than as HTTP statuses. The first four are almost always a
          registration problem, not a code problem.
        </p>
        <DocsTable head={["Code", "Meaning"]} rows={EMBED_ERRORS} mono={[0]} />
      </DocsSection>

      <DocsSection id="limits" title="Limits and security" kicker="Reference">
        <dl data-stagger className="mt-5 grid gap-5 sm:grid-cols-2">
          {LIMITS.map(([term, detail]) => (
            <div data-reveal="up" key={term} className="rounded-xl border border-[var(--st-line)] p-5">
              <dt className="text-sm font-semibold">{term}</dt>
              <dd className="mt-2 text-sm leading-relaxed text-[var(--st-dim)]">{detail}</dd>
            </div>
          ))}
        </dl>
      </DocsSection>

      <DocsSection id="operator" title="Operator setup" kicker="Reference">
        <p data-reveal="up" className="mt-3 max-w-[62ch] text-sm leading-relaxed text-[var(--st-dim)]">
          For whoever runs the Vortex host. A merchant cannot self-serve this yet: clients are read from{" "}
          <code>VORTEX_EMBED_CLIENTS</code> once at boot, so adding one is an environment change and a restart.
        </p>
        <div data-reveal="up" className="mt-5"><CodeBlock code={OPERATOR_SETUP} caption="Generate a client" /></div>
        <div data-reveal="up" className="mt-5"><CodeBlock code={EMBED_CLIENTS_ENV} caption="VORTEX_EMBED_CLIENTS" /></div>
        <h3 data-reveal="up" className="mt-9 text-base font-medium">Feature flags</h3>
        <p data-reveal="up" className="mt-2 max-w-[62ch] text-sm leading-relaxed text-[var(--st-dim)]">
          Every flag defaults to <code>false</code>. A capability shipped later is never switched on inside somebody
          else&apos;s website by the act of releasing it.
        </p>
        <DocsTable head={["Flag", "Enables"]} rows={EMBED_FEATURES} mono={[0]} />
      </DocsSection>
    </>
  );
}
