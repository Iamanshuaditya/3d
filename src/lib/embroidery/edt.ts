/**
 * Exact Euclidean distance transform (Felzenszwalb & Huttenlocher, 2012).
 *
 * Two separable O(n) passes of a lower-envelope-of-parabolas scan. We need the
 * real distance-to-edge — not a chamfer approximation — because the stitch
 * direction field is its gradient, and a chamfer metric produces visible
 * eight-fold banding in the thread angles.
 */

const INF = 1e20;

function transform1d(f: Float64Array, n: number, out: Float64Array) {
  const v = new Int32Array(n);
  const z = new Float64Array(n + 1);
  let k = 0;
  v[0] = 0;
  z[0] = -INF;
  z[1] = INF;

  for (let q = 1; q < n; q += 1) {
    let s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) {
      k -= 1;
      s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    }
    k += 1;
    v[k] = q;
    z[k] = s;
    z[k + 1] = INF;
  }

  k = 0;
  for (let q = 0; q < n; q += 1) {
    while (z[k + 1] < q) k += 1;
    const d = q - v[k];
    out[q] = d * d + f[v[k]];
  }
}

/**
 * Distance in pixels from every set pixel to the nearest unset pixel.
 * Unset pixels get 0, so the result is the "how deep inside the shape am I"
 * field the stitch planner needs.
 */
export function distanceInside(mask: Uint8Array, width: number, height: number): Float32Array {
  const squared = new Float64Array(width * height);
  for (let i = 0; i < squared.length; i += 1) squared[i] = mask[i] ? INF : 0;

  const column = new Float64Array(height);
  const columnOut = new Float64Array(height);
  const row = new Float64Array(width);
  const rowOut = new Float64Array(width);

  for (let x = 0; x < width; x += 1) {
    for (let y = 0; y < height; y += 1) column[y] = squared[y * width + x];
    transform1d(column, height, columnOut);
    for (let y = 0; y < height; y += 1) squared[y * width + x] = columnOut[y];
  }
  for (let y = 0; y < height; y += 1) {
    const base = y * width;
    for (let x = 0; x < width; x += 1) row[x] = squared[base + x];
    transform1d(row, width, rowOut);
    for (let x = 0; x < width; x += 1) squared[base + x] = rowOut[x];
  }

  const out = new Float32Array(width * height);
  for (let i = 0; i < out.length; i += 1) out[i] = Math.sqrt(squared[i]);
  return out;
}

/**
 * Sliding-window maximum in O(n) per axis, independent of radius
 * (van Herk / Gil-Werman). Used to turn "distance to edge" into "how wide is
 * the shape around here", which is what decides satin versus fill.
 *
 * The naive window scan is O(n·r), and r here is a 6 mm satin threshold — 48
 * pixels at full quality — which turned this single step into more work than
 * the rest of the pipeline combined.
 */
function runningMax1d(
  source: Float32Array,
  offset: number,
  stride: number,
  count: number,
  radius: number,
  out: Float32Array,
  outOffset: number,
  outStride: number,
  padded: Float32Array,
  prefix: Float32Array,
  suffix: Float32Array,
) {
  const window = 2 * radius + 1;
  const padCount = count + 2 * radius;
  // Replicate the edge value into the padding so the window is clamped, which
  // is the same border rule the naive scan uses.
  for (let i = 0; i < padCount; i += 1) {
    const source_i = Math.min(count - 1, Math.max(0, i - radius));
    padded[i] = source[offset + source_i * stride];
  }
  for (let i = 0; i < padCount; i += 1) {
    prefix[i] = i % window === 0 ? padded[i] : Math.max(prefix[i - 1], padded[i]);
  }
  for (let i = padCount - 1; i >= 0; i -= 1) {
    suffix[i] = (i + 1) % window === 0 || i === padCount - 1
      ? padded[i]
      : Math.max(suffix[i + 1], padded[i]);
  }
  // The window for output j is padded[j .. j + window - 1], which straddles at
  // most two blocks — so one suffix and one prefix lookup covers it exactly.
  for (let j = 0; j < count; j += 1) {
    out[outOffset + j * outStride] = Math.max(suffix[j], prefix[j + window - 1]);
  }
}

export function maxFilter(
  source: Float32Array,
  width: number,
  height: number,
  radius: number,
): Float32Array {
  const r = Math.max(1, Math.round(radius));
  const pass = new Float32Array(width * height);
  const out = new Float32Array(width * height);
  const span = Math.max(width, height) + 2 * r;
  const padded = new Float32Array(span);
  const prefix = new Float32Array(span);
  const suffix = new Float32Array(span);

  for (let y = 0; y < height; y += 1) {
    runningMax1d(source, y * width, 1, width, r, pass, y * width, 1, padded, prefix, suffix);
  }
  for (let x = 0; x < width; x += 1) {
    runningMax1d(pass, x, width, height, r, out, x, width, padded, prefix, suffix);
  }
  return out;
}
