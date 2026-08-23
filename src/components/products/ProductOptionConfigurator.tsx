"use client";

import { useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, Ruler } from "lucide-react";
import {
  optionRuleMatches,
} from "@/platform/products/configuration-resolver";
import type {
  OptionScalar,
  OptionSelection,
  ProductOption,
} from "@/platform/products/types";

type ProductOptionConfiguratorProps = {
  productName: string;
  options: ProductOption[];
  selection: OptionSelection;
  configurationId: string;
  physicalLabel: string;
  errorMessage?: string | null;
};

function normalizedSubmission(options: ProductOption[], values: OptionSelection) {
  const selection: OptionSelection = {};
  for (const option of options) {
    if (!optionRuleMatches(option.visibleWhen, values)) continue;
    if (!optionRuleMatches(option.availableWhen, values)) continue;
    let value: OptionScalar | undefined = values[option.id] ?? option.defaultValue;
    if (option.kind === "select") {
      const selected = option.values.find(
        (candidate) =>
          candidate.value === value && optionRuleMatches(candidate.availableWhen, values),
      );
      value = selected?.value ?? option.values.find(
        (candidate) => optionRuleMatches(candidate.availableWhen, values),
      )?.value;
    }
    if (value !== undefined) selection[option.id] = value;
  }
  return selection;
}

export function ProductOptionConfigurator({
  productName,
  options,
  selection,
  configurationId,
  physicalLabel,
  errorMessage = null,
}: ProductOptionConfiguratorProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [values, setValues] = useState<OptionSelection>({ ...selection });
  const visible = options.filter((option) => optionRuleMatches(option.visibleWhen, values));
  const nextSelection = useMemo(
    () => normalizedSubmission(options, values),
    [options, values],
  );
  const changed = JSON.stringify(nextSelection) !== JSON.stringify(selection);

  const setValue = (optionId: string, value: OptionScalar) => {
    setValues((current) => ({ ...current, [optionId]: value }));
  };

  return (
    <section className="mb-8 rounded-2xl bg-[var(--st-surface)] p-5 ring-1 ring-[var(--st-line)] sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--st-faint)]">
            Configure structure
          </p>
          <h2 className="mt-2 text-[20px] font-semibold tracking-tight text-[var(--st-text)]">
            {productName}
          </h2>
        </div>
        <p className="flex items-center gap-2 rounded-full bg-[var(--st-raised)] px-3 py-1.5 text-[12px] text-[var(--st-dim)]">
          <Ruler className="h-3.5 w-3.5" /> {physicalLabel}
        </p>
      </div>

      <form
        className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
        onSubmit={(event) => {
          event.preventDefault();
          const query = new URLSearchParams(searchParams.toString());
          query.set(
            "options",
            JSON.stringify(
              Object.fromEntries(
                Object.entries(nextSelection).sort(([left], [right]) =>
                  left.localeCompare(right),
                ),
              ),
            ),
          );
          router.push(`${pathname}?${query.toString()}`);
        }}
      >
        {errorMessage && (
          <p
            role="alert"
            className="rounded-lg bg-[var(--st-danger)]/10 px-3 py-2 text-[12px] font-medium text-[var(--st-danger)] sm:col-span-2 lg:col-span-4"
          >
            {errorMessage} The default configuration is shown below.
          </p>
        )}
        {visible.map((option) => {
          const available = optionRuleMatches(option.availableWhen, values);
          const value = values[option.id] ?? option.defaultValue;
          return (
            <label key={option.id} className="block text-[12px] font-medium text-[var(--st-dim)]">
              {option.label}
              {option.kind === "select" ? (
                <select
                  value={typeof value === "string" ? value : ""}
                  disabled={!available}
                  onChange={(event) => setValue(option.id, event.target.value)}
                  className="mt-1.5 h-10 w-full rounded-lg bg-[var(--st-raised)] px-3 text-[14px] text-[var(--st-text)] outline-none ring-1 ring-[var(--st-line)] focus:ring-2 focus:ring-[var(--st-accent)] disabled:opacity-45"
                >
                  {option.values.map((choice) => (
                    <option
                      key={choice.value}
                      value={choice.value}
                      disabled={!optionRuleMatches(choice.availableWhen, values)}
                    >
                      {choice.label}
                    </option>
                  ))}
                </select>
              ) : option.kind === "boolean" ? (
                <span className="mt-1.5 flex h-10 items-center gap-2 rounded-lg bg-[var(--st-raised)] px-3 ring-1 ring-[var(--st-line)]">
                  <input
                    type="checkbox"
                    checked={Boolean(value)}
                    disabled={!available}
                    onChange={(event) => setValue(option.id, event.target.checked)}
                  />
                  {value ? "Yes" : "No"}
                </span>
              ) : (
                <span className="relative mt-1.5 block">
                  <input
                    type="number"
                    value={typeof value === "number" ? value : ""}
                    min={option.min}
                    max={option.max}
                    step={option.step ?? "any"}
                    required={option.required}
                    disabled={!available}
                    onChange={(event) => setValue(option.id, Number(event.target.value))}
                    className="h-10 w-full rounded-lg bg-[var(--st-raised)] px-3 pr-12 text-[14px] text-[var(--st-text)] outline-none ring-1 ring-[var(--st-line)] focus:ring-2 focus:ring-[var(--st-accent)] disabled:opacity-45"
                  />
                  {option.unit && (
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-[var(--st-faint)]">
                      {option.unit}
                    </span>
                  )}
                </span>
              )}
              {option.description && (
                <span className="mt-1.5 block text-[11px] font-normal leading-4 text-[var(--st-faint)]">
                  {option.description}
                </span>
              )}
            </label>
          );
        })}

        <div className="flex items-end sm:col-span-2 lg:col-span-4">
          <button
            type="submit"
            disabled={!changed}
            className="ml-auto inline-flex items-center gap-2 rounded-lg bg-[var(--st-accent)] px-4 py-2.5 text-[13px] font-semibold text-[var(--st-accent-ink)] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Apply configuration <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </form>
      <p className="sr-only">Resolved configuration {configurationId}</p>
    </section>
  );
}
