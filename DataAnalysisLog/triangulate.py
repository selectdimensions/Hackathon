#!/usr/bin/env python3
"""triangulate.py — offline TDOA + RSSI triangulation harness.

Stub. v0.1 reads a fixture (ndjson of DetectPacket events) and a ground-truth
emitter location, and exits 0 with a printed estimate. Real solver lands in v0.2.

Usage:
  python triangulate.py --fixture fixtures/tdoa_3pod_clear.jsonl \
                        --truth   fixtures/tdoa_3pod_clear.truth.json \
                        --format  json
"""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path


def haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6_371_000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))


def solve_tdoa(events: list[dict]) -> tuple[float, float, str] | None:
    """Returns (lat, lon, method) or None on insufficient data."""
    # TODO: implement Bancroft closed-form or iterative LS.
    # For now: centroid of reporting pods (placeholder).
    if len(events) < 3:
        return None
    if any(ev.get("pps_timestamp_us", 0) == 0 for ev in events):
        # Some pod missing PPS — caller should fall back to RSSI.
        return None
    lat = sum(ev["lat"] for ev in events) / len(events)
    lon = sum(ev["lon"] for ev in events) / len(events)
    return (lat, lon, "tdoa")


def solve_rssi(events: list[dict]) -> tuple[float, float, str] | None:
    """RSSI-weighted centroid fallback."""
    if not events:
        return None
    weights = [10 ** (ev["rssi_dbm"] / 10.0) for ev in events]
    total = sum(weights)
    if total == 0:
        return None
    lat = sum(w * ev["lat"] for w, ev in zip(weights, events)) / total
    lon = sum(w * ev["lon"] for w, ev in zip(weights, events)) / total
    return (lat, lon, "rssi")


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--fixture", required=True, type=Path)
    p.add_argument("--truth",   required=True, type=Path)
    p.add_argument("--format",  choices=("json", "text"), default="text")
    args = p.parse_args()

    events: list[dict] = []
    with args.fixture.open(encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            events.append(json.loads(line))
    truth = json.loads(args.truth.read_text(encoding="utf-8"))

    detect_events = [ev for ev in events if ev.get("event") == "detect"]
    est = solve_tdoa(detect_events) or solve_rssi(detect_events)
    if est is None:
        print(json.dumps({"error": "insufficient data"}))
        return 2

    lat, lon, method = est
    err_m = haversine_m(lat, lon, truth["lat"], truth["lon"])
    out = {
        "estimated_lat": lat,
        "estimated_lon": lon,
        "error_meters": err_m,
        "method": method,
        "truth_lat": truth["lat"],
        "truth_lon": truth["lon"],
    }
    if args.format == "json":
        print(json.dumps(out, indent=2))
    else:
        print(f"method={method}  est=({lat:.6f},{lon:.6f})  truth=({truth['lat']:.6f},{truth['lon']:.6f})  err={err_m:.1f} m")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
