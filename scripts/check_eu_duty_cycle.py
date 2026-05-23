#!/usr/bin/env python3
"""check_eu_duty_cycle.py — wraps DataAnalysisLog/parse_log.py for CI.
Returns non-zero if any node in any captured log exceeds the EU 1% duty cycle.
Skips silently if no logs are present.
"""

from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--logs", type=Path, default=Path("DataAnalysisLog/logs"))
    args = p.parse_args()

    if not args.logs.exists():
        print(f"check_eu_duty_cycle: no logs at {args.logs} — skipping.")
        return 0

    jsonls = list(args.logs.rglob("*.jsonl"))
    if not jsonls:
        print(f"check_eu_duty_cycle: no .jsonl files in {args.logs} — skipping.")
        return 0

    parse_log = Path("DataAnalysisLog/parse_log.py")
    r = subprocess.run(
        [
            sys.executable,
            str(parse_log),
            "--logs",
            str(args.logs),
            "--report-duty-cycle",
        ],
        check=False,
    )
    return r.returncode


if __name__ == "__main__":
    raise SystemExit(main())
