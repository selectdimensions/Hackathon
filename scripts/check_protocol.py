#!/usr/bin/env python3
"""check_protocol.py — deterministic gate that mirrors the
`lora-protocol-reviewer` Claude Code agent.

Runs in pre-commit and CI. Pure regex/grep — no LLM dependency. Fails (exit 1)
on any of:

  - struct *Packet not __attribute__((packed))
  - struct *Packet without a matching static_assert(sizeof(...) == N)
  - struct *Packet missing trailing `uint16_t crc16;`
  - MSG_* enum without a documented packet OR a comment explaining why
  - inner size > 64 bytes (LoRa SF9 MTU ceiling) — informational warning
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path


STRUCT_RE = re.compile(
    r"struct\s+__attribute__\(\(packed\)\)\s+(\w+Packet)\s*\{([^}]+)\};",
    re.DOTALL,
)
UNPACKED_STRUCT_RE = re.compile(
    r"struct\s+(\w+Packet)\s*\{",  # any struct named *Packet
)
STATIC_ASSERT_RE = re.compile(
    r"static_assert\s*\(\s*sizeof\s*\(\s*(\w+)\s*\)\s*==\s*(\d+)",
)
MSG_ENUM_RE = re.compile(r"MSG_(\w+)\s*=\s*0x([0-9A-Fa-f]+)")
PACKET_FIELD_VERSION_RE = re.compile(r"uint8_t\s+version\s*;")
PACKET_FIELD_CRC_RE = re.compile(r"uint16_t\s+crc16\s*;")


def check_protocol_h(path: Path) -> list[str]:
    errs: list[str] = []
    src = path.read_text(encoding="utf-8")

    # 1. Every *Packet struct must be __attribute__((packed)).
    for m in UNPACKED_STRUCT_RE.finditer(src):
        name = m.group(1)
        # Check if the matched text is preceded by __attribute__((packed))
        start = m.start()
        head = src[max(0, start - 60) : start]
        if "__attribute__((packed))" not in head:
            errs.append(f"{path}: struct {name} is not __attribute__((packed))")

    # 2. Every *Packet struct must have a matching static_assert.
    asserted = {m.group(1): int(m.group(2)) for m in STATIC_ASSERT_RE.finditer(src)}
    for m in STRUCT_RE.finditer(src):
        name = m.group(1)
        if name not in asserted:
            errs.append(
                f"{path}: struct {name} missing static_assert(sizeof(...) == N)"
            )

    # 3. Every *Packet must have version + crc16 (RekeyPacket excepted from crc16
    #    because it's signed instead, but RekeyPacket still has the Ed25519 sig).
    for m in STRUCT_RE.finditer(src):
        name = m.group(1)
        body = m.group(2)
        if name == "EnvelopeHeader":
            continue  # not a payload packet
        if not PACKET_FIELD_VERSION_RE.search(body):
            errs.append(f"{path}: struct {name} missing `uint8_t version;`")
        if name == "RekeyPacket":
            # signed, not CRC'd
            continue
        if not PACKET_FIELD_CRC_RE.search(body):
            errs.append(f"{path}: struct {name} missing trailing `uint16_t crc16;`")

    # 4. Every MSG_* enum must have either a struct OR a comment about it.
    enum_names = [m.group(1) for m in MSG_ENUM_RE.finditer(src)]
    struct_names_lower = {m.group(1).lower() for m in STRUCT_RE.finditer(src)}
    for enum_name in enum_names:
        candidate = enum_name.lower().replace("_", "")
        # Crude: check for a struct name containing the enum's base word.
        # e.g. MSG_DETECT -> DetectPacket
        found = any(
            candidate.startswith(s.removesuffix("packet"))
            or s.removesuffix("packet").startswith(candidate)
            for s in struct_names_lower
        )
        if not found:
            # Check for a comment within ~80 chars mentioning the enum
            idx = src.find(f"MSG_{enum_name}")
            if idx >= 0:
                surrounding = src[idx : idx + 200]
                if "piggyback" in surrounding or "future" in surrounding:
                    continue  # documented exception
            errs.append(
                f"{path}: MSG_{enum_name} has no matching *Packet struct (or doc'd exception)"
            )

    # 5. Total inner size warning.
    for name, n in asserted.items():
        if name in {"RekeyPacket", "EnvelopeHeader"}:
            continue
        on_air = 3 + n + 8  # envelope + payload + tag
        if on_air > 64:
            errs.append(
                f"{path}: {name} on-air size {on_air}B exceeds LoRa SF9 MTU 64B"
            )

    return errs


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument(
        "files",
        nargs="*",
        type=Path,
        help="Paths to Protocol.h files (defaults to shared/Protocol.h)",
    )
    args = p.parse_args()

    targets = args.files or [Path("shared/Protocol.h")]
    targets = [t for t in targets if t.exists() and t.name == "Protocol.h"]
    if not targets:
        print("check_protocol: no Protocol.h files to check", file=sys.stderr)
        return 0  # not a failure if no protocol changes in this commit

    all_errs: list[str] = []
    for t in targets:
        all_errs += check_protocol_h(t)

    if all_errs:
        print("## lora-protocol-reviewer (deterministic) — FAIL")
        for e in all_errs:
            print(f"  - {e}")
        return 1
    print("## lora-protocol-reviewer (deterministic) — PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
