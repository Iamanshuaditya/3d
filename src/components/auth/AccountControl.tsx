"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, UserRound } from "lucide-react";
import { authClient } from "@/lib/auth/client";

export function AccountControl({ compact = false }: { compact?: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();

  if (isPending) {
    return (
      <span className="h-9 w-24 animate-pulse rounded-lg bg-[var(--st-raised)]" aria-label="Loading account" />
    );
  }

  if (!session) {
    return (
      <Link
        href={`/sign-in?returnTo=${encodeURIComponent(pathname)}`}
        className="inline-flex h-9 shrink-0 items-center gap-2 rounded-lg bg-[var(--st-raised)] px-3 text-[13px] font-semibold text-[var(--st-text)] transition-colors hover:bg-[var(--st-line-strong)]"
      >
        <UserRound className="h-4 w-4" />
        <span className={compact ? "hidden lg:inline" : ""}>Sign in</span>
      </Link>
    );
  }

  const label = session.user.name || session.user.email;
  return (
    <div className="flex min-w-0 items-center gap-2">
      <span
        className={`max-w-40 truncate text-[12px] font-medium text-[var(--st-dim)] ${compact ? "hidden xl:block" : ""}`}
        title={session.user.email}
      >
        {label}
      </span>
      <button
        type="button"
        onClick={() => {
          void authClient.signOut({
            fetchOptions: {
              onSuccess: async () => {
                await fetch("/api/v1/session", { cache: "no-store" });
                router.refresh();
              },
            },
          });
        }}
        title="Sign out"
        className="inline-flex h-9 shrink-0 items-center gap-2 rounded-lg bg-[var(--st-raised)] px-3 text-[13px] font-semibold text-[var(--st-text)] transition-colors hover:bg-[var(--st-line-strong)]"
      >
        <LogOut className="h-4 w-4" />
        <span className={compact ? "sr-only" : ""}>Sign out</span>
      </button>
    </div>
  );
}
