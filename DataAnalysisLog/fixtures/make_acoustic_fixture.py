#!/usr/bin/env python3
"""Generate acoustic_4pod_3d.{jsonl,truth.json}: a 4-pod (one elevated) acoustic
TDOA scene with GNSS-PPS arrival times, for triangulate.py's acoustic solver.

Run from repo root:  python DataAnalysisLog/fixtures/make_acoustic_fixture.py
Deterministic — regenerates identical files."""

import json
import math
from pathlib import Path

SPEED_OF_SOUND_MPS = 343.0
LAT0, LON0 = 50.100000, 14.420000
BASE_US = 1_748_020_800_000_000  # arbitrary GNSS-PPS epoch (us)
COS = math.cos(math.radians(LAT0))

# Pods as local ENU (east, north, up) metres; pod 4 is elevated (breaks vertical GDOP).
PODS = [
    (1, -400.0, -300.0, 2.0),
    (2, 400.0, -300.0, 2.0),
    (3, 0.0, 450.0, 2.0),
    (4, 0.0, 0.0, 40.0),
]
SRC = (120.0, 80.0, 15.0)  # source ENU


def enu_to_latlon(e, n):
    return LAT0 + n / 111_132.0, LON0 + e / (111_320.0 * COS)


def main():
    here = Path(__file__).resolve().parent
    lines = []
    for node_id, pe, pn, pu in PODS:
        dist = math.sqrt((SRC[0] - pe) ** 2 + (SRC[1] - pn) ** 2 + (SRC[2] - pu) ** 2)
        arrival_us = BASE_US + round(dist / SPEED_OF_SOUND_MPS * 1e6)
        lat, lon = enu_to_latlon(pe, pn)
        lines.append(
            {
                "ts_unix_ms": BASE_US // 1000,
                "event": "detect",
                "node_id": node_id,
                "band_id": 0,  # BAND_UNKNOWN — acoustic is not an RF band
                "sensor_class": 2,  # SENSOR_ACOUSTIC
                "pps_timestamp_us": arrival_us,
                "rssi_dbm": -70,
                "snr_db": 20,
                "noise_floor_dbm": -95,
                "lat": round(lat, 7),
                "lon": round(lon, 7),
                "altitude_m": round(pu, 1),
                "flags": [],
                "battery_pct": 90,
                "seq": 1000 + node_id,
                "on_air_ms": 288,
            }
        )
    slat, slon = enu_to_latlon(SRC[0], SRC[1])
    truth = {"lat": round(slat, 7), "lon": round(slon, 7), "altitude_m": SRC[2]}

    (here / "acoustic_4pod_3d.jsonl").write_text(
        "".join(json.dumps(x) + "\n" for x in lines), encoding="utf-8"
    )
    (here / "acoustic_4pod_3d.truth.json").write_text(
        json.dumps(truth, indent=2) + "\n", encoding="utf-8"
    )
    print("wrote acoustic_4pod_3d.{jsonl,truth.json}")


if __name__ == "__main__":
    main()
