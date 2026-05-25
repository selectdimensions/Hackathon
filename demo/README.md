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
| **scenario** dropdown | Pick `early_warning` (default), `fpv_incursion`, `gnss_jammer`, or `multi_threat`. |
| **Play / Pause** | Advance the simulation clock. Most scenarios run at real time (100 ms tick); `early_warning` runs at 20× so a 9-minute approach plays in ~27 s. The clock readout shows both sim and real time. |
| **Reset** | Rewind to t=0, clear markers and event log. |
| **⬇ ndjson** | Download the master-node event log as canonical ndjson — feed to [`DataAnalysisLog/parse_log.py`](../DataAnalysisLog/parse_log.py) or [`DataAnalysisLog/triangulate.py`](../DataAnalysisLog/triangulate.py). |
| **EN / FR** (audio panel) | Switch between [AudioClips/en/](../AudioClips/en/) and [AudioClips/fr/](../AudioClips/fr/) navigation clips. |
| **Mute** | Suppress audio playback (events still fire). |
| **Replay last** | Re-play the most recent alert's cue sequence. |

## What you see

- **Map** — pods (blue dots, yellow = live), soldier (green ★), drone/jammer (red ✈ / ▲, pulses as it gets close), triangulation result (red circle with residual ring + red arrow to soldier). In `early_warning`, dashed range rings at 1 / 2 / 5 / 10 km show the defended area.
- **Pipeline strip** above the map — each stage flashes as the corresponding event fires. Blue = `detect`, red = `alert`. BladeRF / Pi / ESP32-C6 light up only for the live pod; helper pods skip straight to the LoRa stage.
- **Event log** (right) — every line is one canonical ndjson event matching log_format.md v1. Detects are blue, alerts are red.
- **Audio panel** (right top) — shows the cue sequence the soldier is playing (e.g. `CUE_DEG_030 + CUE_KM_05`) with a level-meter pulse on each alert. Newer alerts cancel in-flight playback so the soldier always hears the freshest range, not a stack.

## Scenario lineup (all four use the same 25-pod mesh + C&C)

All four scenarios reference [demo/data/scenarios/_layout.json](data/scenarios/_layout.json) — the same 25-pod 5-arc mesh out to 10 km plus a rear C&C node at 1.5 km south of the soldier. Each pod is multi-band (3 / 4 / 5 = GNSS L1, 2.4 GHz, 5.8 GHz). Only the drone path differs.

| Scenario | Shape | Threat | Exercises |
|---|---|---|---|
| `early_warning` | Big **S** | 5.8 GHz FPV drone 10→1 km | km 10→1 + bearings sweep NNE↔NNW twice |
| `fpv_incursion` | Hard **W** | 5.8 GHz FPV drone 10→1 km | bearings hammer DEG_330 ↔ DEG_030 |
| `gnss_jammer` | Relocating static | GNSS L1 jammer (6 km E → 8 km NW) | re-triangulation on relocation |
| `multi_threat` | **V** + static | FPV V-shape + 2.4 GHz jammer | interleaved-band alerts |

## Verification

Two equivalent surfaces — pick whichever fits your context:

```bash
# Headless deterministic audit (CI-friendly, exits 0/1)
python scripts/demo_audit.py
```

```
# Browser test harness — open http://localhost:8000/demo/test.html
# Click "Run all 4 scenarios". Table shows PASS / FAIL per scenario plus a downloadable JSON report.
```

Both use the same per-scenario expectations: minimum alert count, expected km bucket set, distinct bearing cues, max localisation error. The browser test exercises the *actual* JS code path; the Python script is a parallel implementation that catches drift between the two.

## Debug inspector (`?debug=1`)

Open `http://localhost:8000/demo/?debug=1` for a live state panel:

- `t_sim / t_real / scale`
- `pods detecting`, `detects` count
- `truth.<emitter>` — ground-truth lat/lon, range, bearing
- `solve.last` — master estimate, method (`rssi_lsq`), residual, error vs. truth, km cue, tti
- `audio.queue` depth

`[⬇ snapshot]` downloads the full state + last 200 events as JSON. Every event is also emitted as a structured `[DEMO]` console.log line — greppable.

## Early-warning scenario (the headline demo)

A **25-pod LoRa mesh** deployed in 5 concentric forward arcs at 1 / 3 / 5 / 7 / 10 km from the soldier — wide enough to triangulate accurately at long range, dense enough for multi-hop relay. Each pod connects to peers within 3.5 km via thin gray lines on the map (the LoRa mesh). A rear **Command-and-Control (C&C) node** at 1.5 km south of the soldier joins its four nearest pods and receives every detection packet via the mesh.

A 5.8 GHz FPV drone enters from ~10.5 km north at 60 km/h, curves NNE → N → NW → N over the approach, closes to 1 km. As pods detect, packets hop through the mesh edges (yellow flashes) toward C&C. C&C runs **linear-LS hyperbolic multilateration + Gauss-Newton refinement** (`solve_method: "rssi_lsq"`) and fires a new `AlertPacket` each time the range bucket crosses a 1 km boundary OR the bearing shifts ≥ 15°.

The soldier hears the full progression:

> `CUE_DEG_***` + `CUE_KM_10` (drone at 10 km) → `CUE_KM_09` → `CUE_KM_08` → … → `CUE_KM_01` (1 km)

plus extra bearing alerts when the drone changes heading. All cues are FIFO-queued and play to completion — no clipping.

**Accuracy** (verified vs. ground truth across 10 → 1 km test positions): localisation error 22–111 m, bearing error 0.1–3.1°. Every km-bucket transition fires the correct `dist_NN.mp3` clip; every 15°+ heading change fires the correct `deg_NNN.mp3` clip.

Sim runs at **10×** real time so the 9-minute approach plays in ~54 s real.

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
