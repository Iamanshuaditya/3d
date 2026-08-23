"use client";

import type { EmbroideryResult, EmbroiderySettings } from "@/types/embroidery";
import { generateEmbroidery, type EmbroideryQuality } from "./index";
import { supportsWorkerPipeline } from "./canvas";
import type { StitchRequest, StitchResponse } from "./stitch-worker-protocol";

/**
 * Client for the stitch worker, with a main-thread fallback.
 *
 * One worker is shared by the whole session and started lazily, so a product
 * nobody embroiders never pays for it. Requests carry an id and results are
 * matched back by it, which is what makes a superseded request harmless: its
 * promise settles, the caller sees a stale signature and drops it.
 *
 * Where `OffscreenCanvas` or workers are unavailable the same pipeline runs
 * inline. The result is identical — only the thread differs.
 */

type Pending = {
  resolve: (result: EmbroideryResult) => void;
  reject: (error: Error) => void;
};

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, Pending>();
/** Set once a worker has failed, so we stop trying to start it every time. */
let workerUnavailable = false;

function ensureWorker(): Worker | null {
  if (workerUnavailable || !supportsWorkerPipeline()) return null;
  if (worker) return worker;

  try {
    worker = new Worker(new URL("./stitch.worker.ts", import.meta.url), {
      type: "module",
      name: "embroidery-stitch",
    });
  } catch {
    workerUnavailable = true;
    return null;
  }

  worker.onmessage = (event: MessageEvent<StitchResponse>) => {
    const entry = pending.get(event.data.id);
    if (!entry) return;
    pending.delete(event.data.id);
    if (event.data.ok) entry.resolve(event.data.payload as unknown as EmbroideryResult);
    else entry.reject(new Error(event.data.error));
  };

  worker.onerror = (event) => {
    // A worker that cannot start must not strand every future request, and
    // must not leave the studio without stitching: fail the queue and fall
    // back to the main thread from here on.
    workerUnavailable = true;
    const failure = new Error(event.message || "The stitch worker failed to start.");
    for (const [, entry] of pending) entry.reject(failure);
    pending.clear();
    worker?.terminate();
    worker = null;
  };

  return worker;
}

export type StitchJob = {
  image: CanvasImageSource;
  widthMm: number;
  heightMm: number;
  settings: EmbroiderySettings;
  quality: EmbroideryQuality;
};

export async function generateEmbroideryAsync(job: StitchJob): Promise<EmbroideryResult> {
  const active = ensureWorker();
  if (!active) return generateEmbroidery(job);

  // Only an ImageBitmap can cross the boundary, and transferring it hands the
  // worker ownership — so this is a fresh one each time, never the shared
  // decoded asset the editor is still drawing from.
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(job.image as ImageBitmapSource);
  } catch {
    return generateEmbroidery(job);
  }

  const id = nextId;
  nextId += 1;
  const request: StitchRequest = {
    id,
    bitmap,
    widthMm: job.widthMm,
    heightMm: job.heightMm,
    settings: job.settings,
    quality: job.quality,
  };

  return new Promise<EmbroideryResult>((resolve, reject) => {
    pending.set(id, { resolve, reject });
    active.postMessage(request, [bitmap]);
  });
}

/** Test/teardown hook: drops the shared worker and fails anything in flight. */
export function shutdownStitchWorker(): void {
  for (const [, entry] of pending) {
    entry.reject(new Error("The stitch worker was shut down."));
  }
  pending.clear();
  worker?.terminate();
  worker = null;
  workerUnavailable = false;
}
