# RF-Threat Mesh — interactive demo

A single-page HTML demo that simulates the full sensing pipeline end-to-end in the browser:

```
BladeRF 5.8 GHz → Raspberry Pi → ESP32-C6 + SX1262 → LoRa 868.1 →
   Master Node (TDOA + RSSI solve) → LoRa 868.3 → Soldier Node → I2S audio cue
```

The simulator produces master-node events that are **byte-compatible** with [DataAnalysisLog/log_format.md](../DataAnalysisLog/log_format.md) v1 — the canonical ndjson schema the real master emits over USB serial. That means the demo can later be replaced by a live master-node USB feed without touching the UI.

## Why a simulator?

The firmware in [LoRaMeshing/](../LoRaMeshing/) and [Rx/](../Rx/) is still skeleton-level (see TODOs in `MasterNode.ino` / `SoldierNode.ino`). We also only have one real BladeRF/Pi node — TDOA needs three. So all three pods are simulated in JavaScript; one is labelled "BladeRF / Pi (live)" on the map so judges can see where the real hardware will plug in.

## Running it

The demo is fully offline. No build step, no internet.

```bash
# from the repo root (NOT from demo/) — the demo references ../AudioClips/
python -m http.server 8000
# open http://localhost:8000/demo/
```

Why repo root? The MP3 navigation library lives at `../AudioClips/` relative to `demo/index.html`. `python -m http.server` won't follow `..` outside its serving root, so you need the server rooted one level up.

You can also double-click `demo/index.html`, but **audio fetch via `file://` is blocked by some browsers** — `python -m http.server` always works.

## Controls

| Control | Effect |
|---|---|
| **scenario** dropdown | Pick `fpv_incursion`, `gnss_jammer`, or `multi_threat`. |
| **Play / Pause** | Advance the simulation clock at real time (100 ms tick). |
| **Reset** | Rewind to t=0, clear markers and event log. |
| **⬇ ndjson** | Download the master-node event log as canonical ndjson — feed to [`DataAnalysisLog/parse_log.py`](../DataAnalysisLog/parse_log.py) or [`DataAnalysisLog/triangulate.py`](../DataAnalysisLog/triangulate.py). |
| **EN / FR** (audio panel) | Switch between [AudioClips/en/](../AudioClips/en/) and [AudioClips/fr/](../AudioClips/fr/) navigation clips. |
| **Mute** | Suppress audio playback (events still fire). |
| **Replay last** | Re-play the most recent alert's cue sequence. |

## What you see

- **Map** — pods (blue dots, yellow = live), soldier (green ★), drone/jammer (red ✈ / ▲, pulses as it gets close), triangulation result (red circle with residual ring + red arrow to soldier).
- **Pipeline strip** above the map — each stage flashes as the corresponding event fires. Blue = `detect`, red = `alert`.
- **Event log** (right) — every line is one canonical ndjson event matching log_format.md v1. Detects are blue, alerts are red.
- **Audio panel** (right top) — shows the cue sequence the soldier is playing (e.g. `CUE_DEG_030 + CUE_KM_05`) with a level-meter pulse on each alert.

## Audio cue mapping

The demo uses the fine-grained cue range `0x50–0x6F` added in [shared/AudioCues.h](../shared/AudioCues.h):

| Range | Meaning | Files |
|---|---|---|
| `0x50–0x5B` | Bearing in 30° steps | `AudioClips/<lang>/deg_030.mp3` … `deg_360.mp3` |
| `0x60–0x69` | Distance in km (1–10) | `AudioClips/<lang>/dist_01.mp3` … `dist_10.mp3` |

For every alert, the soldier plays `<heading>.mp3` + `<km>.mp3` back-to-back via Web Audio — e.g. "two hundred seventy degrees, five kilometres".

## Architecture

```
demo/
├── index.html              entry point
├── css/demo.css            dark tactical theme
├── js/
│   ├── protocol.js         port of shared/Protocol.h + shared/AudioCues.h
│   ├── sim/
│   │   ├── geo.js          flat-earth ENU helpers (no proj4 needed)
│   │   ├── scenario.js     scenario loader + emitter interpolation
│   │   ├── sensorPod.js    log-distance path loss → DetectPacket JSON
│   │   ├── masterNode.js   TDOA stub + RSSI fallback (mirrors triangulate.py)
│   │   └── soldierNode.js  Web Audio cue sequencer
│   ├── ui/
│   │   ├── map.js          Leaflet + procedural tactical-grid basemap
│   │   ├── pipeline.js     animated stage strip
│   │   ├── eventLog.js     rolling ndjson view + download
│   │   └── audioPanel.js   current cue + lang + mute + meter
│   └── main.js             tick loop, event routing
├── data/scenarios/         canned drone-incursion timelines
└── vendor/
    ├── leaflet/            Leaflet 1.9.4 (BSD-2-Clause)
    ├── leaflet-realtime/   leaflet-realtime 2.2.0 (ISC)
    └── leaflet-rotatedmarker/  Leaflet.RotatedMarker (MIT)
```

The procedural basemap is a `L.GridLayer` that draws each 256×256 tile to a canvas with a soft topographic texture + 32-px grid + tile coords. No basemap PNG is committed.

## Verifying the JSON shape

After running a scenario, click **⬇ ndjson** to download. Then:

```bash
python DataAnalysisLog/parse_log.py master_log.ndjson
python DataAnalysisLog/triangulate.py \
  --fixture master_log.ndjson \
  --truth   demo/data/scenarios/fpv_incursion.truth.json \
  --format  json
```

Both must complete without errors — that's the contract that lets a real master node later replace this simulator.

## Future: live BladeRF/Pi bridge

This demo is standalone. If a real Pi appears later, the cleanest path is a WebSocket bridge: `main.js` already routes all events through one `handleMasterEvent` function — swap the simulator for a `new WebSocket('ws://pi.local:9000/master')` reader that emits the same shape, and nothing else changes.
