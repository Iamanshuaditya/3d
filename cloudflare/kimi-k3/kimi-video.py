#!/usr/bin/env python3
import argparse
import base64
import glob
import json
import os
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request

API_URL = "https://api.unorouter.com/v1/chat/completions"
MODEL = "kimi-k3:free"


def extract_frames(video: str, count: int, tmpdir: str, max_width: int = 1024) -> list[str]:
    probe = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", video],
        capture_output=True, text=True, check=True,
    )
    duration = float(probe.stdout.strip())
    step = max(duration / (count + 1), 0.1)
    pattern = os.path.join(tmpdir, "frame_%03d.jpg")
    subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "error", "-i", video, "-vf",
         f"fps=1/{step},scale='min(iw,{max_width})':-2", "-frames:v", str(count), "-q:v", "7", pattern],
        check=True,
    )
    return sorted(glob.glob(os.path.join(tmpdir, "frame_*.jpg")))


def ask(frames: list[str], prompt: str, api_key: str, retries: int = 3, fast: bool = False) -> str:
    parts = []
    for f in frames:
        b64 = base64.b64encode(open(f, "rb").read()).decode()
        parts.append({"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{b64}"}})
    parts.append({"type": "text", "text": prompt})
    payload = {
        "model": MODEL,
        "messages": [{
            "role": "user",
            "content": [{"type": "text", "text": f"You are analyzing frames extracted from a video, in chronological order. {prompt}"}] + parts[:-1],
        }],
    }
    if fast:
        payload["reasoning_effort"] = "low"
    body = json.dumps(payload).encode()
    req = urllib.request.Request(API_URL, data=body, headers={
        "Content-Type": "application/json",
        "Authorization": f"Bearer {api_key}",
    })
    for attempt in range(retries + 1):
        try:
            with urllib.request.urlopen(req, timeout=300) as r:
                d = json.loads(r.read())
            break
        except urllib.error.HTTPError as e:
            detail = e.read().decode()[:500]
            retriable = e.code in (429, 500, 502, 503, 504)
            if not retriable or attempt == retries:
                raise SystemExit(f"API error {e.code}: {detail}")
            wait = 70
            print(f"API {e.code} (attempt {attempt + 1}/{retries + 1}), retrying in {wait}s...", file=sys.stderr)
            time.sleep(wait)
    msg = d["choices"][0]["message"]
    reasoning = msg.get("reasoning_content")
    out = msg.get("content") or ""
    if reasoning:
        out = f"[thinking] {reasoning.strip()}\n\n{out}"
    usage = d.get("usage", {})
    return f"{out}\n\n---\nmodel: {d.get('model')} | tokens: {usage.get('total_tokens')}"


def main() -> None:
    p = argparse.ArgumentParser(description="Ask Kimi K3 about a video (free route)")
    p.add_argument("video", help="path to video file (mp4/mov/webm/...)")
    p.add_argument("prompt", help="what to ask about the video")
    p.add_argument("--frames", type=int, default=6, help="number of frames to sample (default 6)")
    p.add_argument("--key", default=os.environ.get("UNOROUTER_API_KEY"), help="UnoRouter API key (or set UNOROUTER_API_KEY)")
    p.add_argument("--fast", action="store_true", help="reasoning_effort=low for faster responses")
    args = p.parse_args()

    if not args.key:
        raise SystemExit("Set UNOROUTER_API_KEY env var or pass --key")
    if not os.path.exists(args.video):
        raise SystemExit(f"Video not found: {args.video}")

    with tempfile.TemporaryDirectory() as tmpdir:
        frames = extract_frames(args.video, args.frames, tmpdir)
        if not frames:
            raise SystemExit("Frame extraction produced no frames")
        print(f"Sampled {len(frames)} frames, asking kimi-k3...\n", file=sys.stderr)
        print(ask(frames, args.prompt, args.key, fast=args.fast))


if __name__ == "__main__":
    main()
