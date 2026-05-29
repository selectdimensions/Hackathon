# Roadmap — v0.3-hardware

The hardware track: a **compute-only master** + **≥4 receiver pods** (one elevated for 3D fixes), each a
**fixed bus** (battery + ESP32 + SX1262 + redundant SX1281/SX1278 + GNSS + accelerometer) with a
**swappable detection sensor** as the variable. Authoritative references:
[`../pod-sensor-reference.md`](../pod-sensor-reference.md) (sensor catalog + localization roles),
[`../TACTICAL_SENSOR_NETWORK_SPEC.md`](../TACTICAL_SENSOR_NETWORK_SPEC.md) (system/pitch spec),
[`V02_PIVOT.md`](V02_PIVOT.md) (Pi 5 + SDR procurement rationale),
[`../V02_GAP_ANALYSIS.md`](../V02_GAP_ANALYSIS.md) (issue/change backlog).

> Naming: the SDR procurement report is titled "v0.2" by its author; in this repo v0.2 is already the
> demo/protocol milestone, so the hardware track is **v0.3-hardware**.

## Milestones

### M0 — Foundation & vocabulary
- Commit the sensor catalog; reconcile RF-TDOA vs acoustic-TDOA claims (gap **C1**); this roadmap.
- *Exit:* a single shared model of fixed-bus + variable-sensor + which localization method each sensor supports (T/B/R/D/P).

### M1 — Multi-radio + variable-sensor abstractions (WS1, WS2)
- `shared/RadioLink.h` over RadioLib `PhysicalLayer` (SX1262 primary + SX1281/SX1278 redundant); master hosts all configured radios.
- `shared/SensorDriver.h` (`begin`/`poll`); `proto:` bump adding `sensor_class`, `altitude_m`, and a `PositionPacket`; JS port + `check_protocol.py` kept in sync.
- Accelerometer wake-on-motion → GNSS re-fix → `PositionPacket`.
- *Exit:* `arduino-cli` compiles all three sketches in single- and dual-radio configs (via `firmware-builder`); `check_protocol.py` green.

### M2 — Acoustic TDOA localization (WS3, gap C2)
- I²S MEMS mic pod skeleton (onset detect + GNSS-PPS timestamp + features over LoRa).
- Master 3D TDOA solve (≥4 pods, one elevated) → bearing/distance/speed → `AlertPacket` audio cue.
- Reorient `DataAnalysisLog/triangulate.py`: acoustic TDOA + RSSI multilat + DoA primary; RF-TDOA = v0.4 research.
- *Exit:* 4-pod (one elevated) acoustic fixture resolves X/Y/Z within tolerance (via `triangulation-validator`).

### M3 — BOM matrix + enclosure + manufacturing (WS4, WS5)
- Per-sensor BOM matrix (fixed-bus + variable-sensor + decoy line); cost at 1 / 100 / 1k / 1M scale.
- Parametric "ball" enclosure (`pod_ball.scad` → `pod_ball.stl`) for FDM/SLA prototyping.
- `ModuleDesign/MANUFACTURING.md`: DFM-for-injection-molding + 1M/month throughput math + supply chain.
- *Exit:* printable prototype STL + a manufacturing plan that shows the IM path to 1M/month.

### M4 — Hardening & blockers (WS6)
- A4 (Pi/pod threat model), B6 (`TX_ACTIVE` dual-radio co-existence), F3 (per-radio/per-sub-band duty cycle).
- Field-style multi-pod soak; no duty-cycle violations; no missed alerts.
- *Exit:* security model documented; duty-cycle auditor multi-radio-aware; soak clean.

## v0.4 trigger conditions (defer until met)

| Threshold | Action |
|---|---|
| Coherent SDR (USRP/BladeRF, shared reference) available at a site | Promote RF-TDOA from research to product |
| KrakenSDR DoA < 5° proven at master | Add a 2nd KrakenSDR site → cross-bearing RF localization |
| Acoustic array per pod yields reliable per-pod bearing | Fuse per-pod AoA with TDOA to cut GDOP |
| Injection-mold tooling funded | Move enclosure from FDM prototype to IM production |
| Sustained detections > 200/h/pod | Move alert plane to sub-band P (already wired in `LoRaConfig.h`) |
