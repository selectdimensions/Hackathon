# TENEBRIS — live demo

> **Watchful shadows. Passive defense.**

A 3-minute, voice-guided command-center demonstration. It runs entirely in the
browser on a **real Leaflet map**, walks through five phases at a deliberate
pace, and lets the **voice narrate** while the map shows what is happening — no
screen clutter.

- **46 real sensor pods + 50 decoys + a master node** over a 10 km × 10 km area
  south-west of Brussels (real GPS, anchor 50.80 N, 4.40 E).
- A drone flies a deliberate **zig-zag** so the bearing/range callouts visibly
  change as it weaves in.
- The **accuracy cone tightens** from ~220 m (just acquired, outside the field)
  to ~1 m (locked inside the mesh), then **degrades to a bearing wedge** when the
  mesh is jammed, and recovers.

## Running it

No build step.

```bash
# from the repo root
python -m http.server 8000
# open http://localhost:8000/demo/
```

- **Map tiles need internet** (Esri satellite by default; OSM streets via the
  layer switcher, top-right). **Offline?** It auto-falls back to a built-in dark
  "Tactical grid" base after a few failed tiles, and you can pick it manually —
  the demo never renders blank.
- **Voice** uses the browser's built-in `speechSynthesis` (offline, no audio
  files). If a browser has no voices, the transcript panel still shows every line.

## Phases (auto-advance, or step with **Next phase**)

| # | Phase | What happens |
|---|---|---|
| 1 | **Setup** | Network revealed; voice frames the AO. Threat card: NO CONTACT. |
| 2 | **Launch** | Drone airborne NE; northern pods acquire; first fix appears. |
| 3 | **Track** | Zig-zag flight; cone tightens; periodic bearing/range callouts. |
| 4 | **Jam** | Mesh offline; cone becomes a wide bearing wedge; card goes DEGRADED. |
| 5 | **Recovery** | Re-sync; lock restored; card back to ACTIVE. |

## Controls

- **Play / Pause**, **Next phase**, **Restart**
- **Mute** (voice), **speed** slider (0.5×–2×; also scales narration rate)
- **Layer toggles**: Pods · Decoys · Coverage · Triangulation · Trajectory ·
  Accuracy cone · Transcript
- **Base map** switcher (Leaflet control, top-right): Satellite / Streets /
  Tactical grid

## What you see

- **Threat card** (bottom-right) — contact, confidence, range, bearing, velocity,
  accuracy, solve method, time-to-impact. Green border when locked, red when jammed.
- **Transcript** (bottom-left) — last few spoken lines.
- **Banner** (top) — JAM / RE-SYNC status.
- **Map** — green pods, faded decoys, accent master/operator, red drone (pulses
  as it bears down / under jam), accent triangulation lines to the active 4 pods,
  a tightening accuracy circle, and a fading breadcrumb trail.

## Tuning

Everything adjustable lives in **`js/config.js`** — GPS anchor, area size, pod
counts, detection range, phase durations, accuracy model, palette, and tile
sources. No other file hard-codes these.

## Architecture

```
demo/
├── index.html         page chrome + control bar
├── css/demo.css       dark tactical theme (palette mirrors config.js)
└── js/
    ├── config.js      single source of truth for every tunable
    ├── geo.js         ENU <-> lat/lon, distance, bearing
    ├── layout.js      deterministic 46 pods + 50 decoys + master/operator
    ├── scenario.js    zig-zag waypoints + per-phase narration
    ├── voice.js       speechSynthesis wrapper (mute, rate, transcript hook)
    ├── sim.js         position -> fix (detecting pods, confidence, accuracy)
    ├── map.js         Leaflet: tile layers + offline grid, markers, cone, trail
    ├── ui.js          threat card, transcript, banner, phase/clock readouts
    └── app.js         phase engine, tick loop, control wiring
```

Each module is one IIFE assigning a single global (`window.CFG`, `window.MAP`,
…), loaded in dependency order from `index.html`. The non-DOM core
(`config → geo → layout → scenario → sim`) is pure and runs headless under Node
for testing. Alert events follow the field shape in
[../DataAnalysisLog/log_format.md](../DataAnalysisLog/log_format.md).
