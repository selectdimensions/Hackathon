#!/usr/bin/env python3
"""demo_audit.py — deterministic verifier for the browser-based demo.

For each scenario in demo/data/scenarios/, this script:
  1. Loads the scenario JSON (merging _layout.json via layout_ref).
  2. Walks scenario time at 10 Hz, generating synthetic DetectPacket-shaped
     events per pod using the same path-loss forward model the JS sim uses
     (rssi = txPower - 10*n*log10(range) - 40).
  3. Runs a Python port of demo/js/sim/masterNode.js: solveRssiMultilat
     (hyperbolic linear LS + Gauss-Newton refinement), then the per-band
     km-bucket / bearing-change / heartbeat alert rule.
  4. Asserts per-scenario expectations: km bucket set seen, bearing cue
     count, max localisation error, first-alert lag.
  5. Prints a CI-friendly summary, exits 0 on all PASS, 1 otherwise.

This is the offline checkpoint the demo must pass between commits.
Mirrors masterNode.js's algorithm intent so drift is caught.
"""

from __future__ import annotations

import json
import math
import sys
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parent.parent
SCENARIO_DIR = REPO_ROOT / "demo" / "data" / "scenarios"

# Per-band path-loss constants — must match BAND_PATHLOSS in masterNode.js.
BAND_PATHLOSS = {
    3: {"tx_power": 30, "n": 2.5},   # GNSS L1
    4: {"tx_power": 27, "n": 2.3},   # 2.4 GHz
    5: {"tx_power": 27, "n": 2.2},   # 5.8 GHz
}

# Cue helpers — match demo/js/protocol.js exactly.
def bearing_to_step30_cue(deg: float) -> int:
    """Mirrors bearingDegToStep30Cue: 30° buckets, 0° rounds up to CUE_DEG_360."""
    b = int(round((deg % 360) * 256 / 360)) & 0xFF
    d = round(b * 360 / 256)
    step = (d + 15) // 30
    if step == 0:
        step = 12
    if step > 12:
        step = 12
    return 0x50 + (step - 1)


def meters_to_km_cue(meters: float) -> int:
    """Mirrors metersToKmCue: clamps to 1..10 km."""
    km = max(1, min(10, int(round(meters / 1000))))
    return 0x60 + (km - 1)


def offset_to_lat_lon(anchor: dict, east_m: float, north_m: float) -> tuple[float, float]:
    lat = anchor["lat"] + north_m / 111132.0
    lon = anchor["lon"] + east_m / (111320.0 * math.cos(math.radians(anchor["lat"])))
    return lat, lon


def haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6_371_000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))


def bearing_deg(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    p1 = math.radians(lat1)
    p2 = math.radians(lat2)
    dl = math.radians(lon2 - lon1)
    y = math.sin(dl) * math.cos(p2)
    x = math.cos(p1) * math.sin(p2) - math.sin(p1) * math.cos(p2) * math.cos(dl)
    return (math.degrees(math.atan2(y, x)) + 360) % 360


def fwd_rssi(range_m: float, tx_power: float, n: float) -> float:
    return tx_power - 10 * n * math.log10(max(1.0, range_m)) - 40


def inv_range(rssi: float, tx_power: float, n: float) -> float:
    return 10 ** ((tx_power - 40 - rssi) / (10 * n))


def load_scenario(path: Path) -> dict:
    raw = json.loads(path.read_text(encoding="utf-8"))
    if "layout_ref" in raw:
        layout = json.loads((path.parent / raw["layout_ref"]).read_text(encoding="utf-8"))
        for k, v in layout.items():
            if k not in raw:
                raw[k] = v
    # resolve pod / soldier / c2 / emitter positions
    anchor = raw["anchor"]
    for p in raw["pods"]:
        p["lat"], p["lon"] = offset_to_lat_lon(anchor, p["eastM"], p["northM"])
    raw["soldier"]["lat"], raw["soldier"]["lon"] = offset_to_lat_lon(anchor, raw["soldier"]["eastM"], raw["soldier"]["northM"])
    if "c2" in raw:
        raw["c2"]["lat"], raw["c2"]["lon"] = offset_to_lat_lon(anchor, raw["c2"]["eastM"], raw["c2"]["northM"])
    for em in raw["emitters"]:
        for wp in em["path"]:
            wp["lat"], wp["lon"] = offset_to_lat_lon(anchor, wp["eastM"], wp["northM"])
    return raw


def emitter_state_at(em: dict, t_ms: float) -> dict | None:
    path = em["path"]
    if not path:
        return None
    if t_ms <= path[0]["t_ms"]:
        return {"lat": path[0]["lat"], "lon": path[0]["lon"]}
    if t_ms >= path[-1]["t_ms"]:
        return {"lat": path[-1]["lat"], "lon": path[-1]["lon"]}
    for i in range(1, len(path)):
        if t_ms <= path[i]["t_ms"]:
            a, b = path[i - 1], path[i]
            u = (t_ms - a["t_ms"]) / max(1, b["t_ms"] - a["t_ms"])
            return {"lat": a["lat"] + (b["lat"] - a["lat"]) * u,
                    "lon": a["lon"] + (b["lon"] - a["lon"]) * u}
    return None


def solve_rssi_multilat(detects: list[dict], band_id: int) -> tuple[float, float] | None:
    """Hyperbolic linear LS + Gauss-Newton refinement. Mirrors masterNode.js."""
    if len(detects) < 3:
        return None
    p = BAND_PATHLOSS.get(band_id, {"tx_power": 23, "n": 2.5})
    lat0 = sum(d["lat"] for d in detects) / len(detects)
    lon0 = sum(d["lon"] for d in detects) / len(detects)
    cos_lat = math.cos(math.radians(lat0))
    pods = [{
        "e": (d["lon"] - lon0) * 111320 * cos_lat,
        "n": (d["lat"] - lat0) * 111132,
        "r": inv_range(d["rssi_dbm"], p["tx_power"], p["n"]),
    } for d in detects]
    pods.sort(key=lambda p_: p_["r"])
    p0 = pods[0]
    k0 = p0["e"] ** 2 + p0["n"] ** 2
    A = B = C = bx = by = 0.0
    for pi in pods[1:]:
        ae = 2 * (pi["e"] - p0["e"])
        an = 2 * (pi["n"] - p0["n"])
        rhs = p0["r"] ** 2 - pi["r"] ** 2 + (pi["e"] ** 2 + pi["n"] ** 2) - k0
        A += ae * ae
        B += ae * an
        C += an * an
        bx += ae * rhs
        by += an * rhs
    det = A * C - B * B
    if abs(det) < 1e-9:
        return None
    e = (C * bx - B * by) / det
    n = (-B * bx + A * by) / det
    # GN refinement (5 iters)
    for _ in range(5):
        gA = gB = gC = gx = gy = 0.0
        for pod in pods:
            de = e - pod["e"]
            dn = n - pod["n"]
            d = math.hypot(de, dn) or 1e-6
            Je = de / d
            Jn = dn / d
            f = d - pod["r"]
            gA += Je * Je
            gB += Je * Jn
            gC += Jn * Jn
            gx += Je * f
            gy += Jn * f
        gdet = gA * gC - gB * gB
        if abs(gdet) < 1e-12:
            break
        se = -(gC * gx - gB * gy) / gdet
        sn = -(-gB * gx + gA * gy) / gdet
        e += se
        n += sn
        if abs(se) + abs(sn) < 0.01:
            break
    lat = lat0 + n / 111132
    lon = lon0 + e / (111320 * cos_lat)
    return lat, lon


def run_scenario(sc: dict, tick_hz: int = 10) -> dict:
    """Walk scenario time, generate detects, run solver, aggregate alerts."""
    sim_tick_ms = 1000 / tick_hz
    duration = sc["duration_ms"]
    soldier = sc["soldier"]

    alerts: list[dict] = []
    detect_count = 0
    first_alert_ms = None
    last_alerted_by_band: dict[int, dict] = {}

    t = 0.0
    while t <= duration:
        # collect detects for this tick across all emitters
        detects_by_band: dict[int, list[dict]] = {}
        for em in sc["emitters"]:
            state = emitter_state_at(em, t)
            if not state:
                continue
            band = em["band"]
            for pod in sc["pods"]:
                if band not in pod.get("bands", [pod.get("band")]):
                    continue
                range_m = haversine_m(pod["lat"], pod["lon"], state["lat"], state["lon"])
                rssi = fwd_rssi(range_m, em["tx_power_dbm"], em["path_loss_n"])
                if rssi < pod.get("detect_threshold_dbm", -110):
                    continue
                detect_count += 1
                detects_by_band.setdefault(band, []).append({
                    "node_id": pod["node_id"],
                    "lat": pod["lat"],
                    "lon": pod["lon"],
                    "rssi_dbm": round(rssi),
                })
        # solve per band
        for band, ds in detects_by_band.items():
            if len(ds) < 3:
                continue
            est = solve_rssi_multilat(ds, band)
            if not est:
                continue
            est_lat, est_lon = est
            range_m = haversine_m(soldier["lat"], soldier["lon"], est_lat, est_lon)
            brg = bearing_deg(soldier["lat"], soldier["lon"], est_lat, est_lon)
            km = max(1, min(10, round(range_m / 1000)))
            cue = bearing_to_step30_cue(brg)
            # JS uses real-time heartbeat (4s real). Scale by time_scale so this
            # offline audit reproduces what the user would experience visually.
            scale = sc.get("time_scale", 1)
            heartbeat_ms = 4000 * scale
            debounce_ms = 400 * scale
            last = last_alerted_by_band.get(band)
            km_changed = last is None or last["km"] != km
            cue_changed = last is None or last["cue"] != cue
            heartbeat = last is None or (t - last["t_ms"]) > heartbeat_ms
            debounce_ok = last is None or (t - last["t_ms"]) > debounce_ms
            if not debounce_ok:
                continue
            if not (km_changed or cue_changed or heartbeat):
                continue
            # Compute truth for residual reporting
            truth = next((emitter_state_at(em, t) for em in sc["emitters"] if em["band"] == band), None)
            err_m = haversine_m(est_lat, est_lon, truth["lat"], truth["lon"]) if truth else None
            alert = {
                "t_ms": t,
                "band": band,
                "km": km,
                "cue": cue,
                "bearing_deg": brg,
                "range_m": range_m,
                "err_m": err_m,
                "n_pods": len(ds),
            }
            alerts.append(alert)
            if first_alert_ms is None:
                first_alert_ms = t
            last_alerted_by_band[band] = {"km": km, "cue": cue, "t_ms": t}
        t += sim_tick_ms

    return {
        "alerts": alerts,
        "detect_count": detect_count,
        "first_alert_ms": first_alert_ms,
    }


# Per-scenario expectations.
EXPECTED = {
    "early_warning": {
        "min_alerts": 8,
        "expected_km_buckets": {3, 4, 5, 6, 7, 8, 9, 10},  # at least these
        "min_distinct_bearing_cues": 3,
        "max_err_m": 400,
        "first_alert_max_s": 10,
    },
    "fpv_incursion": {
        "min_alerts": 8,
        "expected_km_buckets": {3, 4, 5, 6, 7, 8, 9, 10},
        "min_distinct_bearing_cues": 3,
        "max_err_m": 400,
        "first_alert_max_s": 10,
    },
    "gnss_jammer": {
        "min_alerts": 2,           # one per static position
        "expected_km_buckets": {6, 8},  # 6 km E, then 8 km NW
        "min_distinct_bearing_cues": 2,
        "max_err_m": 600,
        "first_alert_max_s": 10,
    },
    "multi_threat": {
        "min_alerts": 8,
        "expected_km_buckets": {2, 3, 4, 5, 6, 7, 8, 9},
        "min_distinct_bearing_cues": 3,
        "max_err_m": 500,
        "first_alert_max_s": 10,
    },
}


def check(sc_id: str, result: dict) -> tuple[bool, list[str]]:
    exp = EXPECTED.get(sc_id)
    if not exp:
        return True, [f"no expectations for {sc_id} — skip"]
    alerts = result["alerts"]
    errs = []
    if len(alerts) < exp["min_alerts"]:
        errs.append(f"only {len(alerts)} alerts (expected >={exp['min_alerts']})")
    km_seen = {a["km"] for a in alerts}
    missing_km = exp["expected_km_buckets"] - km_seen
    if missing_km:
        errs.append(f"missing km buckets {sorted(missing_km)} (saw {sorted(km_seen)})")
    cues_seen = {a["cue"] for a in alerts}
    if len(cues_seen) < exp["min_distinct_bearing_cues"]:
        errs.append(f"only {len(cues_seen)} distinct bearing cues (expected >={exp['min_distinct_bearing_cues']})")
    max_err = max((a["err_m"] or 0) for a in alerts) if alerts else 0
    if max_err > exp["max_err_m"]:
        errs.append(f"max localisation error {max_err:.0f} m (threshold {exp['max_err_m']})")
    if result["first_alert_ms"] is None or result["first_alert_ms"] > exp["first_alert_max_s"] * 1000:
        errs.append(f"first alert at {result['first_alert_ms']} ms (threshold {exp['first_alert_max_s']*1000} ms)")
    return (len(errs) == 0), errs


def main() -> int:
    files = sorted(SCENARIO_DIR.glob("*.json"))
    files = [f for f in files if not f.name.startswith("_")]
    if not files:
        print("no scenarios found in", SCENARIO_DIR)
        return 1
    print(f"=== demo_audit: {len(files)} scenarios ===")
    print()
    print(f"{'scenario':<18} {'alerts':>7} {'km_set':<28} {'cues':>5} {'max_err_m':>10} {'first_s':>8} result")
    print("-" * 95)
    all_ok = True
    for f in files:
        sc = load_scenario(f)
        result = run_scenario(sc)
        ok, errs = check(sc["id"], result)
        all_ok = all_ok and ok
        alerts = result["alerts"]
        km_seen = sorted({a["km"] for a in alerts})
        cues_seen = len({a["cue"] for a in alerts})
        max_err = max((a["err_m"] or 0) for a in alerts) if alerts else 0
        first_s = (result["first_alert_ms"] or 0) / 1000
        print(f"{sc['id']:<18} {len(alerts):>7} {str(km_seen):<28} {cues_seen:>5} {max_err:>10.0f} {first_s:>8.1f} {'PASS' if ok else 'FAIL'}")
        for e in errs:
            print(f"   - {e}")
    print()
    print("OVERALL:", "PASS" if all_ok else "FAIL")
    return 0 if all_ok else 1


if __name__ == "__main__":
    sys.exit(main())
