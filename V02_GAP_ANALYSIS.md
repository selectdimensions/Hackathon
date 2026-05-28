# Gap Analysis — repo vs. v0.2 Pi 5 + SDR Pivot doc

## Context

This document gaps the current repository against the **"RF-Threat Detection Mesh v0.2 — Raspberry Pi 5 + SDR Pivot"** architecture/procurement report (committed as [`docs/V02_PIVOT.md`](docs/V02_PIVOT.md) once gap G3 is closed).

The repo today is a **v0.1 ESP32-C6 + SX1262 + AD8318 log-detector scaffold**, well documented and CI-gated, but with placeholder firmware bodies. The v0.2 doc is a **procurement/architecture pivot** to Pi 5 + SDR pods with the **ESP32-C6 retained as a per-pod LoRa/crypto companion** (Option B in doc §6), plus a single **KrakenSDR at the master site** for direction-finding (not TDOA). Wire format and crypto stay bit-identical.

Each divergence is written as an `**Issue**` (what's wrong / missing) + `**Change**` (concrete edit, with file paths). This document does **not** implement anything — it is the issue/change backlog for the `feat/v0.2-pi-sdr-pivot` branch.

## Execution — branch strategy

All gap-closing work lands on `feat/v0.2-pi-sdr-pivot` (branched off `develop`, matching the `feat/<name>` model in [`CONTRIBUTING.md`](CONTRIBUTING.md) / [`README.md`](README.md)), using the conventional prefixes (`proto:`, `crypto:`, `sdr:`, `hw:`, `docs:`, …). `develop` stays untouched as the known-good v0.1 return point; we open a PR into `develop` only once the chosen gap set is done and CI is green.

## Legend

- **[BLOCKER]** — must be addressed before v0.2 can ship or before docs become correct
- **[MAJOR]** — substantial new work the doc mandates; deferring breaks v0.2 scope
- **[MINOR]** — doc/comment/labeling cleanup, no design impact
- **[OUT-OF-SCOPE-OK]** — doc explicitly defers to v0.3 (recorded so we don't accidentally start it)

File references use the format [`path:line`](path#Lline).

---

## A. Architecture & Compute boundaries

### A1. [BLOCKER] No Pi 5 host code or directory exists
- **Issue:** The v0.2 architecture (doc §3, §6 Option B) requires a Pi 5 per pod running the SDR + layered detector. The repo has zero Pi-side code. All sensor-side logic lives in [`LoRaMeshing/SensorNode/SensorNode.ino`](LoRaMeshing/SensorNode/SensorNode.ino) which presumes an AD8318 ADC frontend.
- **Change:** Add a new top-level directory `PiPod/` with:
  - `PiPod/detector/` — C source: librtlsdr / libhackrf wrapper, ring buffer in `/dev/shm`, FFTW energy stage (doc §3 "Stage 1")
  - `PiPod/classifier/` — Python: pyFFTW signature classifier (doc §3 "Stage 2")
  - `PiPod/uart_bridge/` — DetectPacket framing over UART to ESP32-C6 companion (matches [`shared/Protocol.h`](shared/Protocol.h) layout)
  - `PiPod/systemd/` — service units, `pps-gpio` overlay, chrony.conf
  - `PiPod/README.md` — DragonOS Pi64 Beta42 (doc §10) as the base image
  - `PiPod/.github/workflows/build.yml` — arm64 native build + Python lint

### A2. [BLOCKER] ESP32-C6 sensor sketch is single-board, not "companion mode"
- **Issue:** [`LoRaMeshing/SensorNode/SensorNode.ino`](LoRaMeshing/SensorNode/SensorNode.ino) has FreeRTOS tasks `task_rf_detect`, `task_gps_pps`, `task_lora_tx`, `task_lora_rx`, `task_heartbeat`. In Option B, detection moves to the Pi; the ESP32-C6 only receives a pre-classified DetectPacket payload over UART, signs/encrypts/transmits it, and handles the rekey state machine. Keeping both code paths confuses the TCB boundary the doc emphasises (§6, "TCB stays ~30 KB").
- **Change:**
  - Replace `task_rf_detect` with `task_uart_ingest` (read framed DetectPacket payload from Pi, validate, hand to TX task).
  - Keep `task_gps_pps` as the PPS authority for nonce-counter discipline; the Pi gets PPS from its own GPS HAT (doc §4).
  - Add a `COMPANION_MODE` build flag (default ON) so the same sketch can still be flashed for AD8318-only v0.1 hardware during transition.
  - Add `// SECURITY: AES/Ed25519 keys never leave this MCU. UART carries plaintext detection metadata only — never key material.` near the `task_uart_ingest` boundary.

### A3. [BLOCKER] Master site has no Pi 5 / KrakenSDR compute path
- **Issue:** Doc §4/§10 puts a **KrakenSDR ($749, 5×R820T2 coherent)** at the master site, hosted on a Pi 5, for cued direction-finding. [`LoRaMeshing/MasterNode/MasterNode.ino`](LoRaMeshing/MasterNode/MasterNode.ino) has only the ESP32-C6; there is no cue path from "alert received → KrakenSDR DoA → bearing report" (doc Milestone 3 exit: "<2 s end-to-end cue → bearing").
- **Change:**
  - Add `PiPod/master_dsp/` (or `MasterDSP/`) for the KrakenSDR + DSP integration, calling the `krakenrf/krakensdr_dsp` repo (doc §10).
  - Add UART path from Pi-side DSP into ESP32-C6 master so the AlertPacket `bearing_deg` field comes from KrakenSDR, not from the (unreliable) host-clock TDOA solve.
  - Update [`LoRaMeshing/MasterNode/MasterNode.ino`](LoRaMeshing/MasterNode/MasterNode.ino) `task_triangulate` to await a bearing from the Pi instead of running Bancroft on RSSI-only data.

### A4. [MAJOR] Codebase silent on TCB / key-isolation boundary
- **Issue:** Doc §6 makes "crypto TCB stays small, keys never leave ESP32-C6" the central justification for Option B. [`SECURITY.md`](SECURITY.md) does not yet address Pi compromise.
- **Change:** Add a section to [`SECURITY.md`](SECURITY.md) titled "Pi pod threat model": Pi is full Linux (large attack surface); a compromised Pi must NOT exfiltrate session keys or impersonate the pod's ESP32-C6 to the master; UART link is one-way (Pi→ESP32-C6) for detection payloads, and the ESP32-C6 still owns the SX1262 SPI bus exclusively.

---

## B. Protocol, wire format, frequency plan

### B1. [BLOCKER] LoRaConfig.h missing EU sub-band P (10% DC) for downlink
- **Issue:** [`shared/LoRaConfig.h:12-13`](shared/LoRaConfig.h#L12-L13) defines only sub-band g at 868.1/868.3 MHz, 1% DC. Doc §5 explicitly recommends moving **master→soldier downlink to sub-band P (869.4–869.65 MHz, 10% DC, +27 dBm ERP)** to get 10× airtime headroom — critical for the AlertPacket capacity the doc cites (~232 detections/h/device theoretical, ~30/pod/min realistic peak).
- **Change:** Append to [`shared/LoRaConfig.h`](shared/LoRaConfig.h):
  ```cpp
  // Sub-band P (ETSI EN 300 220-2 V3.2.1): 869.4–869.65 MHz, 10% DC, +27 dBm ERP
  static constexpr float    FREQ_B_HIGH_RATE_MHZ          = 869.525f;
  static constexpr uint8_t  TX_POWER_DBM_SUBBAND_P        = 27;
  static constexpr uint32_t DUTY_CYCLE_BUDGET_MS_SUBBAND_P = 360000; // 10% of 3600 s
  ```
  Then update `MasterNode.ino` TX path + [`scripts/check_eu_duty_cycle.py`](scripts/check_eu_duty_cycle.py) to account for two sub-bands separately (per-device per-sub-band budget). Also add a comment that 14 dBm limit only applies on sub-band g.

### B2. [MAJOR] BandId enum mislabels Pod D as "433_915"
- **Issue:** [`shared/Protocol.h:31`](shared/Protocol.h#L31) names the band `BAND_433_915_MHZ`. Doc Pod D is EU 868 MHz / ELRS-EU specifically; 915 MHz is US-only and inadmissible under ETSI. The enum value is consumed by the master to interpret the report's origin, so misnaming will mis-classify alerts.
- **Change:** Rename to `BAND_433_868_MHZ` (covers EU SRD 433 MHz + EU 868) and update [`ARCHITECTURE.md:94`](ARCHITECTURE.md#L94) Pod D row to match. Bump `PROTOCOL_VERSION` per the `proto:` rule in [`CONTRIBUTING.md`](CONTRIBUTING.md). Update any string tables in [`MasterNode.ino`](LoRaMeshing/MasterNode/MasterNode.ino).

### B3. [MAJOR] ThreatClass enum has no subtype for SDR-grade classifications
- **Issue:** Doc §3 specifies five signature classifiers (GNSS L1 jam, analog FPV video, OcuSync presence, ELRS FHSS, LoRa chirp). [`shared/Protocol.h:38-46`](shared/Protocol.h#L38-L46) has six classes but no slots for OcuSync-vs-ELRS or LoRa-chirp distinction. The current `THREAT_FPV_CONTROL` lumps OcuSync, ELRS, and Wi-Fi-band drones together.
- **Change:** Either:
  - (a) Add `THREAT_OCUSYNC_PRESENCE = 7`, `THREAT_ELRS_FHSS = 8`, `THREAT_LORA_CHIRP = 9` to [`shared/Protocol.h`](shared/Protocol.h); bump protocol version; OR
  - (b) Keep enum stable and use the existing 8-bit `flags` byte for subtype hints (only one bit free given current FLAG_* assignments — likely too tight).
  - Recommendation: (a). Document in the same commit which classifier produces which class.

### B4. [MAJOR] DetectPacket has no classifier-confidence field
- **Issue:** Doc §3 layered detector outputs (a) energy threshold pass, (b) signature match score from Stage 2. AlertPacket has `confidence` (0..100) but DetectPacket does not — so master cannot weight reports from a noisy pod lower in the cue decision.
- **Change:** Either add a `uint8_t classifier_score` to DetectPacket (would push struct to 29 B; check `static_assert` and airtime impact), OR repurpose the high nibble of `flags`. Recommend adding the field; doc explicitly says wire format "stays bit-identical" w.r.t. envelope/AES, not w.r.t. payload — a v0.2 bump is consistent with `proto:` rules.

### B5. [MINOR] LoRaConfig.h comment "RekeyPacket chunked across 2 frames" not enforced
- **Issue:** [`shared/LoRaConfig.h:27`](shared/LoRaConfig.h#L27) comment says RekeyPacket (108 B) is chunked across 2 frames; the struct itself is contiguous and there is no chunking code yet.
- **Change:** When `task_rekey` is implemented in [`LoRaMeshing/MasterNode/MasterNode.ino`](LoRaMeshing/MasterNode/MasterNode.ino), wire up a 2-fragment LoRa send (max LoRa payload at SF9/CR4-5 is ~64 B; 2× 54 B fragments fit). Add a `RekeyFragment` framing TLV in [`shared/Protocol.h`](shared/Protocol.h) (does not affect the signed bytes; signature still covers the full reassembled `RekeyPacket`).

### B6. [BLOCKER] No `TX_ACTIVE` self-jam mitigation primitive
- **Issue:** Doc §7 "Antenna isolation (the Pod D problem)" warns that the pod's own SX1262 TX at +22 dBm desenses a co-located RTL-SDR for hundreds of ms. Mitigation requires the ESP32-C6 to assert a GPIO before TX and the Pi's classifier to mask that window. No such GPIO line or UART message exists yet.
- **Change:**
  - Reserve a GPIO on the ESP32-C6 (e.g., GPIO 8 if free) named `PIN_TX_ACTIVE`; assert HIGH for `airtime_ms + 5 ms` around every LoRa TX.
  - On Pi side, wire that to a GPIO input; the C energy detector gates its threshold for the duration.
  - Document the wire in [`LoRaMeshing/README.md`](LoRaMeshing/README.md) pin map and `PiPod/README.md`.

---

## C. Timing & TDOA promises that v0.2 disproves

### C1. [BLOCKER] ARCHITECTURE.md overstates TDOA accuracy
- **Issue:** [`ARCHITECTURE.md:84`](ARCHITECTURE.md#L84) claims `micros() captured on PPS rising edge gives sub-microsecond cross-node sync`. That is true for the ESP32-C6 system clock but **not** for the moment an I/Q sample arrives at userspace on a USB SDR. Doc §4 documents 20–30 ms USB-burst jitter — i.e. **kilometers of TDOA error** on cheap SDRs (1 µs ≈ 300 m). The current architecture diagram in [`ARCHITECTURE.md:73-80`](ARCHITECTURE.md#L73-L80) markets "Hyperbolic intersection (Bancroft closed-form)" as the primary solve.
- **Change:**
  - Rewrite the "TDOA math (overview)" section of [`ARCHITECTURE.md`](ARCHITECTURE.md) to reflect v0.2 reality:
    - Primary localization in v0.2 = **KrakenSDR DoA** from the master site (single bearing) + **RSSI multilateration** as triangulation fallback.
    - True sample-accurate TDOA is **v0.3 research**, contingent on reference-TX cross-correlation (Stefan Scholl / DC9ST method, doc §4).
  - Add a "Localization accuracy budget" subsection citing the v0.2 numbers (DoA <5° at <2 s end-to-end; RSSI ~50–300 m depending on band; TDOA NOT promised).

### C2. [BLOCKER] triangulate.py solver matches obsolete promise
- **Issue:** [`DataAnalysisLog/triangulate.py`](DataAnalysisLog/triangulate.py) is a stub for Bancroft TDOA. Per C1, the v0.2 primary path is DoA-cued + RSSI multilateration.
- **Change:**
  - Reorient [`DataAnalysisLog/triangulate.py`](DataAnalysisLog/triangulate.py): implement `solve_rssi()` (log-distance model, multi-pod LS) as the v0.2 production path; keep `solve_tdoa()` as an experimental v0.3 hook.
  - Add `ingest_doa_bearing(master_lat, master_lon, bearing_deg, sigma_deg)` that returns a bearing line for intersection with RSSI confidence circles.
  - Update [`.claude/agents/triangulation-validator.md`](.claude/agents/triangulation-validator.md) thresholds: DoA <5° accuracy, RSSI <300 m at <500 m range, TDOA tests marked `xfail`/`skip` with a comment pointing to v0.3.

### C3. [MAJOR] PPS distribution scheme for Pi + ESP32-C6 not documented
- **Issue:** Doc §4 puts PPS on **Pi 5 GPIO 18** (chrony). Current docs assume PPS on ESP32-C6 GPIO. With Option B, both need PPS: Pi for SDR sample-stream timestamping (chrony sub-µs), ESP32-C6 for LoRa nonce-counter discipline and for marking DetectPacket `pps_timestamp_us`.
- **Change:** Add `PiPod/docs/pps.md` describing:
  - Single u-blox MAX-M10S GPS, PPS line **fanned out to both Pi GPIO 18 and ESP32-C6 GPIO** (74AHC1G125 buffer or just two parallel high-Z inputs).
  - Pi runs chrony with `refclock PPS /dev/pps0 refid PPS lock GPS prefer` (doc §4).
  - ESP32-C6 uses its existing PPS ISR (already in [`LoRaMeshing/SensorNode/SensorNode.ino`](LoRaMeshing/SensorNode/SensorNode.ino) `task_gps_pps`).
  - The `pps_timestamp_us` field in DetectPacket is sourced from the Pi (since the SDR sample stream lives there) and shipped over UART; ESP32-C6 only validates monotonicity.

---

## D. Hardware / BOM / Power

### D1. [BLOCKER] No BOM in repo; v0.2 procurement decisions absent
- **Issue:** Doc §8 has a detailed per-pod EU BOM (€440–€720 per pod, €3860 full kit). Repo's [`ModuleDesign/Body/`](ModuleDesign/Body/) and [`ModuleDesign/Elect/`](ModuleDesign/Elect/) are empty.
- **Change:** Add `ModuleDesign/BOM.md` with the doc §8 table verbatim, plus a "v0.2 pivot vs v0.1 AD8318" cost-multiplier line (5–8×). Cross-link from [`README.md`](README.md) status line.

### D2. [BLOCKER] V4 references in repo, but V4 was EOL'd 14 May 2026
- **Issue:** [`ARCHITECTURE.md:95`](ARCHITECTURE.md#L95) names "RTL-SDR v4 or similar" for Pod E. Per doc §1 / §Caveat 1, the V4 (R828D tuner) is end-of-life since 14 May 2026; the production part is the V3 (R820T2), with a V4L (R828S) refresh path.
- **Change:** Update [`ARCHITECTURE.md:95`](ARCHITECTURE.md#L95) to "RTL-SDR Blog V3 (R820T2); track V4L (R828S) for future refresh." Grep the whole repo for "V4" / "rtl-sdr v4" / "R828D" and fix anywhere else it appears.

### D3. [MAJOR] No LoRa HAT specified for Pi side (and shouldn't be, in Option B)
- **Issue:** Doc §2 surveys Pi LoRa HATs (MeshAdv-Pi v1.1, RAK6421+RAK13300) but doc §6 Option B (recommended) explicitly does NOT run RadioLib on the Pi — it hands off to ESP32-C6. Newcomers will read §2 and mis-buy hardware.
- **Change:** In `PiPod/README.md`, lead with: *"In Option B, the Pi does NOT have a LoRa HAT. The SX1262 is owned by the ESP32-C6 companion. The HAT survey in the v0.2 architecture doc §2 is reference material for an Option-A path we explicitly reject for crypto-TCB reasons (see [`SECURITY.md`](SECURITY.md) §Pi pod threat model)."*

### D4. [MAJOR] GPS HAT not specified
- **Issue:** Doc §4 recommends u-blox MAX-M10S or ATGM336H (MeshAdv-Pi). Current repo just says "GPS PPS to ESP32-C6 GPIO" generically.
- **Change:** Pick **u-blox MAX-M10S** (multi-constellation, current production, cheaper than M9N, helps jam resilience per doc §4); document in `ModuleDesign/BOM.md` and `PiPod/docs/pps.md`. Note that MeshAdv-Pi v1.1 is an alternative with PPS on GPIO 23 instead of 18 (single-vendor Etsy supply risk per doc §2).

### D5. [MAJOR] No power / thermal budget; Pi 5 needs active cooling
- **Issue:** Doc §7 gives per-pod power numbers (4.2 W idle, 7–9 W active) and warns Pi 5 throttles 2.4→1.5 GHz at 86.7 °C without cooling. Repo's [`LoRaMeshing/README.md`](LoRaMeshing/README.md) and [`Rx/README.md`](Rx/README.md) have no power section.
- **Change:** Add a "Power & thermal" section to `PiPod/README.md` quoting doc §7: active cooler mandatory; 20 Ah USB-PD pack ≈ 7–10 h depending on pod; for >24 h, 30 W solar + 50 Ah LiFePO4. Add to `ModuleDesign/BOM.md`.

### D6. [MAJOR] Antenna isolation rule for Pod D missing from docs
- **Issue:** Doc §7 mandates **≥2 m physical separation** between Pod D's SX1262 TX antenna and its RX SDR antenna. No mention in any module README today.
- **Change:** Add a "Mechanical / antenna layout" subsection in `ModuleDesign/README.md` capturing the ≥2 m rule, the SAW band-stop option, and the recommendation to repurpose Pod D's RX from 868 MHz to 869.4–869.65 MHz (sub-band P) or 433 MHz (doc §7 last paragraph).

---

## E. Software pipeline (Pi side)

### E1. [BLOCKER] No layered detector implementation
- **Issue:** Doc §3 specifies the two-stage detector (always-on C energy + cued Python classifier). Zero code exists.
- **Change:** Build `PiPod/detector/`:
  - `detector/main.c` — librtlsdr + libhackrf shared-memory ring buffer
  - `detector/stage1_energy.c` — FFTW (4096-pt), Hann window, magnitude², threshold + dwell
  - `detector/stage2_trigger.c` — fork/pipe trigger to Python classifier
  - `detector/Makefile` — gcc -O2 -mcpu=cortex-a76 (Pi 5)
  - Reference: cite Yucek & Arslan 2009, Mariani/Giorgetti/Chiani 2011 (doc §3 last paragraph) in the header comment.

### E2. [BLOCKER] No signature classifiers
- **Issue:** Doc §3 lists five classifiers:
  - GNSS L1 jam (Pod C) — 2 MHz BW @ 1575.42 MHz, noise-floor rise + spectral entropy
  - Analog 5.8 GHz FPV (Pod A) — 6–8 MHz envelope + 15.625/15.7 kHz sync
  - OcuSync presence (Pod A/B) — ~10 MHz LTE-like burst, 500–600 ms cadence
  - ELRS / FHSS (Pod B) — ≥20 hops/s detection
  - LoRa chirp (Pod D) — matched filter SF7–SF12 / BW125
- **Change:** Add `PiPod/classifier/` with one `.py` per signature, each exposing a `classify(iq_chunk, sample_rate_hz) -> (threat_class, confidence)` returning enums from [`shared/Protocol.h`](shared/Protocol.h) (mirror the enum in `classifier/protocol_constants.py`).

### E3. [MAJOR] UART protocol between Pi and ESP32-C6 undefined
- **Issue:** No framing spec. Without one, A2 cannot be implemented.
- **Change:** Define a tiny COBS-framed protocol in `PiPod/uart_bridge/uart_proto.md`:
  - Frame: `0x00 | LEN | TYPE | DetectPacket payload (28 B from shared/Protocol.h) | CRC16 | 0x00`
  - One TYPE byte for forward-compatibility (initially: 0x01 = DetectPacket, 0x02 = HeartbeatPacket).
  - Baud 921600 8N1 (well within ESP32-C6 UART capability).
  - Header file at `PiPod/uart_bridge/uart_proto.h`, included from both Pi C code and ESP32-C6 sketch via `sync_shared.ps1`.

### E4. [MAJOR] Reference projects not cited in tooling
- **Issue:** Doc §10 lists DragonOS Pi64, KrakenSDR DSP, DC9ST tdoa-evaluation-rtlsdr, RUB-SysSec/DroneSecurity, etc. The agents / tooling don't know about any of these.
- **Change:** Add a `PiPod/REFERENCES.md` enumerating each project with the use case from doc §10 + an upstream commit / release pin. Cite from the relevant module's README. Add a `.claude/agents/sdr-pipeline-validator.md` agent stub (description: runs detector against I/Q fixture files in `PiPod/detector/fixtures/`, asserts threat_class match).

### E5. [OUT-OF-SCOPE-OK] True sample-accurate TDOA via reference-TX cross-correlation
- **Issue:** Doc §4 explicitly defers to v0.3.
- **Change:** Note this in [`DataAnalysisLog/README.md`](DataAnalysisLog/README.md) "v0.3 roadmap" section so we don't accidentally start it under v0.2.

---

## F. CI / CD

### F1. [BLOCKER] No Pi-side build pipeline
- **Issue:** [`.github/workflows/ci.yml`](.github/workflows/ci.yml) only runs Python checks + arduino-cli. No build for `PiPod/detector/` (C, arm64).
- **Change:** Add `PiPod/.github/workflows/build.yml`:
  - Use `ubuntu-24.04-arm` runner (or QEMU cross-compile via `pguyot/arm-runner-action@v2`).
  - Steps: `apt install librtlsdr-dev libhackrf-dev libfftw3-dev libliquid-dev`, `make -C PiPod/detector`, `pytest PiPod/classifier/`.
  - Status badge on root [`README.md`](README.md).

### F2. [MAJOR] No I/Q fixture replay tests
- **Issue:** Doc §3 cites specific signal signatures; without fixture replays, classifier regressions are invisible.
- **Change:** Add `PiPod/detector/fixtures/` with at least one I/Q capture per pod variant (or a synthesis script if real captures aren't legally shareable). Add `PiPod/classifier/tests/test_replay.py` that asserts known-good detections. Hook into F1.

### F3. [MAJOR] Duty-cycle script does not understand sub-band P
- **Issue:** [`scripts/check_eu_duty_cycle.py`](scripts/check_eu_duty_cycle.py) implements the deterministic equivalent of [`.claude/agents/eu-duty-cycle-auditor.md`](.claude/agents/eu-duty-cycle-auditor.md), which today assumes only sub-band g. Doc Caveat 4 says EU 868 duty cycle is **per-device**, and v0.2 introduces sub-band P at 10%.
- **Change:** Add per-sub-band budgets to the script (g: 36 s/h, P: 360 s/h), with the master's downlink frequency mapped to P (per B1) and uplinks to g. Update the audit JSON event schema in [`DataAnalysisLog/log_format.md`](DataAnalysisLog/log_format.md) to carry a `sub_band` field per TX event.

### F4. [MINOR] Conventional-commit prefix `sdr:` not declared
- **Issue:** [`CONTRIBUTING.md`](CONTRIBUTING.md) lists `feat:`, `fix:`, `proto:`, `crypto:`, `chore:`, `docs:`, `refactor:`, `test:` but nothing for SDR pipeline changes.
- **Change:** Add `sdr:` (PiPod detector / classifier changes) and `hw:` (BOM / ModuleDesign / pinout) to the prefix table.

---

## G. Documentation

### G1. [BLOCKER] README front matter still v0.1
- **Issue:** [`README.md:99`](README.md#L99) ends with "v0.1 — framework scaffold only." The architecture mermaid above only shows ESP32-C6 pods.
- **Change:** Update the architecture mermaid in [`README.md`](README.md) to show `Pod = Pi 5 + RTL-SDR/HackRF + ESP32-C6 companion` per doc §6. Bump status to "v0.2 plan accepted; M0 in progress" once the pivot is greenlit. Add a "v0.2 pivot rationale" link to the new `docs/V02_PIVOT.md` (G3).

### G2. [BLOCKER] ARCHITECTURE.md does not reflect the pivot at all
- **Issue:** [`ARCHITECTURE.md`](ARCHITECTURE.md) describes only the v0.1 ESP32-C6 + AD8318 architecture; mentions Pod E as "future" with a stale "RTL-SDR v4" reference.
- **Change:** Either:
  - (a) Replace [`ARCHITECTURE.md`](ARCHITECTURE.md) with the v0.2 view (Pi + companion + KrakenSDR), preserving v0.1 sections behind a collapsible "Legacy v0.1" block; OR
  - (b) Keep [`ARCHITECTURE.md`](ARCHITECTURE.md) as the *current* state and add `docs/ARCHITECTURE_V02.md` for the pivot.
  - Recommendation: (a). Single source of truth for what we're shipping.

### G3. [MAJOR] v0.2 doc not in repo
- **Issue:** The procurement / pivot reasoning is the authority for this gap analysis but lives only in chat. It will rot.
- **Change:** Commit the v0.2 document as `docs/V02_PIVOT.md` so future reviewers can audit the rationale (V4 EOL date, KrakenSDR pricing, Pi-bladeRF benchmarks, citations). Link from [`README.md`](README.md) status line and from [`ARCHITECTURE.md`](ARCHITECTURE.md) TL;DR.

### G4. [MAJOR] SECURITY.md silent on Pi compromise
- **Issue:** See A4. Doc §6 hinges the architecture on a tight TCB; this must be a first-class section.
- **Change:** Already covered by A4's change.

### G5. [MINOR] CONTRIBUTING.md commit-prefix table needs `sdr:` and `hw:`
- **Issue:** See F4.
- **Change:** Same as F4.

### G6. [MINOR] LoRaMeshing/README.md still describes legacy single-board pod
- **Issue:** [`LoRaMeshing/README.md`](LoRaMeshing/README.md) FreeRTOS task topology + pin-map table assume AD8318 ADC and on-board GPS PPS.
- **Change:** Add a "Companion mode (v0.2)" subsection with the revised task topology (UART ingest replaces ADC read) and pin map (UART pins added; `PIN_TX_ACTIVE` GPIO added; PPS line is now externally buffered from Pi-shared GPS).

### G7. [MINOR] Pod variant table in ARCHITECTURE.md uses "900 MHz" and "RTL-SDR v4"
- **Issue:** [`ARCHITECTURE.md:94-95`](ARCHITECTURE.md#L94-L95). Already partially covered by B2 and D2.
- **Change:** Same as B2 + D2; ensure both are fixed in the same commit.

---

## H. Project management / sequencing

### H1. [MAJOR] No M0–M4 milestone tracking
- **Issue:** Doc "Staged plan with concrete benchmarks" lists M0 (single-pod bring-up), M1 (SDR + detector), M2 (GPS + multi-pod time sync), M3 (high-band + KrakenSDR), M4 (hardening). Nothing tracks these in the repo.
- **Change:** Add `docs/ROADMAP.md` with M0–M4 + exit criteria verbatim from the doc, mapped to the gap IDs in this report. Use it for sprint planning.

### H2. [MAJOR] Decision-change benchmarks not encoded
- **Issue:** Doc "Benchmarks that would change the plan" lists thresholds that flip v0.2 decisions (bladeRF at 60 MS/s, V4L availability, KrakenSDR DoA < 5°, DC9ST < 50 m, > 200 detections/h sustained). These are testable, but no fixtures or scripts watch for them.
- **Change:** Add the threshold table to `docs/ROADMAP.md` as a "v0.3 trigger conditions" section. When fixtures land (per F2), tag any that, if passed, would trigger a doc-§"Benchmarks" decision.

---

## Cross-cutting list of files that must change

| File | Severity | Reason |
|---|---|---|
| [`shared/LoRaConfig.h`](shared/LoRaConfig.h) | BLOCKER | Add sub-band P (B1), TX_POWER_DBM_SUBBAND_P |
| [`shared/Protocol.h`](shared/Protocol.h) | MAJOR | Rename `BAND_433_915_MHZ` (B2); add OcuSync / ELRS / LoRa-chirp threat classes (B3); add classifier_score (B4); bump PROTOCOL_VERSION |
| [`LoRaMeshing/SensorNode/SensorNode.ino`](LoRaMeshing/SensorNode/SensorNode.ino) | BLOCKER | Add COMPANION_MODE, UART ingest task, TX_ACTIVE GPIO (A2, B6) |
| [`LoRaMeshing/MasterNode/MasterNode.ino`](LoRaMeshing/MasterNode/MasterNode.ino) | BLOCKER | Accept bearing from Pi-side KrakenSDR DSP; sub-band P TX for AlertPacket; update enum names (A3, B1, B2) |
| [`Rx/SoldierNode/SoldierNode.ino`](Rx/SoldierNode/SoldierNode.ino) | MAJOR | Sub-band P RX configuration; new threat class WAVs |
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | BLOCKER | Rewrite for Pi + companion + KrakenSDR (G2); fix Pod D label (G7); fix RTL-SDR V4 → V3 (D2); rewrite TDOA section (C1) |
| [`README.md`](README.md) | BLOCKER | Update architecture mermaid + status (G1) |
| [`SECURITY.md`](SECURITY.md) | MAJOR | Pi compromise threat model (A4) |
| [`CONTRIBUTING.md`](CONTRIBUTING.md) | MINOR | Add `sdr:` and `hw:` commit prefixes (F4) |
| [`LoRaMeshing/README.md`](LoRaMeshing/README.md) | MINOR | Companion-mode pin map (G6) |
| [`DataAnalysisLog/triangulate.py`](DataAnalysisLog/triangulate.py) | BLOCKER | Reorient to DoA + RSSI primary, TDOA experimental (C2) |
| [`DataAnalysisLog/log_format.md`](DataAnalysisLog/log_format.md) | MAJOR | Add sub_band field per TX event (F3) |
| [`scripts/check_eu_duty_cycle.py`](scripts/check_eu_duty_cycle.py) | MAJOR | Per-sub-band budget (F3) |
| [`.claude/agents/triangulation-validator.md`](.claude/agents/triangulation-validator.md) | MAJOR | New thresholds (C2) |
| [`.claude/agents/eu-duty-cycle-auditor.md`](.claude/agents/eu-duty-cycle-auditor.md) | MAJOR | Per-sub-band knowledge (F3) |
| `.claude/agents/sdr-pipeline-validator.md` | NEW | Fixture-based classifier validation (E4) |
| `ModuleDesign/BOM.md` | NEW | Per-pod EU BOM (D1) |
| [`ModuleDesign/README.md`](ModuleDesign/README.md) | MAJOR | Antenna isolation, mechanical layout (D6) |
| `PiPod/` (entire directory) | NEW | Detector + classifier + UART bridge + systemd + docs (A1, E1–E3, D3–D5, G1) |
| `docs/V02_PIVOT.md` | NEW | Commit the v0.2 doc verbatim (G3) |
| `docs/ROADMAP.md` | NEW | M0–M4 + decision benchmarks (H1, H2) |
| [`.github/workflows/ci.yml`](.github/workflows/ci.yml) | MAJOR | Trigger PiPod build (F1) |

---

## Verification (how we'd know it's actually done)

After working through these issues, the following must hold:

1. **`arduino-cli compile` succeeds** for the modified `SensorNode/MasterNode/SoldierNode` sketches in both `COMPANION_MODE=ON` (v0.2) and `COMPANION_MODE=OFF` (legacy AD8318) builds — invoke the `firmware-builder` agent.
2. **`scripts/check_protocol.py` passes** with the new BandId rename + protocol version bump — invoke `lora-protocol-reviewer` agent.
3. **`scripts/check_eu_duty_cycle.py` passes** with a synthetic log containing both sub-band g uplinks and sub-band P downlinks — invoke `eu-duty-cycle-auditor` agent on a known-good fixture.
4. **`pytest PiPod/classifier/`** passes against fixture I/Q captures, with one positive case per signature class. Invoke `sdr-pipeline-validator` (new agent).
5. **`make -C PiPod/detector`** builds clean on `ubuntu-24.04-arm` and on a Pi 5 (DragonOS Pi64).
6. **End-to-end smoke** (manual, doc Milestone 0 exit): a single Pi-pod + ESP32-C6 companion sends 100 DetectPackets that the master decrypts indistinguishably from native v0.1 pods.
7. **Doc consistency:** `grep -ri "rtl-sdr v4\|R828D" .` returns zero hits (D2); `grep -ri "BAND_433_915_MHZ" .` returns zero hits (B2); `grep -ri "Bancroft" ARCHITECTURE.md` returns the rewritten "v0.3 research" paragraph only (C1).

---

## Out-of-scope reminders (do NOT start under v0.2)

Per doc "Out-of-scope for v0.2":

- Sample-accurate TDOA via reference-TX cross-correlation (DC9ST method)
- DJI DroneID full protocol decoding (needs AntSDR or USRP — out of BOM)
- Networked multi-site KrakenSDR via Kraken Pro Cloud
- bladeRF integration (Pi 5 RP1 USB3 driver drops samples above 20–36 MS/s)
- RTL-SDR Blog V4L (R828S) refresh — only after it ships

If any of these come up during v0.2 implementation, file as v0.3 backlog rather than starting them.
