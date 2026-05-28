#!/usr/bin/env python3
"""parse_log.py — summarize captured master-node ndjson logs.

Stub. Implementations land in v0.2. Currently:
  - validates that input is well-formed ndjson
  - prints event counts by type
  - prints per-(node, sub-band, hour) airtime against the EU 36 s/hour budget
    when --report-duty-cycle is set
"""

from __future__ import annotations

import argparse
import json
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path


EU_SUB_BAND_G_BUDGET_MS_PER_HOUR = 36_000


def sub_band_for_freq(freq_hz: int) -> str:
    if 868_000_000 <= freq_hz <= 868_600_000:
        return "g"
    if 868_700_000 <= freq_hz <= 869_200_000:
        return "g1"
    if 869_400_000 <= freq_hz <= 869_650_000:
        return "g2"
    if 869_700_000 <= freq_hz <= 870_000_000:
        return "g3"
    return "unknown"


def report_duty_cycle(events: list[dict]) -> int:
    buckets: dict[tuple[int, str, str], int] = defaultdict(int)
    for ev in events:
        on_air = ev.get("on_air_ms")
        if on_air is None:
            continue
        freq_hz = ev.get("tx_freq_hz") or ev.get("rx_freq_hz")
        if freq_hz is None:
            continue
        ts_ms = ev["ts_unix_ms"]
        hour_bucket = datetime.fromtimestamp(ts_ms / 1000, tz=timezone.utc).strftime(
            "%Y-%m-%dT%H:00Z"
        )
        node_id = ev.get("node_id") or ev.get("target_node_id") or 0xFF
        sub_band = sub_band_for_freq(freq_hz)
        buckets[(node_id, sub_band, hour_bucket)] += int(on_air)

    fail = 0
    print(
        f"{'node':>6}  {'band':>4}  {'hour':<22}  {'tx_ms':>8}  {'budget':>8}  {'pct':>6}  status"
    )
    for (node_id, sub_band, hour), tx_ms in sorted(buckets.items()):
        budget = EU_SUB_BAND_G_BUDGET_MS_PER_HOUR if sub_band == "g" else None
        if budget is None:
            status = "n/a"
            pct = "-"
        else:
            pct_v = 100.0 * tx_ms / budget
            pct = f"{pct_v:.1f}%"
            if pct_v >= 100.0:
                status = "FAIL"
                fail += 1
            elif pct_v >= 80.0:
                status = "WARN"
            else:
                status = "OK"
        print(
            f"{node_id:>6}  {sub_band:>4}  {hour:<22}  {tx_ms:>8}  {str(budget):>8}  {pct:>6}  {status}"
        )
    return fail


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument(
        "--logs",
        required=True,
        type=Path,
        help="Path to .jsonl file or directory of .jsonl files",
    )
    p.add_argument("--report-duty-cycle", action="store_true")
    args = p.parse_args()

    paths: list[Path] = []
    if args.logs.is_dir():
        paths = sorted(args.logs.rglob("*.jsonl"))
    else:
        paths = [args.logs]
    if not paths:
        print(f"No .jsonl files found at {args.logs}", file=sys.stderr)
        return 2

    events: list[dict] = []
    for pth in paths:
        with pth.open(encoding="utf-8") as f:
            for line_no, line in enumerate(f, 1):
                line = line.strip()
                if not line:
                    continue
                try:
                    events.append(json.loads(line))
                except json.JSONDecodeError as e:
                    print(f"{pth}:{line_no}: invalid JSON: {e}", file=sys.stderr)

    counts: dict[str, int] = defaultdict(int)
    for ev in events:
        counts[ev.get("event", "unknown")] += 1
    print("Event counts:")
    for k, v in sorted(counts.items()):
        print(f"  {k:<14} {v}")
    print()

    if args.report_duty_cycle:
        failures = report_duty_cycle(events)
        if failures:
            print(f"\nDUTY CYCLE FAIL on {failures} hour-bucket(s).", file=sys.stderr)
            return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
