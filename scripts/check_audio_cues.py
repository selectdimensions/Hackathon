#!/usr/bin/env python3
"""check_audio_cues.py — deterministic gate that mirrors the
`audio-cue-curator` Claude Code agent.

Verifies cue_id ↔ filename ↔ phrase consistency across:
  - shared/AudioCues.h          (CUE_TABLE entries)
  - UserNotification/audio_manifest.md  (markdown table)
  - UserNotification/clips/*.wav        (actual files)

Optional WAV format check requires `ffprobe` on PATH (skipped if missing).
"""

from __future__ import annotations

import argparse
import json
import re
import shutil
import subprocess
import sys
from pathlib import Path


CUE_TABLE_RE = re.compile(
    r"\{\s*(CUE_\w+)\s*,\s*\"([^\"]+)\"\s*\}",
)
MANIFEST_ROW_RE = re.compile(
    r"\|\s*0x([0-9A-Fa-f]{2})\s*\|\s*`(CUE_\w+)`\s*\|\s*`([\w.\-]+)`\s*\|",
)


def parse_audio_cues_h(path: Path) -> set[tuple[str, str]]:
    src = path.read_text(encoding="utf-8")
    return set(CUE_TABLE_RE.findall(src))


def parse_manifest(path: Path) -> set[tuple[str, str]]:
    src = path.read_text(encoding="utf-8")
    out: set[tuple[str, str]] = set()
    for m in MANIFEST_ROW_RE.finditer(src):
        out.add((m.group(2), m.group(3)))
    return out


def ffprobe_wav(path: Path) -> dict | None:
    if not shutil.which("ffprobe"):
        return None
    try:
        r = subprocess.run(
            [
                "ffprobe",
                "-v",
                "error",
                "-select_streams",
                "a:0",
                "-show_entries",
                "stream=sample_rate,channels,bits_per_sample,codec_name",
                "-of",
                "json",
                str(path),
            ],
            check=True,
            capture_output=True,
            text=True,
        )
        return json.loads(r.stdout)["streams"][0]
    except (subprocess.CalledProcessError, KeyError, json.JSONDecodeError, IndexError):
        return None


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--header", default="shared/AudioCues.h", type=Path)
    p.add_argument(
        "--manifest", default="UserNotification/audio_manifest.md", type=Path
    )
    p.add_argument("--clips", default="UserNotification/clips", type=Path)
    p.add_argument(
        "--audioclips",
        default="AudioClips",
        type=Path,
        help="Root of MP3 navigation library (must contain en/ and fr/ subdirs)",
    )
    p.add_argument(
        "--skip-format",
        action="store_true",
        help="Skip ffprobe sample-rate/channel/bit-depth check",
    )
    args = p.parse_args()

    if not args.header.exists() or not args.manifest.exists():
        print("check_audio_cues: header or manifest missing", file=sys.stderr)
        return 0

    header_set = parse_audio_cues_h(args.header)
    manifest_set = parse_manifest(args.manifest)

    errs: list[str] = []

    # 1. header ↔ manifest
    only_in_header = header_set - manifest_set
    only_in_manifest = manifest_set - header_set
    for entry in only_in_header:
        errs.append(f"in {args.header.name} but not manifest: {entry}")
    for entry in only_in_manifest:
        errs.append(f"in manifest but not {args.header.name}: {entry}")

    # 2. manifest -> file. Split by extension:
    #    - *.wav  -> UserNotification/clips/   (8 kHz mono, soldier-node LittleFS)
    #    - *.mp3  -> AudioClips/<en|fr>/        (TTS navigation library)
    #
    # WAV side has two modes:
    #    - scaffold state (0 clips committed): pass with a note; the audio team
    #      hasn't generated clips yet. The manifest is the source of truth that
    #      the team will fill against.
    #    - populated state (>=1 clip committed): enforce that every manifest
    #      entry has a clip, and no orphan clips exist.
    wav_referenced = {fn for _, fn in manifest_set if fn.lower().endswith(".wav")}
    mp3_referenced = {fn for _, fn in manifest_set if fn.lower().endswith(".mp3")}

    if args.clips.exists():
        wav_actual = {p.name for p in args.clips.glob("*.wav")}
    else:
        wav_actual = set()

    if len(wav_actual) == 0:
        print(
            f"## audio-cue-curator: clips/ is empty — scaffold state, deferring strict WAV checks. "
            f"({len(wav_referenced)} WAV cues declared in manifest, awaiting WAV generation.)"
        )
    else:
        missing = wav_referenced - wav_actual
        orphans = wav_actual - wav_referenced
        for fn in sorted(missing):
            errs.append(f"manifest references {fn} but clips/{fn} is missing")
        for fn in sorted(orphans):
            errs.append(f"clips/{fn} is orphan (not referenced in manifest)")

    # MP3 side: every referenced MP3 must exist in BOTH en/ and fr/. Orphans warn.
    for lang in ("en", "fr"):
        lang_dir = args.audioclips / lang
        if not lang_dir.exists():
            if mp3_referenced:
                errs.append(
                    f"{lang_dir} missing but manifest references {len(mp3_referenced)} MP3 cues"
                )
            continue
        actual = {p.name for p in lang_dir.glob("*.mp3")}
        for fn in sorted(mp3_referenced - actual):
            errs.append(f"manifest references {fn} but {lang_dir}/{fn} is missing")
        for fn in sorted(actual - mp3_referenced):
            errs.append(f"{lang_dir}/{fn} is orphan (not referenced in manifest)")

    # 3. WAV format
    if not args.skip_format and shutil.which("ffprobe"):
        for fn in sorted(wav_actual):
            info = ffprobe_wav(args.clips / fn)
            if info is None:
                errs.append(f"ffprobe failed on clips/{fn}")
                continue
            if info.get("sample_rate") != "8000":
                errs.append(
                    f"clips/{fn} sample_rate={info.get('sample_rate')}, expected 8000"
                )
            if info.get("channels") != 1:
                errs.append(f"clips/{fn} channels={info.get('channels')}, expected 1")
            if info.get("bits_per_sample") not in (16, "16"):
                errs.append(
                    f"clips/{fn} bits_per_sample={info.get('bits_per_sample')}, expected 16"
                )
            if info.get("codec_name") != "pcm_s16le":
                errs.append(
                    f"clips/{fn} codec_name={info.get('codec_name')}, expected pcm_s16le"
                )

    if errs:
        print("## audio-cue-curator (deterministic) — FAIL")
        for e in errs:
            print(f"  - {e}")
        return 1
    print(f"## audio-cue-curator (deterministic) — PASS ({len(header_set)} cues)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
