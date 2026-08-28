"use client";

import { Box, ImagePlus, PackageOpen, ScanLine, Sparkles, Trash2, Upload } from "lucide-react";
import { useMemo, useState } from "react";
import {
  PACDORA_LAB_BOX_MATERIALS,
  PACDORA_LAB_POUCH_MATERIALS,
  solvePacdoraLabBox,
  solvePacdoraLabPouch,
  type BoxLabInput,
  type DimensionMode,
  type PackagingKind,
  type PouchArtwork,
  type PouchLabInput,
} from "@/lib/pacdora-lab";
import { DielinePreview } from "./DielinePreview";
import { PackagingScene } from "./PackagingScene";
import { usePouchArtworkCanvas } from "./usePouchArtworkCanvas";

const inputClass = "h-10 w-full rounded-lg border border-[var(--st-line)] bg-white px-3 text-sm font-medium text-[var(--st-text)] outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200";
const labelClass = "mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.13em] text-[var(--st-faint)]";

function NumericField({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  const [resolvedValue, setResolvedValue] = useState(value);
  if (value !== resolvedValue) {
    setResolvedValue(value);
    setDraft(String(value));
  }

  const commitDraft = () => {
    const parsed = Number(draft);
    if (!Number.isFinite(parsed)) {
      setDraft(String(value));
      return;
    }
    const next = Math.min(max, Math.max(min, parsed));
    setDraft(String(next));
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
          min={min}
          max={max}
          step={step}
          onChange={(event) => {
            const nextDraft = event.currentTarget.value;
            setDraft(nextDraft);
            const parsed = Number(nextDraft);
            if (nextDraft !== ""
              && Number.isFinite(parsed)
              && parsed >= min
              && parsed <= max) {
              onChange(parsed);
            }
          }}
          onBlur={commitDraft}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
            if (event.key === "Escape") setDraft(String(value));
          }}
        />
        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-[var(--st-faint)]">mm</span>
      </div>
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
  const [kind, setKind] = useState<PackagingKind>("box");
  const [fold, setFold] = useState(0.43);
  const [boxInput, setBoxInput] = useState<BoxLabInput>({
    dimensions: { length: 169, width: 169, height: 117.5 },
    dimensionMode: "manufacture",
    materialId: "e-flute",
  });
  const [pouchInput, setPouchInput] = useState<PouchLabInput>({
    style: "center-seal",
    width: 150,
    height: 210,
    depth: 42,
    materialId: "matte-film",
    inflation: 0.1,
    endSealMm: 12,
    backSealMm: 14,
    gussetMm: 62,
    zipper: false,
    hangHole: false,
  });
  const [artwork, setArtwork] = useState<PouchArtwork | null>(null);
  const [artworkError, setArtworkError] = useState<string | null>(null);
  const box = useMemo(() => solvePacdoraLabBox(boxInput), [boxInput]);
  const pouch = useMemo(() => solvePacdoraLabPouch(pouchInput), [pouchInput]);
  const artworkCanvas = usePouchArtworkCanvas(pouch, artwork);
  const activeSolution = kind === "box" ? box : pouch;

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
    setPouchInput((current) => ({ ...current, [key]: value }));
  };
  const selectConstruction = (candidate: PackagingKind) => {
    setKind(candidate);
    if (candidate !== "box") {
      setPouchInput((current) => ({
        ...current,
        style: candidate,
        zipper: candidate === "stand-up" ? true : current.zipper,
        hangHole: candidate === "stand-up" ? true : current.hangHole,
      }));
    }
  };
  const applyArtworkFile = (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setArtworkError("Choose a PNG, JPEG, WebP, or SVG image.");
      return;
    }
    if (file.size > 12 * 1024 * 1024) {
      setArtworkError("Artwork must be 12 MB or smaller for this browser preview.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") return;
      setArtwork((current) => ({
        sourceUrl: reader.result as string,
        name: file.name,
        placement: current?.placement ?? "front",
        fit: current?.fit ?? "cover",
      }));
      setArtworkError(null);
    };
    reader.onerror = () => setArtworkError("The selected artwork could not be read.");
    reader.readAsDataURL(file);
  };
  const useDemoArtwork = () => {
    setArtwork((current) => ({
      sourceUrl: "/pacdora-lab/citrus-demo.svg",
      name: "Citrus demo artwork",
      placement: current?.placement ?? "front",
      fit: current?.fit ?? "cover",
    }));
    setArtworkError(null);
  };

  return (
    <main className="min-h-screen bg-[#f7f8fa] text-[var(--st-text)]">
      <header className="border-b border-[var(--st-line)] bg-white px-5 py-4 lg:px-8">
        <div className="mx-auto flex max-w-[1520px] flex-wrap items-center justify-between gap-4">
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

      <div className="mx-auto grid max-w-[1520px] gap-5 p-5 lg:grid-cols-[320px_minmax(0,1fr)] lg:p-8">
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
              <div className="grid grid-cols-2 gap-3">
                <NumericField label="Face width" value={pouchInput.width} min={50} max={400} onChange={(value) => updatePouch("width", Math.max(1, value || 1))} />
                <NumericField label="Height" value={pouchInput.height} min={80} max={600} onChange={(value) => updatePouch("height", Math.max(1, value || 1))} />
                <NumericField label="Target depth" value={pouchInput.depth} min={10} max={180} onChange={(value) => updatePouch("depth", Math.max(1, value || 1))} />
                {kind === "stand-up" ? (
                  <NumericField label="Bottom gusset" value={pouchInput.gussetMm} min={20} max={160} onChange={(value) => updatePouch("gussetMm", Math.max(1, value || 1))} />
                ) : (
                  <NumericField label="Back fin seal" value={pouchInput.backSealMm} min={6} max={35} onChange={(value) => updatePouch("backSealMm", Math.max(1, value || 1))} />
                )}
                <NumericField label="Heat seal" value={pouchInput.endSealMm} min={6} max={30} onChange={(value) => updatePouch("endSealMm", Math.max(1, value || 1))} />
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
                  <span className={labelClass}>2D → 3D artwork</span>
                  <span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${artworkCanvas.status === "ready" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                    {artworkCanvas.status === "ready" ? "UV mapped" : artworkCanvas.status === "loading" ? "Mapping…" : "No artwork"}
                  </span>
                </div>
                {artwork ? (
                  <div className="space-y-3">
                    <div className="flex items-center gap-3 rounded-xl border border-[var(--st-line)] bg-slate-50 p-3">
                      <div
                        role="img"
                        aria-label={`${artwork.name} preview`}
                        className="size-12 shrink-0 rounded-lg border border-white bg-white bg-cover bg-center shadow-sm"
                        style={{ backgroundImage: `url("${artwork.sourceUrl}")` }}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-semibold text-slate-800">{artwork.name}</p>
                        <p className="mt-1 text-[10px] text-slate-500">One canvas drives the dieline and 3D texture.</p>
                      </div>
                      <button
                        type="button"
                        aria-label="Remove artwork"
                        className="rounded-lg p-2 text-slate-500 transition hover:bg-white hover:text-slate-900"
                        onClick={() => {
                          setArtwork(null);
                          setArtworkError(null);
                        }}
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>

                    <div>
                      <span className={labelClass}>Print faces</span>
                      <div className="grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1">
                        {(["front", "both", "back"] as const).map((placement) => (
                          <button
                            key={placement}
                            type="button"
                            aria-pressed={artwork.placement === placement}
                            className={`rounded-lg px-2 py-2 text-[11px] font-semibold capitalize transition ${artwork.placement === placement ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}
                            onClick={() => setArtwork((current) => current ? { ...current, placement } : current)}
                          >
                            {placement}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <span className={labelClass}>Image fit</span>
                      <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1">
                        {(["cover", "contain"] as const).map((fit) => (
                          <button
                            key={fit}
                            type="button"
                            aria-pressed={artwork.fit === fit}
                            className={`rounded-lg px-2 py-2 text-[11px] font-semibold transition ${artwork.fit === fit ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}
                            onClick={() => setArtwork((current) => current ? { ...current, fit } : current)}
                          >
                            {fit === "cover" ? "Fill panel" : "Fit inside"}
                          </button>
                        ))}
                      </div>
                    </div>

                    <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-white px-3 py-2.5 text-xs font-semibold text-slate-700 transition hover:border-slate-500 hover:bg-slate-50">
                      <Upload className="size-4" /> Replace artwork
                      <input
                        className="sr-only"
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/svg+xml"
                        onChange={(event) => {
                          applyArtworkFile(event.currentTarget.files?.[0]);
                          event.currentTarget.value = "";
                        }}
                      />
                    </label>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-center transition hover:border-slate-500 hover:bg-white">
                      <span className="flex size-9 items-center justify-center rounded-full bg-white text-slate-700 shadow-sm">
                        <ImagePlus className="size-4" />
                      </span>
                      <span className="mt-2 text-xs font-semibold text-slate-800">Upload artwork</span>
                      <span className="mt-1 text-[10px] text-slate-500">PNG, JPEG, WebP, or SVG · up to 12 MB</span>
                      <input
                        className="sr-only"
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/svg+xml"
                        onChange={(event) => {
                          applyArtworkFile(event.currentTarget.files?.[0]);
                          event.currentTarget.value = "";
                        }}
                      />
                    </label>
                    <button
                      type="button"
                      onClick={useDemoArtwork}
                      className="flex w-full items-center justify-center gap-2 rounded-xl border border-[var(--st-line)] bg-white px-3 py-2.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                    >
                      <Sparkles className="size-4 text-amber-500" /> Try demo artwork
                    </button>
                  </div>
                )}
                {artworkError || artworkCanvas.error ? (
                  <p className="mt-2 text-[11px] leading-4 text-red-600">{artworkError ?? artworkCanvas.error}</p>
                ) : null}
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

        <section className="grid min-w-0 gap-5 xl:grid-rows-[minmax(520px,1fr)_auto]">
          <div className="relative min-h-[500px] overflow-hidden rounded-2xl border border-[var(--st-line)] bg-[#eceff1] shadow-sm">
            <div className="absolute left-5 top-5 z-10 rounded-full border border-white/70 bg-white/85 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-600 shadow-sm backdrop-blur">
              Generated mesh · orbit to inspect
            </div>
            <PackagingScene
              box={kind === "box" ? box : undefined}
              pouch={kind === "box" ? undefined : pouch}
              fold={fold}
              artworkCanvas={kind === "box" ? null : artworkCanvas.canvas}
            />
          </div>

          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(330px,0.7fr)]">
            <div className="min-h-[360px] rounded-2xl border border-[var(--st-line)] bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold">Canonical flat web</p>
                  <p className="mt-1 text-xs text-[var(--st-faint)]">Black = cut · red = crease · green = heat seal</p>
                </div>
                <span className="font-mono text-xs text-[var(--st-dim)]">
                  {kind === "box" ? `${box.blank.width.toFixed(1)} × ${box.blank.height.toFixed(1)} mm` : `${pouch.web.width.toFixed(1)} × ${pouch.web.height.toFixed(1)} mm`}
                </span>
              </div>
              <div className="h-[290px] rounded-xl bg-slate-50 p-4">
                <DielinePreview
                  solution={activeSolution}
                  artworkPreviewUrl={kind === "box" ? null : artworkCanvas.previewUrl}
                />
              </div>
            </div>

            <div className="rounded-2xl border border-[var(--st-line)] bg-white p-5 shadow-sm">
              <p className="text-sm font-semibold">Resolved structure</p>
              <p className="mt-1 text-xs leading-5 text-[var(--st-faint)]">The values below and both previews come from the same solver output.</p>
              {kind === "box" ? (
                <div className="mt-5 space-y-3">
                  <DimensionTriplet label="Inner" values={box.inner} />
                  <DimensionTriplet label="Manufacture / knife" values={box.manufacture} />
                  <DimensionTriplet label="Outer" values={box.outer} />
                  <div className="rounded-xl bg-slate-900 px-4 py-3 text-white">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">Board caliper</p>
                    <p className="mt-1 font-mono text-sm font-semibold">{box.material.caliperMm.toFixed(2)} mm</p>
                  </div>
                </div>
              ) : (
                <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
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
