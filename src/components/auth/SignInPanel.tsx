"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth/client";

type Mode = "sign-in" | "sign-up";

export function SignInPanel({ returnTo }: { returnTo: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("sign-in");
  const [guestReady, setGuestReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetch("/api/v1/session", { cache: "no-store" }).finally(() => {
      setGuestReady(true);
    });
  }, []);

  const submit = async (formData: FormData) => {
    setBusy(true);
    setError(null);
    const email = String(formData.get("email") ?? "").trim();
    const password = String(formData.get("password") ?? "");
    const name = String(formData.get("name") ?? "").trim();
    try {
      const result = mode === "sign-in"
        ? await authClient.signIn.email({ email, password })
        : await authClient.signUp.email({ email, password, name });
      if (result.error) throw new Error(result.error.message || "Authentication failed.");

      const claim = await fetch("/api/v1/session/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!claim.ok) {
        const payload = await claim.json().catch(() => null) as {
          error?: { message?: string };
        } | null;
        throw new Error(payload?.error?.message || "Your guest designs could not be claimed.");
      }
      router.replace(returnTo);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Authentication failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="w-full max-w-md rounded-2xl border border-[var(--st-line)] bg-[var(--st-surface)] p-6 shadow-sm sm:p-8">
      <div className="grid grid-cols-2 rounded-lg bg-[var(--st-raised)] p-1" aria-label="Authentication mode">
        {(["sign-in", "sign-up"] as const).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => {
              setMode(value);
              setError(null);
            }}
            className={`rounded-md px-3 py-2 text-[13px] font-semibold transition-colors ${
              mode === value
                ? "bg-[var(--st-surface)] text-[var(--st-text)] shadow-sm"
                : "text-[var(--st-dim)]"
            }`}
          >
            {value === "sign-in" ? "Sign in" : "Create account"}
          </button>
        ))}
      </div>

      <form action={submit} className="mt-6 space-y-4">
        {mode === "sign-up" && (
          <label className="block text-[13px] font-medium text-[var(--st-text)]">
            Name
            <input
              name="name"
              autoComplete="name"
              minLength={2}
              maxLength={80}
              required
              className="mt-1.5 h-11 w-full rounded-lg border border-[var(--st-line)] bg-white px-3 text-[14px] outline-none focus:ring-2 focus:ring-[var(--st-accent)]"
            />
          </label>
        )}
        <label className="block text-[13px] font-medium text-[var(--st-text)]">
          Email
          <input
            name="email"
            type="email"
            autoComplete="email"
            maxLength={254}
            required
            className="mt-1.5 h-11 w-full rounded-lg border border-[var(--st-line)] bg-white px-3 text-[14px] outline-none focus:ring-2 focus:ring-[var(--st-accent)]"
          />
        </label>
        <label className="block text-[13px] font-medium text-[var(--st-text)]">
          Password
          <input
            name="password"
            type="password"
            autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
            minLength={10}
            maxLength={128}
            required
            className="mt-1.5 h-11 w-full rounded-lg border border-[var(--st-line)] bg-white px-3 text-[14px] outline-none focus:ring-2 focus:ring-[var(--st-accent)]"
          />
        </label>

        {error && (
          <p role="alert" className="rounded-lg bg-[var(--st-danger)]/10 px-3 py-2.5 text-[13px] text-[var(--st-danger)]">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy || !guestReady}
          className="flex h-11 w-full items-center justify-center rounded-lg bg-[var(--st-accent)] px-4 text-[14px] font-semibold text-[var(--st-accent-ink)] transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {!guestReady
            ? "Preparing secure session…"
            : busy
              ? "Please wait…"
              : mode === "sign-in"
                ? "Sign in"
                : "Create account"}
        </button>
      </form>

      <p className="mt-5 text-[12px] leading-5 text-[var(--st-faint)]">
        Designs made in this browser will be moved into the signed-in account without changing their URLs.
      </p>
    </div>
  );
}
