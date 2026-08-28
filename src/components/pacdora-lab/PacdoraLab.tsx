"use client";

import { Box, PackageOpen, ScanLine } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  PACDORA_LAB_BOX_MATERIALS,
  PACDORA_LAB_POUCH_MATERIALS,
  constrainPouchLabInput,
  getPouchDimensionLimits,
  solvePacdoraLabBox,
  solvePacdoraLabPouch,
  type BoxLabInput,
  type DimensionMode,
  type PackagingKind,
  type PouchLabInput,
} from "@/lib/pacdora-lab";
import { DielinePreview } from "./DielinePreview";
import { PackagingScene } from "./PackagingScene";
import { PouchStudioEditor } from "./PouchStudioEditor";

const inputClass = "h-10 w-full rounded-lg border border-[var(--st-line)] bg-white px-3 text-sm font-medium text-[var(--st-text)] outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200";
const labelClass = "mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.13em] text-[var(--st-faint)]";
const MM_PER_INCH = 25.4;
type MeasurementUnit = "mm" | "in";

function formatMeasurement(value: number, unit: MeasurementUnit): string {
  const converted = unit === "mm" ? value : value / MM_PER_INCH;
  return Number(converted.toFixed(unit === "mm" ? 1 : 3)).toString();
}

function NumericField({
  label,
  value,
  min,
  max,
  step = 1,
  unit = "mm",
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: MeasurementUnit;
  onChange: (value: number) => void;
}) {
  const [draft, setDraft] = useState(formatMeasurement(value, unit));
  useEffect(() => {
    setDraft(formatMeasurement(value, unit));
  }, [unit, value]);

  const fromDisplayUnit = (displayValue: number) => (
    unit === "mm" ? displayValue : displayValue * MM_PER_INCH
  );
  const displayMin = unit === "mm" ? min : min / MM_PER_INCH;
  const displayMax = unit === "mm" ? max : max / MM_PER_INCH;
  const displayStep = unit === "mm" ? step : Math.max(0.001, step / MM_PER_INCH);

  const commitDraft = () => {
    const parsed = Number(draft);
    if (!Number.isFinite(parsed)) {
      setDraft(formatMeasurement(value, unit));
      return;
    }
    const next = Math.min(max, Math.max(min, fromDisplayUnit(parsed)));
    setDraft(formatMeasurement(next, unit));
    onChange(next);
  };

  return (
    <label>
      <span className={labelClass}>{label}</span>
      <div className="relative">
        <input
          className={`${inputClass} pr-11`}
          type="number"
          value={draft}
          min={displayMin}
          max={displayMax}
          step={displayStep}
          onChange={(event) => {
            const nextDraft = event.currentTarget.value;
            setDraft(nextDraft);
            const parsed = Number(nextDraft);
            const parsedMm = fromDisplayUnit(parsed);
            if (nextDraft !== ""
              && Number.isFinite(parsed)
              && parsedMm >= min
              && parsedMm <= max) {
              onChange(parsedMm);
            }
          }}
          onBlur={commitDraft}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
            if (event.key === "Escape") setDraft(formatMeasurement(value, unit));
          }}
        />
        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-[var(--st-faint)]">{unit}</span>
      </div>
      <span className="mt-1 block text-[9px] leading-4 text-slate-400">
        {formatMeasurement(min, "mm")}&ndash;{formatMeasurement(max, "mm")} mm · {formatMeasurement(min, "in")}&ndash;{formatMeasurement(max, "in")} in
      </span>
    </label>
  );
}

function DimensionTriplet({ label, values }: { label: string; values: { length: number; width: number; height: number } }) {
  return (
    <div className="rounded-xl border border-[var(--st-line)] bg-white px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--st-faint)]">{label}</p>
      <p className="mt-1 font-mono text-[13px] font-semibold text-[var(--st-text)]">
        {values.length.toFixed(1)} × {values.width.toFixed(1)} × {values.height.toFixed(1)}
      </p>
    </div>
  );
}

export function PacdoraLab() {
  const [kind, setKind] = useState<PackagingKind>("stand-up");
  const [fold, setFold] = useState(0.43);
  const [measurementUnit, setMeasurementUnit] = useState<MeasurementUnit>("mm");
  const [studioArtwork, setStudioArtwork] = useState<{
    canvas: HTMLCanvasElement | null;
    revision: number;
  }>({ canvas: null, revision: 0 });
  const [boxInput, setBoxInput] = useState<BoxLabInput>({
    dimensions: { length: 169, width: 169, height: 117.5 },
    dimensionMode: "manufacture",
    materialId: "folding-board",
  });
  const [pouchInput, setPouchInput] = useState<PouchLabInput>({
    style: "stand-up",
    width: 150,
    height: 210,
    depth: 42,
    materialId: "matte-film",
    inflation: 0.78,
    endSealMm: 12,
    backSealMm: 14,
    gussetMm: 62,
    zipper: true,
    hangHole: true,
  });
  const box = useMemo(() => solvePacdoraLabBox(boxInput), [boxInput]);
  const pouch = useMemo(() => solvePacdoraLabPouch(pouchInput), [pouchInput]);
  const activeSolution = kind === "box" ? box : pouch;
  const pouchLimits = useMemo(() => getPouchDimensionLimits(pouchInput), [pouchInput]);
  const handleStudioArtworkChange = useCallback((
    canvas: HTMLCanvasElement | null,
    revision: number,
  ) => {
    setStudioArtwork((current) => (
      current.canvas === canvas && current.revision === revision
        ? current
        : { canvas, revision }
    ));
  }, []);

  const updateBoxDimension = (key: keyof BoxLabInput["dimensions"], value: number) => {
    setBoxInput((current) => ({
      ...current,
      dimensions: { ...current.dimensions, [key]: Math.max(1, value || 1) },
    }));
  };
  const updateBoxMaterial = (materialId: string) => {
    setBoxInput((current) => ({ ...current, materialId }));
  };
  const updatePouch = (key: keyof PouchLabInput, value: number | string | boolean) => {
    setPouchInput((current) => constrainPouchLabInput({ ...current, [key]: value }));
  };
  const selectConstruction = (candidate: PackagingKind) => {
    setKind(candidate);
    if (candidate !== "box") {
      setPouchInput((current) => constrainPouchLabInput({
        ...current,
        style: candidate,
        zipper: candidate === "stand-up" ? true : current.zipper,
        hangHole: candidate === "stand-up" ? true : current.hangHole,
      }));
    }
  };
  return (
    <main className="min-h-screen bg-[#f7f8fa] text-[var(--st-text)]">
      <header className="border-b border-[var(--st-line)] bg-white px-5 py-4 lg:px-8">
        <div className="mx-auto flex max-w-[1880px] flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--st-faint)]">
              <ScanLine className="size-3.5" /> Research prototype
            </div>
            <h1 className="mt-1 text-xl font-semibold tracking-tight sm:text-2xl">Procedural packaging lab</h1>
          </div>
          <div className="rounded-full border border-amber-200 bg-amber-50 px-4 py-2 text-xs font-medium text-amber-900">
            Experimental geometry · not a certified production die
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1880px] gap-5 p-5 lg:grid-cols-[320px_minmax(0,1fr)] lg:p-8">
        <aside className="rounded-2xl border border-[var(--st-line)] bg-white p-5 shadow-sm">
          <p className={labelClass}>Construction</p>
          <div className="grid grid-cols-3 gap-2">
            {(["box", "center-seal", "stand-up"] as PackagingKind[]).map((candidate) => (
              <button
                key={candidate}
                type="button"
                onClick={() => selectConstruction(candidate)}
                className={`flex h-14 flex-col items-center justify-center gap-1 rounded-xl border text-[11px] font-semibold transition ${kind === candidate ? "border-slate-900 bg-slate-900 text-white" : "border-[var(--st-line)] bg-white text-[var(--st-dim)] hover:bg-slate-50"}`}
              >
                {candidate === "box" ? <Box className="size-4" /> : <PackageOpen className="size-4" />}
                {candidate === "box" ? "Mailer" : candidate === "center-seal" ? "Pillow" : "Stand-up"}
              </button>
            ))}
          </div>

          {kind === "box" ? (
            <div className="mt-6 space-y-5">
              <div>
                <span className={labelClass}>Size mode</span>
                <div className="grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1">
                  {(["inner", "manufacture", "outer"] as DimensionMode[]).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setBoxInput((current) => ({ ...current, dimensionMode: mode }))}
                      className={`rounded-lg px-2 py-2 text-[11px] font-semibold capitalize transition ${boxInput.dimensionMode === mode ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}
                    >
                      {mode === "manufacture" ? "Knife" : mode}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <NumericField label="Length" value={boxInput.dimensions.length} min={60} max={500} onChange={(value) => updateBoxDimension("length", value)} />
                <NumericField label="Width" value={boxInput.dimensions.width} min={50} max={400} onChange={(value) => updateBoxDimension("width", value)} />
                <NumericField label="Height" value={boxInput.dimensions.height} min={20} max={250} onChange={(value) => updateBoxDimension("height", value)} />
              </div>
              <label>
                <span className={labelClass}>Board stock</span>
                <select className={inputClass} value={boxInput.materialId} onChange={(event) => updateBoxMaterial(event.currentTarget.value)}>
                  {PACDORA_LAB_BOX_MATERIALS.map((material) => <option key={material.id} value={material.id}>{material.label}</option>)}
                </select>
              </label>
              <label>
                <span className={labelClass}>Fold state · {Math.round(fold * 100)}%</span>
                <input className="w-full accent-slate-900" type="range" min={0} max={1} step={0.01} value={fold} onChange={(event) => setFold(Number(event.currentTarget.value))} />
              </label>
            </div>
          ) : (
            <div className="mt-6 space-y-5">
              <div className="flex items-center justify-between gap-3">
                <span className={labelClass}>Dimensions</span>
                <div className="grid grid-cols-2 rounded-lg bg-slate-100 p-1" aria-label="Measurement unit">
                  {(["mm", "in"] as const).map((unit) => (
                    <button
                      key={unit}
                      type="button"
                      aria-pressed={measurementUnit === unit}
                      onClick={() => setMeasurementUnit(unit)}
                      className={`rounded-md px-3 py-1 text-[10px] font-semibold uppercase transition ${measurementUnit === unit ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}
                    >
                      {unit}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <NumericField label="Face width" value={pouchInput.width} {...pouchLimits.width} unit={measurementUnit} onChange={(value) => updatePouch("width", value)} />
                <NumericField label="Height" value={pouchInput.height} {...pouchLimits.height} unit={measurementUnit} onChange={(value) => updatePouch("height", value)} />
                <NumericField label="Target depth" value={pouchInput.depth} {...pouchLimits.depth} unit={measurementUnit} onChange={(value) => updatePouch("depth", value)} />
                {kind === "stand-up" ? (
                  <NumericField label="Bottom gusset" value={pouchInput.gussetMm} {...pouchLimits.gussetMm} unit={measurementUnit} onChange={(value) => updatePouch("gussetMm", value)} />
                ) : (
                  <NumericField label="Back fin seal" value={pouchInput.backSealMm} {...pouchLimits.backSealMm} unit={measurementUnit} onChange={(value) => updatePouch("backSealMm", value)} />
                )}
                <NumericField label="Heat seal" value={pouchInput.endSealMm} {...pouchLimits.endSealMm} unit={measurementUnit} onChange={(value) => updatePouch("endSealMm", value)} />
              </div>
              {kind === "stand-up" ? (
                <div className="grid grid-cols-2 gap-3">
                  <label className="flex items-center justify-between rounded-xl border border-[var(--st-line)] bg-slate-50 px-3 py-3 text-sm font-semibold text-[var(--st-dim)]">
                    Zipper
                    <input
                      className="size-4 accent-slate-900"
                      type="checkbox"
                      checked={pouchInput.zipper}
                      onChange={(event) => updatePouch("zipper", event.currentTarget.checked)}
                    />
                  </label>
                  <label className="flex items-center justify-between rounded-xl border border-[var(--st-line)] bg-slate-50 px-3 py-3 text-sm font-semibold text-[var(--st-dim)]">
                    Hang hole
                    <input
                      className="size-4 accent-slate-900"
                      type="checkbox"
                      checked={pouchInput.hangHole}
                      onChange={(event) => updatePouch("hangHole", event.currentTarget.checked)}
                    />
                  </label>
                </div>
              ) : null}
              <label>
                <span className={labelClass}>Film structure</span>
                <select className={inputClass} value={pouchInput.materialId} onChange={(event) => updatePouch("materialId", event.currentTarget.value)}>
                  {PACDORA_LAB_POUCH_MATERIALS.map((material) => <option key={material.id} value={material.id}>{material.label}</option>)}
                </select>
              </label>
              <label>
                <span className={labelClass}>Inflate · {Math.round(pouchInput.inflation * 100)}%</span>
                <input className="w-full accent-slate-900" type="range" min={0.1} max={1} step={0.01} value={pouchInput.inflation} onChange={(event) => updatePouch("inflation", Number(event.currentTarget.value))} />
              </label>
              <div className="border-t border-[var(--st-line)] pt-5">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <span className={labelClass}>Studio artwork</span>
                  <span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${studioArtwork.canvas ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                    {studioArtwork.canvas ? "Live UV canvas" : "White film"}
                  </span>
                </div>
                <p className="rounded-xl border border-blue-100 bg-blue-50/60 p-3 text-[11px] leading-5 text-blue-900">
                  Use Uploads, Text, Colour, Adjust, Layers and crop in the editor. The full repeat is one continuous film web: artwork can move from Front through Bottom gusset into Back without being clipped at a fold.
                </p>
              </div>
            </div>
          )}

          <div className="mt-6 border-t border-[var(--st-line)] pt-5">
            <p className={labelClass}>What changes</p>
            <ul className="space-y-2 text-xs leading-5 text-[var(--st-dim)]">
              {activeSolution.assumptions.map((item) => <li key={item} className="flex gap-2"><span className="mt-2 size-1 shrink-0 rounded-full bg-slate-400" />{item}</li>)}
            </ul>
          </div>
        </aside>

        <section className="grid min-w-0 gap-5">
          <div className="grid gap-5 2xl:grid-cols-[minmax(420px,0.72fr)_minmax(760px,1.35fr)]">
            <div className="relative min-h-[720px] overflow-hidden rounded-2xl border border-[var(--st-line)] bg-[#eceff1] shadow-sm">
              <div className="absolute left-5 top-5 z-10 rounded-full border border-white/70 bg-white/85 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-600 shadow-sm backdrop-blur">
                3D preview · orbit every angle
              </div>
              <PackagingScene
                box={kind === "box" ? box : undefined}
                pouch={kind === "box" ? undefined : pouch}
                fold={fold}
                artworkCanvas={kind === "box" ? null : studioArtwork.canvas}
                artworkRevision={kind === "box" ? 0 : studioArtwork.revision}
              />
            </div>

            <div className="min-h-[720px] min-w-0 rounded-2xl border border-[var(--st-line)] bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold">2D dieline artwork editor</p>
                  <p className="mt-1 text-xs text-[var(--st-faint)]">
                    {kind === "box" ? "Manufacturing blank preview." : "The production Studio editor on one continuous film web."}
                  </p>
                </div>
                <span className="font-mono text-xs text-[var(--st-dim)]">
                  {kind === "box" ? `${box.blank.width.toFixed(1)} × ${box.blank.height.toFixed(1)} mm` : `${pouch.web.width.toFixed(1)} × ${pouch.web.height.toFixed(1)} mm`}
                </span>
              </div>
              <div className="relative min-h-0 min-w-0 rounded-xl">
                {kind === "box" ? (
                  <div className="h-[660px] rounded-xl border border-slate-100 bg-slate-50 p-4">
                    <DielinePreview solution={activeSolution} />
                  </div>
                ) : (
                  <PouchStudioEditor
                    solution={pouch}
                    onArtworkCanvasChange={handleStudioArtworkChange}
                  />
                )}
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-[var(--st-line)] bg-white p-5 shadow-sm">
            <div className="grid gap-5 xl:grid-cols-[minmax(220px,0.45fr)_minmax(0,1fr)]">
              <div>
              <p className="text-sm font-semibold">Resolved structure</p>
              <p className="mt-1 text-xs leading-5 text-[var(--st-faint)]">The values below and both previews come from the same solver output.</p>
              </div>
              {kind === "box" ? (
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <DimensionTriplet label="Inner" values={box.inner} />
                  <DimensionTriplet label="Manufacture / knife" values={box.manufacture} />
                  <DimensionTriplet label="Outer" values={box.outer} />
                  <div className="rounded-xl bg-slate-900 px-4 py-3 text-white">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">Board caliper</p>
                    <p className="mt-1 font-mono text-sm font-semibold">{box.material.caliperMm.toFixed(2)} mm</p>
                  </div>
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-xl border border-[var(--st-line)] p-4"><p className={labelClass}>Flat web</p><p className="font-mono text-sm font-semibold">{pouch.web.width.toFixed(1)} × {pouch.web.height.toFixed(1)} mm</p></div>
                  <div className="rounded-xl border border-[var(--st-line)] p-4"><p className={labelClass}>{pouch.style === "stand-up" ? "Standing body" : "Inflated pillow"}</p><p className="font-mono text-sm font-semibold">{pouch.input.width.toFixed(1)} × {pouch.input.height.toFixed(1)} × {pouch.inflatedDepth.toFixed(1)} mm</p></div>
                  <div className="rounded-xl bg-slate-900 px-4 py-3 text-white"><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">Film caliper</p><p className="mt-1 font-mono text-sm font-semibold">{pouch.material.caliperMm.toFixed(2)} mm</p></div>
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
