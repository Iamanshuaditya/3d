import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { SignInPanel } from "@/components/auth/SignInPanel";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to keep your customization projects with your account.",
};

function safeReturnTo(value: string | undefined) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/designs";
  return value.slice(0, 1_024);
}

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string }>;
}) {
  const { returnTo } = await searchParams;
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[1180px] flex-col px-5 py-8 sm:px-8 sm:py-12">
      <Link
        href={safeReturnTo(returnTo)}
        className="inline-flex w-fit items-center gap-2 text-[13px] font-medium text-[var(--st-dim)] hover:text-[var(--st-text)]"
      >
        <ArrowLeft className="h-4 w-4" />
        Back
      </Link>
      <section className="flex flex-1 flex-col items-center justify-center py-10">
        <div className="mb-7 max-w-md text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--st-faint)]">Vortex account</p>
          <h1 className="mt-3 text-[32px] font-semibold tracking-tight text-[var(--st-text)]">Keep every design together</h1>
          <p className="mt-3 text-[14px] leading-6 text-[var(--st-dim)]">
            Sign in at any point. Your current guest projects and artwork will move with you.
          </p>
        </div>
        <SignInPanel returnTo={safeReturnTo(returnTo)} />
      </section>
    </main>
  );
}
