import type { Metadata } from "next";
import { EmbedShell } from "@/components/embed/EmbedShell";
import { EmbedRejection, type EmbedTheme } from "@/platform/embed/types";
import { resolveEmbedConfig } from "@/platform/embed/resolve-embed";
import { getEmbedClientRegistry } from "@/server/embed/embed-client-registry";
import { parseOptionSelection } from "@/platform/products/configuration-resolver";
import { ProductDomainError } from "@/platform/products/errors";
import { getProductCatalogService } from "@/server/products/container";

export const metadata: Metadata = {
  title: "Customize",
  // An embedded frame must never be indexed on its own: a bare configurator
  // outranking the manufacturer's product page would be a real SEO harm.
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * Theme tokens as CSS custom properties (#27).
 *
 * Client branding is data. Injecting values into the variables the
 * configurator already uses keeps presentation configurable without a fork,
 * and keeps host CSS out of the frame entirely.
 */
function themeStyle(theme: EmbedTheme): React.CSSProperties {
  return {
    ["--st-accent" as string]: theme.accent,
    ["--st-accent-ink" as string]: "#ffffff",
    ["--st-bg" as string]: theme.surface,
    ["--st-surface" as string]: theme.surface,
    ["--st-raised" as string]: theme.panel,
    ["--st-text" as string]: theme.text,
    ["--st-dim" as string]: theme.dim,
    ["--st-faint" as string]: theme.dim,
    ["--st-line" as string]: theme.line,
    ["--vx-radius" as string]: `${theme.radiusPx}px`,
    ...(theme.fontFamily ? { fontFamily: theme.fontFamily } : {}),
  };
}

function EmbedError({ title, detail }: { title: string; detail: string }) {
  return (
    <main className="mx-auto max-w-[560px] px-6 py-16 text-center">
      <h1 className="text-[18px] font-semibold tracking-tight text-[var(--st-text)]">{title}</h1>
      <p className="mt-2 text-[14px] leading-[1.6] text-[var(--st-dim)]">{detail}</p>
    </main>
  );
}

export default async function EmbedPage({
  params,
  searchParams,
}: {
  params: Promise<{ clientId: string; productId: string }>;
  searchParams: Promise<{ host?: string; project?: string; options?: string }>;
}) {
  const { clientId, productId } = await params;
  const { host, project, options } = await searchParams;

  let embed;
  try {
    embed = resolveEmbedConfig(getEmbedClientRegistry(), {
      clientId,
      productId,
      hostOrigin: host ?? null,
    });
  } catch (error) {
    if (error instanceof EmbedRejection) {
      // The message is deliberately the same shape for every rejection reason:
      // a probing page learns that it is not authorized, not which of a
      // client's products or origins exist.
      return (
        <EmbedError
          title="This configurator is unavailable"
          detail={error.message}
        />
      );
    }
    throw error;
  }

  let config = null;
  let presentationMode = null;
  let resolutionError: string | null = null;
  try {
    const selection = parseOptionSelection(options ? JSON.parse(options) : {});
    const resolved = await getProductCatalogService().resolve(productId, null, selection);
    config = resolved.productConfig;
    presentationMode = resolved.presentation.mode;
  } catch (error) {
    resolutionError =
      error instanceof ProductDomainError
        ? error.message
        : "This product could not be loaded right now.";
  }

  if (!config || !presentationMode) {
    return (
      <div style={themeStyle(embed.theme)}>
        <EmbedError
          title="This product is unavailable"
          detail={resolutionError ?? "This product could not be loaded right now."}
        />
      </div>
    );
  }

  return (
    <div style={themeStyle(embed.theme)}>
      <EmbedShell
        key={`${config.id}:${config.configurationId}:${project ?? "new"}`}
        config={config}
        presentationMode={presentationMode}
        embed={embed}
        requestedProjectId={project ?? null}
      />
    </div>
  );
}
