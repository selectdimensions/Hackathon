# TENEBRIS — interactive demo

> **Silent Watch · Passive Defense.**

A single-page HTML demo that simulates the full sensing pipeline end-to-end in the browser:

```
BladeRF 5.8 GHz → Raspberry Pi → ESP32-C6 + SX1262 → LoRa mesh (multi-hop) →
   C&C node (RSSI multilateration) → LoRa 868.3 → Soldier Node → I2S audio cue
```

The C&C output is **byte-compatible** with [DataAnalysisLog/log_format.md](../DataAnalysisLog/log_format.md) v1 — the canonical ndjson schema the real master emits over USB serial. A live master-node USB feed can later replace the simulator without touching the UI.

The look and feel are driven by [`branding/web/`](../branding/web/README.md) — `tokens.css` + `fonts.css` + vendored woff2. Change a brand value there, every consumer surface tracks.

## Why a simulator?

The firmware in [LoRaMeshing/](../LoRaMeshing/) and [Rx/](../Rx/) is still skeleton-level (see TODOs in `MasterNode.ino` / `SoldierNode.ino`). We also only have one real BladeRF/Pi node, but multilateration needs at least three pods to converge well. So all 25 pods are simulated in JavaScript; one (R2-N, the centre pod at 3 km north) is labelled "BladeRF / Pi (live)" on the map to mark where the real hardware plugs in.

## Running it

Fully offline — no build step, no internet.

```bash
# from the repo root (NOT from demo/) — the demo references ../AudioClips/ and ../branding/
python -m http.server 8000
# open http://localhost:8000/demo/
```

Why repo root? Both the MP3 cue library (`../AudioClips/`) and the brand layer (`../branding/web/`) live above `demo/`. `python -m http.server` won't follow `..` outside its serving root, so it must be one level up.

You can also double-click `demo/index.html`, but **audio fetch via `file://` is blocked by some browsers** — the HTTP server path always works.

## Controls

| Control | Effect |
|---|---|
| **scenario** dropdown | Pick `early_warning` (default), `fpv_incursion`, `gnss_jammer`, or `multi_threat`. |
| **Play / Pause** | Advance the simulation clock. All four scenarios run at **10× sim speed** so a 9-minute approach plays in ~54 s real time. The clock readout shows both sim and real time. |
| **Reset** | Rewind to t=0, clear markers + event log, flush soldier audio queue. |
| **⬇ ndjson** | Download the C&C event log as canonical ndjson — feed to [`DataAnalysisLog/parse_log.py`](../DataAnalysisLog/parse_log.py) or [`DataAnalysisLog/triangulate.py`](../DataAnalysisLog/triangulate.py). |
| **EN / FR** (audio panel) | Switch between [AudioClips/en/](../AudioClips/en/) and [AudioClips/fr/](../AudioClips/fr/) navigation clips. |
| **Mute** | Suppress audio playback (events still fire). |
| **Replay last** | Re-play the most recent alert's cue sequence. |

## What you see

- **Map** — pods (Drift-Gray dots, Aether-Blue for the live BladeRF/Pi pod), soldier (PPS-Green ★), C&C node (Amber ▣), drone/jammer (Trip-Red ✈ / ▲, pulses inside the 2 km ring), identified emitter (Trip-Red circle + residual ring + Trip-Red arrow from C&C to soldier). Range rings at 1 / 3 / 5 / 7 / 10 km, mesh links between pods within 3.5 km drawn as thin Drift-Gray lines.
- **Pipeline strip** above the map — each stage flashes as the corresponding event fires. Aether Blue = `detect`, Trip Red = `alert`. BladeRF / Pi / ESP32-C6 light up only for the live pod; helper pods skip straight to the LoRa mesh stage.
- **Event log** (right) — every line is one canonical ndjson event matching log_format.md v1. Detects in Aether Blue, alerts in muted red, rekeys in PPS Green.
- **Audio panel** (right top) — shows the cue sequence the soldier is playing (e.g. `CUE_DEG_030 + CUE_KM_05`) with a level-meter pulse on each alert. Cues are **FIFO-queued** — every km callout plays to completion, never clipped by a fresher alert. Mute also flushes the queue.

## Scenario lineup (all four share `_layout.json`)

All four scenarios reference [data/scenarios/_layout.json](data/scenarios/_layout.json) — the same 25-pod 5-arc mesh out to 10 km plus a rear C&C node at 1.5 km south of the soldier. Each pod is multi-band (3 / 4 / 5 = GNSS L1, 2.4 GHz, 5.8 GHz). Only the drone path differs.

| Scenario | Shape | Threat | What it exercises |
|---|---|---|---|
| `early_warning` | Big **S** | 5.8 GHz FPV drone 10 → 1 km @ 60 km/h | km countdown 10→1 + bearings sweep NNE↔NNW twice |
| `fpv_incursion` | Hard **W** | 5.8 GHz FPV drone 10 → 1 km | lateral bearing hammer DEG_330 ↔ DEG_030 |
| `gnss_jammer` | Static, then relocates | GNSS L1 jammer (6 km E → 8 km NW after 60 s) | re-triangulation on relocation, RSSI-only fallback |
| `multi_threat` | **V** + static | FPV V-shape (NE → soldier → NW) + 2.4 GHz jammer N | interleaved-band alerts via per-band `lastAlertedByBand` |

## Verification

Three equivalent surfaces — pick whichever fits your context:

### 1. Headless Python audit (CI-friendly)

```bash
python scripts/demo_audit.py
```

Runs every scenario through a JS-mirror multilateration solver (linear LS + Gauss-Newton refinement, same `BAND_PATHLOSS` table as the JS), asserts per-scenario expectations, exits 0/1. Hard-fails on any scenario where `tx_power_dbm` / `path_loss_n` drift from the master's solver constants.

Current state: 4/4 PASS.
- early_warning   — 28 alerts, km 1–10, 3 cues, max err 208 m
- fpv_incursion   — 27 alerts, km 2–10, 3 cues, max err 209 m
- gnss_jammer     —  7 alerts, km {6, 8}, 2 cues, max err  58 m
- multi_threat    — 35 alerts, km 2–10, 3 cues, max err 165 m

### 2. In-browser test harness

```
http://localhost:8000/demo/test.html
```

Runs each scenario in-process at 100× sim speed (no render, no audio), captures every event, asserts the same expectations as `demo_audit.py`. Table shows PASS / FAIL per scenario; downloadable JSON report.

### 3. Debug inspector (`?debug=1`)

```
http://localhost:8000/demo/?debug=1
```

Floating panel showing live:
- `t_sim / t_real / scale`
- `pods` count, `detects` count
- `truth.<emitter>` — ground-truth lat/lon, range, bearing
- `solve.last` — C&C estimate, method (`rssi_lsq`), residual, error vs. truth, km cue, tti
- `audio.queue` depth

`[⬇ snapshot]` downloads the full state + last 200 events as JSON. Every event is also emitted as a structured `[DEMO] {…}` console.log line — greppable from `python -m http.server` stdout when running headless.

## Early-warning — the headline scenario

A 25-pod LoRa mesh deployed in 5 concentric forward arcs at 1 / 3 / 5 / 7 / 10 km from the soldier — wide enough to triangulate accurately at long range, dense enough for multi-hop relay. Each pod connects to peers within 3.5 km via thin Drift-Gray lines on the map (the LoRa mesh). A rear **Command-and-Control (C&C) node** at 1.5 km south of the soldier joins its four nearest pods and receives every detection packet via mesh hop.

A 5.8 GHz FPV drone enters from ~10.5 km north at 60 km/h, weaves a big S as it approaches, closes to 1 km. As pods detect, packets hop through the mesh edges (Amber flashes) toward C&C. The C&C runs **linear-LS hyperbolic multilateration + 5-iter Gauss-Newton refinement** (`solve_method: "rssi_lsq"`) and fires a new `AlertPacket` each time the range bucket crosses a 1 km boundary OR the bearing shifts ≥ 15°.

The soldier hears the full progression:

> `CUE_DEG_***` + `CUE_KM_10` (drone at 10 km) → `CUE_KM_09` → `CUE_KM_08` → … → `CUE_KM_01` (1 km)

plus extra bearing cues whenever the drone changes heading. All cues FIFO-queued; nothing clipped.

**Accuracy** (verified vs. ground truth at 10 / 9 / 8 / 6 / 5 / 4 / 3 / 2 / 1 km test positions): localisation error **22–208 m**, bearing error **0.1–3.1°**. Every km bucket transition fires the correct `dist_NN.mp3`; every 30° heading bucket fires the correct `deg_NNN.mp3`.

Sim runs at 10× real time → 9-minute approach plays in ~54 s.

## Audio cue mapping

Uses the fine-grained cue range `0x50–0x6F` added in [shared/AudioCues.h](../shared/AudioCues.h):

| Range | Meaning | Files |
|---|---|---|
| `0x50–0x5B` | Bearing in 30° steps | `AudioClips/<lang>/deg_030.mp3` … `deg_360.mp3` |
| `0x60–0x69` | Distance in km (1–10) | `AudioClips/<lang>/dist_01.mp3` … `dist_10.mp3` |

For every alert, the soldier plays `<heading>.mp3` + `<km>.mp3` back-to-back via Web Audio — e.g. *"two hundred seventy degrees, five kilometres."*

## File layout

```
demo/
├── index.html              entry point (TENEBRIS lockup, favicon, page chrome)
├── test.html               browser test harness
├── css/demo.css            layout only — imports branding/web/{tokens,fonts}.css
├── js/
│   ├── protocol.js         port of shared/Protocol.h + shared/AudioCues.h
│   ├── sim/
│   │   ├── geo.js          flat-earth ENU helpers (no proj4 needed)
│   │   ├── scenario.js     scenario loader (resolves layout_ref) + emitter interpolation
│   │   ├── sensorPod.js    multi-band log-distance path loss → DetectPacket JSON
│   │   ├── masterNode.js   solveRssiMultilat (linear LS + GN refinement) + per-band alert rule
│   │   └── soldierNode.js  Web Audio cue sequencer (FIFO queue, lang switch, flush)
│   ├── ui/
│   │   ├── map.js          Leaflet + procedural Night-Shadow basemap + mesh edges + hop animation
│   │   ├── pipeline.js     animated stage strip (BladeRF → Pi → ESP32 → mesh → C&C → soldier)
│   │   ├── eventLog.js     rolling ndjson view + download
│   │   ├── audioPanel.js   current cue + lang + mute + level meter
│   │   └── inspector.js    ?debug=1 panel + snapshot + structured [DEMO] logging
│   └── main.js             tick loop, event routing, throttling, scenario lifecycle
├── data/scenarios/         _layout.json + 4 scenario JSON files
└── vendor/                 Leaflet 1.9.4 + leaflet-realtime + leaflet-rotatedmarker
```

The procedural basemap is a `L.GridLayer` that draws each 256×256 tile to canvas with a Night-Shadow fill + faint Drift-Gray 32-px grid. Colors are read from `branding/web/tokens.css` at init so brand updates flow through automatically.

## Verifying the JSON shape

After running a scenario, click **⬇ ndjson** to download. Then:

```bash
python DataAnalysisLog/parse_log.py master_log.ndjson
python DataAnalysisLog/triangulate.py \
  --fixture master_log.ndjson \
  --truth   DataAnalysisLog/fixtures/fpv_incursion_demo.truth.json \
  --format  json
```

Both must complete without errors — that's the contract that lets a real master node later replace this simulator.

## Future: live BladeRF/Pi bridge

The demo is standalone. If a real Pi appears later, the cleanest path is a WebSocket bridge: `main.js` already routes every event through one `handleMasterEvent` function — swap the simulator for a `new WebSocket('ws://pi.local:9000/master')` reader that emits the same shape, and nothing else changes.
