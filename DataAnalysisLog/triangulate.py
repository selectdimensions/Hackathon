#!/usr/bin/env python3
"""triangulate.py — offline emitter-localization harness (v0.3).

Solve order reflects what actually works on commodity hardware (see
pod-sensor-reference.md S1 and docs/V02_PIVOT.md S4 / gap C1):

  1. ACOUSTIC TDOA (primary, precise). Sound travels ~343 m/s, so GNSS-PPS-
     disciplined arrival timestamps (tens of ns) give sub-metre 3D fixes. Needs
     >=4 pods (one elevated for the vertical), sensor_class == ACOUSTIC.
  2. RSSI multilateration (RF fallback). Inverse path-loss ranges + least
     squares. ~50-300 m depending on band/geometry.
  3. RSSI-weighted centroid (last resort).

RF sample-accurate TDOA is intentionally NOT here: at c, ns-level cross-pod sync
is needed and host-timestamped SDR jitter makes it multi-km. That is v0.4
research (reference-TX cross-correlation); for RF emitters use bearing/DoA.

Usage:
  python triangulate.py --fixture fixtures/acoustic_4pod_3d.jsonl \
                        --truth   fixtures/acoustic_4pod_3d.truth.json --format json
"""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path

SPEED_OF_SOUND_MPS = 343.0

# Per-band inverse-path-loss constants for RSSI ranging (rssi = txPower - 10*n*log10(r) - 40).
# Mirrors BAND_PATHLOSS in demo/js/sim/masterNode.js.
BAND_PATHLOSS = {
    2: {"tx_power": 23, "n": 2.6},  # 433/868
    3: {"tx_power": 30, "n": 2.5},  # GNSS L1
    4: {"tx_power": 27, "n": 2.3},  # 2.4 GHz
    5: {"tx_power": 27, "n": 2.2},  # 5.8 GHz
    1: {"tx_power": 25, "n": 2.5},  # 30-88 MHz
}

# SensorClass mirror (shared/Protocol.h).
SENSOR_ACOUSTIC = 0x02


def haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6_371_000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


# ---- Local ENU projection (flat-earth, fine over a few km) ----
def to_enu(lat: float, lon: float, alt: float, lat0: float, lon0: float):
    cos_lat = math.cos(math.radians(lat0))
    e = (lon - lon0) * 111_320.0 * cos_lat
    n = (lat - lat0) * 111_132.0
    return e, n, alt


def enu_to_latlon(e: float, n: float, lat0: float, lon0: float):
    cos_lat = math.cos(math.radians(lat0))
    lat = lat0 + n / 111_132.0
    lon = lon0 + e / (111_320.0 * cos_lat)
    return lat, lon


def _solve_linear(a: list[list[float]], b: list[float]) -> list[float] | None:
    """Gaussian elimination with partial pivoting for a small n x n system."""
    n = len(b)
    m = [row[:] + [b[i]] for i, row in enumerate(a)]
    for col in range(n):
        piv = max(range(col, n), key=lambda r: abs(m[r][col]))
        if abs(m[piv][col]) < 1e-12:
            return None
        m[col], m[piv] = m[piv], m[col]
        for r in range(n):
            if r == col:
                continue
            f = m[r][col] / m[col][col]
            for c in range(col, n + 1):
                m[r][c] -= f * m[col][c]
    return [m[i][n] / m[i][i] for i in range(n)]


def solve_acoustic_tdoa(events: list[dict]) -> tuple[float, float, float, str] | None:
    """3D Gauss-Newton TDOA on acoustic arrival times. Returns (lat, lon, alt, method)."""
    pods = [
        ev
        for ev in events
        if ev.get("sensor_class") == SENSOR_ACOUSTIC and ev.get("pps_timestamp_us")
    ]
    if len(pods) < 4:  # need >=4 for a 3D (incl. elevation) fix
        return None

    lat0 = sum(p["lat"] for p in pods) / len(pods)
    lon0 = sum(p["lon"] for p in pods) / len(pods)
    t_min = min(p["pps_timestamp_us"] for p in pods)
    xs = []
    for p in pods:
        e, n, u = to_enu(p["lat"], p["lon"], p.get("altitude_m", 0.0), lat0, lon0)
        t = (p["pps_timestamp_us"] - t_min) * 1e-6  # seconds, relative
        xs.append((e, n, u, t))

    # Initial guess: centroid, mean altitude, emission just before earliest arrival.
    e = sum(x[0] for x in xs) / len(xs)
    n = sum(x[1] for x in xs) / len(xs)
    u = sum(x[2] for x in xs) / len(xs)
    t0 = min(x[3] for x in xs) - 0.03
    c = SPEED_OF_SOUND_MPS

    for _ in range(50):
        jtj = [[0.0] * 4 for _ in range(4)]
        jtf = [0.0, 0.0, 0.0, 0.0]
        for ei, ni, ui, ti in xs:
            de, dn, du = e - ei, n - ni, u - ui
            d = math.sqrt(de * de + dn * dn + du * du) or 1e-6
            f = d - c * (ti - t0)
            jrow = [de / d, dn / d, du / d, c]  # d(resid)/d[e,n,u,t0]
            for r in range(4):
                jtf[r] += jrow[r] * f
                for cc in range(4):
                    jtj[r][cc] += jrow[r] * jrow[cc]
        step = _solve_linear(jtj, [-v for v in jtf])
        if step is None:
            break
        e += step[0]
        n += step[1]
        u += step[2]
        t0 += step[3]
        if abs(step[0]) + abs(step[1]) + abs(step[2]) < 0.01:
            break

    lat, lon = enu_to_latlon(e, n, lat0, lon0)
    return (lat, lon, u, "acoustic_tdoa")


def solve_rssi_multilat(events: list[dict]) -> tuple[float, float, float, str] | None:
    """2D inverse-path-loss least squares (linearised + Gauss-Newton).
    Ported from demo/js/sim/masterNode.js:solveRssiMultilat."""
    pts = [ev for ev in events if "rssi_dbm" in ev]
    if len(pts) < 3:
        return None
    band = pts[0].get("band_id", 2)
    pl = BAND_PATHLOSS.get(band, {"tx_power": 23, "n": 2.5})
    lat0 = sum(p["lat"] for p in pts) / len(pts)
    lon0 = sum(p["lon"] for p in pts) / len(pts)
    pods = []
    for ev in pts:
        e, n, _ = to_enu(ev["lat"], ev["lon"], 0.0, lat0, lon0)
        rng = 10 ** ((pl["tx_power"] - 40 - ev["rssi_dbm"]) / (10 * pl["n"]))
        pods.append((e, n, rng))
    pods.sort(key=lambda p: p[2])
    e0, n0, r0 = pods[0]
    k0 = e0 * e0 + n0 * n0
    aa = bb = cc = bx = by = 0.0
    for ei, ni, ri in pods[1:]:
        ae, an = 2 * (ei - e0), 2 * (ni - n0)
        rhs = r0 * r0 - ri * ri + (ei * ei + ni * ni) - k0
        aa += ae * ae
        bb += ae * an
        cc += an * an
        bx += ae * rhs
        by += an * rhs
    det = aa * cc - bb * bb
    if abs(det) < 1e-9:
        return None
    e = (cc * bx - bb * by) / det
    n = (-bb * bx + aa * by) / det
    for _ in range(5):  # Gauss-Newton refine on true range residuals
        ga = gb = gc = gx = gy = 0.0
        for ei, ni, ri in pods:
            de, dn = e - ei, n - ni
            d = math.hypot(de, dn) or 1e-6
            je, jn, f = de / d, dn / d, d - ri
            ga += je * je
            gb += je * jn
            gc += jn * jn
            gx += je * f
            gy += jn * f
        gdet = ga * gc - gb * gb
        if abs(gdet) < 1e-12:
            break
        se = -(gc * gx - gb * gy) / gdet
        sn = -(-gb * gx + ga * gy) / gdet
        e += se
        n += sn
        if abs(se) + abs(sn) < 0.01:
            break
    lat, lon = enu_to_latlon(e, n, lat0, lon0)
    return (lat, lon, 0.0, "rssi_multilat")


def solve_centroid(events: list[dict]) -> tuple[float, float, float, str] | None:
    pts = [ev for ev in events if "rssi_dbm" in ev]
    if not pts:
        return None
    w = [10 ** (ev["rssi_dbm"] / 10.0) for ev in pts]
    tot = sum(w)
    if tot == 0:
        return None
    lat = sum(wi * ev["lat"] for wi, ev in zip(w, pts)) / tot
    lon = sum(wi * ev["lon"] for wi, ev in zip(w, pts)) / tot
    return (lat, lon, 0.0, "rssi_centroid")


def localize(events: list[dict]) -> tuple[float, float, float, str] | None:
    """Try the solvers in order of achievable accuracy."""
    return (
        solve_acoustic_tdoa(events)
        or solve_rssi_multilat(events)
        or solve_centroid(events)
    )


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--fixture", required=True, type=Path)
    p.add_argument("--truth", required=True, type=Path)
    p.add_argument("--format", choices=("json", "text"), default="text")
    args = p.parse_args()

    events: list[dict] = []
    with args.fixture.open(encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                events.append(json.loads(line))
    truth = json.loads(args.truth.read_text(encoding="utf-8"))

    detects = [ev for ev in events if ev.get("event") == "detect"]
    est = localize(detects)
    if est is None:
        print(json.dumps({"error": "insufficient data"}))
        return 2

    lat, lon, alt, method = est
    err_m = haversine_m(lat, lon, truth["lat"], truth["lon"])
    if "altitude_m" in truth:
        err_m = math.hypot(err_m, alt - truth["altitude_m"])
    out = {
        "estimated_lat": lat,
        "estimated_lon": lon,
        "estimated_alt_m": alt,
        "error_meters": err_m,
        "method": method,
        "truth_lat": truth["lat"],
        "truth_lon": truth["lon"],
    }
    if args.format == "json":
        print(json.dumps(out, indent=2))
    else:
        print(
            f"method={method}  err={err_m:.1f} m  est=({lat:.6f},{lon:.6f},{alt:.0f}m)"
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
