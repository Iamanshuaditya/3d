"""Mapping strategies: compute a customization UV (0-1 per region) for a set of
triangles, given world-space geometry.

Each strategy returns per-corner UVs (len == 3 * n_faces) plus a dict of
physical/layout metadata. Per-corner output lets a strategy split seam-crossing
faces without touching topology; the exporter welds corners back into vertices.

Registry pattern: add a function, register it, reference it from a manifest.
No strategy may assume a product type.
"""
from __future__ import annotations

import numpy as np

AXES = {"x": 0, "y": 1, "z": 2}


def _axis_frame(axis: str):
    """Return (height_idx, plane_idx_a, plane_idx_b) for a wrap/planar axis."""
    h = AXES[axis]
    a, b = [i for i in range(3) if i != h]
    return h, a, b


# --------------------------------------------------------------------- planar

def planar(positions: np.ndarray, faces: np.ndarray, cfg: dict, cm_per_unit: float):
    """Orthographic projection along cfg['axis']. U/V = the two remaining axes.

    cfg: axis ('x'|'y'|'z'), optional flip_u/flip_v (bool), view ('+'|'-')
    side the surface is meant to be seen from — '-y' (from below) mirrors U so
    text reads correctly for the viewer.
    """
    h, a, b = _axis_frame(cfg.get("axis", "y"))
    corners = positions[faces.ravel()]
    u = corners[:, a].astype(np.float64)
    v = corners[:, b].astype(np.float64)
    if cfg.get("flip_u"):
        u = -u
    if cfg.get("flip_v"):
        v = -v
    u -= u.min()
    v -= v.min()
    w_cm = float(u.max()) * cm_per_unit
    h_cm = float(v.max()) * cm_per_unit
    uv = np.stack([u / max(u.max(), 1e-12), v / max(v.max(), 1e-12)], axis=1)
    return uv, {"physicalWidthCm": round(w_cm, 2), "physicalHeightCm": round(h_cm, 2),
                "strategy": "planar", "axis": cfg.get("axis", "y")}


# ----------------------------------------------------------------------- wrap

def wrap(positions: np.ndarray, faces: np.ndarray, cfg: dict, cm_per_unit: float):
    """Unroll a band that wraps around cfg['axis'] (default 'y').

    U = normalized ARC LENGTH around the cross-section outline (true distances
    even for stadium/rounded-rect sections, unlike raw angle), V = height along
    the axis. Seam is placed at cfg['seam_deg'] (default 180 = the back).
    Faces crossing the seam get their low-U corners shifted by +1 turn, then
    everything is renormalized — corners are per-face so no topology edits.
    """
    h, a, b = _axis_frame(cfg.get("axis", "y"))
    center_a = (positions[:, a].min() + positions[:, a].max()) / 2
    center_b = (positions[:, b].min() + positions[:, b].max()) / 2

    corners = positions[faces.ravel()].astype(np.float64)
    ca = corners[:, a] - center_a
    cb = corners[:, b] - center_b
    theta = np.arctan2(cb, ca)  # [-pi, pi]
    seam = np.deg2rad(cfg.get("seam_deg", 180.0))
    theta = (theta - seam) % (2 * np.pi)  # 0..2pi with seam at 0

    # arc-length parameterization of the outline r(theta)
    bins = 512
    idxs = np.minimum((theta / (2 * np.pi) * bins).astype(int), bins - 1)
    radius = np.sqrt(ca ** 2 + cb ** 2)
    r_bin = np.full(bins, np.nan)
    for i in range(bins):
        sel = radius[idxs == i]
        if len(sel):
            r_bin[i] = np.median(sel)
    # fill gaps by interpolation (wrap-around)
    good = ~np.isnan(r_bin)
    if good.sum() < bins:
        xp = np.where(good)[0]
        r_bin = np.interp(np.arange(bins), xp, r_bin[xp], period=bins)
    dtheta = 2 * np.pi / bins
    dr = np.gradient(r_bin)
    ds = np.sqrt((r_bin * dtheta) ** 2 + dr ** 2)
    s_cum = np.concatenate([[0], np.cumsum(ds)])
    total_s = s_cum[-1]
    u = np.interp(theta / (2 * np.pi) * bins, np.arange(bins + 1), s_cum) / total_s
    if cfg.get("flip_u"):
        u = 1.0 - u

    # seam-crossing faces: if a face spans more than half a turn, shift its low side
    u_f = u.reshape(-1, 3)
    span = u_f.max(axis=1) - u_f.min(axis=1)
    crossing = span > 0.5
    u_f[crossing] = np.where(u_f[crossing] < 0.5, u_f[crossing] + 1.0, u_f[crossing])
    u = u_f.ravel()
    u_max = float(u.max())  # slightly >1 for wrap-margin corners
    u = u / u_max

    hgt = corners[:, h]
    v = (hgt - hgt.min()) / max(float(hgt.max() - hgt.min()), 1e-12)
    if cfg.get("flip_v"):
        v = 1.0 - v

    return np.stack([u, v], axis=1), {
        "physicalWidthCm": round(total_s * u_max * cm_per_unit, 2),
        "physicalHeightCm": round(float(hgt.max() - hgt.min()) * cm_per_unit, 2),
        "strategy": "wrap", "axis": cfg.get("axis", "y"),
        "seamDeg": cfg.get("seam_deg", 180.0),
        "perimeterCm": round(total_s * cm_per_unit, 2),
    }


# -------------------------------------------------------------- reuse existing

def reuse_existing(positions, faces, cfg, cm_per_unit, existing_uv=None):
    """Keep the mesh's authored UV as the customization UV (optionally
    renormalized to its occupied bounding box so the canvas is fully used)."""
    if existing_uv is None:
        raise ValueError("reuse_existing requires the mesh's existing UV")
    uv = existing_uv[faces.ravel()].astype(np.float64).copy()
    if cfg.get("normalize", True):
        uv -= uv.min(axis=0)
        uv /= np.maximum(uv.max(axis=0), 1e-12)
    return uv, {"strategy": "reuse_existing",
                "physicalWidthCm": cfg.get("physicalWidthCm"),
                "physicalHeightCm": cfg.get("physicalHeightCm")}


STRATEGIES = {
    "planar": planar,
    "wrap": wrap,
    "reuse_existing": reuse_existing,
}
