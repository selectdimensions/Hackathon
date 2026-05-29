<!--
Provenance: committed verbatim as the authoritative v0.2 architecture/procurement
report (gap G3 in ../V02_GAP_ANALYSIS.md). Treat this as the source of truth for the
v0.2 Pi 5 + SDR pivot rationale: SDR selection, RTL-SDR V4 EOL date, KrakenSDR
pricing, Pi-5/bladeRF benchmarks, EU duty-cycle math, and the staged milestone plan.
-->

# RF-Threat Detection Mesh v0.2 — Raspberry Pi 5 + SDR Pivot: Architecture & Procurement Report

## TL;DR
- **Keep the ESP32-C6 in the loop.** The cleanest v0.2 is **Option B**: each Pi 5 pod runs the SDR + classifier and hands DetectPackets over UART to an ESP32-C6 companion that owns the SX1262 and runs the existing RadioLib/AES-128-CCM code unmodified. Wire format stays bit-identical, the crypto TCB stays tiny, and you avoid a 3–4 month rewrite. Master node stays ESP32-C6; soldier nodes stay ESP32-C6.
- **One SDR per band, mostly RTL-SDR Blog V3, with one HackRF One per 2.4 GHz and 5.8 GHz pod.** **The RTL-SDR Blog V4 was officially declared End-Of-Line on 14 May 2026** ("Unfortunately, this stockpile has now been exhausted, and as far as we are aware, no other usable stockpiles exist, so no more Blog V4 productions will be possible," rtl‑sdr.com/rtl‑sdr‑blog‑v4‑end‑of‑line/). Build around the still-in-production **RTL-SDR Blog V3 (R820T2)** for v0.2; track the announced **V4L (R828S)** for a later refresh. HackRF One (~€330) handles 2.4 GHz and 5.8 GHz. Skip bladeRF: the Pi 5's RP1 USB-3 controller demonstrably drops samples above ~20–36 MS/s, so you can't run it at rated rate anyway.
- **For real direction-finding, buy one KrakenSDR ($749) for the master site rather than trying to TDOA five independent RTL-SDR pods.** Software TDOA on host-timestamped RTL-SDR/HackRF/bladeRF on Pi 5 will yield ~300 m–1 km position error at best (USB-burst jitter dominates). KrakenSDR gives sub-degree bearings out of the box; combine it with the Pi pods for **cued direction-finding**. Treat true sample-accurate TDOA as a v0.3 research item, not v0.2.

---

## Key Findings

1. **The cheap-SDR side has shifted under your feet.** RTL-SDR Blog V4 (R828D tuner) was end-of-lined on 14 May 2026; the V3 (R820T2) is the production part you should standardise on now. Plan the BOM around V3 + a V4L (R828S) refresh path.
2. **Pi 5 + bladeRF at 61.44 MS/s is documented to fail.** Empirical Pi 5 vs Pi 4 testing (kernel 6.6.31, libbladeRF 2.5.0) shows ongoing sample loss above ~20–36 MS/s — and the Pi 4 is actually better than the Pi 5 because the Pi 5's RP1 XHCI driver appears to starve URBs more aggressively. HackRF One at 20 MS/s is the realistic 2.4/5.8 GHz workhorse on Pi 5.
3. **PPS-to-system-clock alignment on Pi 5 is sub-µs, but PPS-to-sample alignment on cheap SDRs is not.** None of RTL-SDR, HackRF, or stock bladeRF expose a hardware sample counter tagged to PPS. Only USRPs do. Software-only TDOA on the Pi pods is multi-km error. Reference-transmitter cross-correlation (Scholl/DC9ST method) is the realistic v0.3 path; KrakenSDR DoA is the practical v0.2 path.
4. **Keep the existing wire format, keep ESP32-C6 alongside the Pi.** The pivot to Pi 5 is for SDR capability, not for replacing a working crypto/mesh layer. Option B (Pi 5 + ESP32-C6 companion) preserves your one-codebase mesh and isolates keys in a ~30 KB bare-metal TCB.
5. **EU 868 MHz duty cycle is the architectural ceiling.** ETSI EN 300 220-2 sub-band M (868.0–868.6 MHz) caps each device at 1% duty cycle. With 39 B DetectPackets at SF7BW125 (~155 ms airtime), that's ~232 detections/hour/device theoretical max. Use sub-band P (869.4–869.65 MHz, 10% DC, +27 dBm) for master downlink to get 10× headroom.
6. **Cost multiplier vs current ESP32-C6 + AD8318 pod is ~5–8×** (€440 for a VHF/L-band RTL-SDR pod, €720 for a 5.8 GHz HackRF pod, vs ~€90 for the current AD8318 pod). That money buys actual signal classification — not just energy threshold — and software-only signature updates.

---

## Details

### 1. SDR Selection — Per-Pod Recommendation

#### What you actually need to know in mid-2026
- **RTL-SDR Blog V4 — discontinued.** Per rtl-sdr.com's 14 May 2026 EOL notice: *"the last R828D chips that we could possibly obtain were all faulty in some way."* No V4 inventory remains at the manufacturer; resellers will burn through stock through ~mid-2026.
- **RTL-SDR Blog V3 (R820T2) — still in production.** Range **500 kHz–1.766 GHz** (HF via direct sampling), 8-bit, **2.4 MS/s stable / 3.2 MS/s max**, 1 PPM TCXO, bias-tee, ~€30. **This is your default RTL-SDR for v0.2.**
- **HackRF One**: 1 MHz–6 GHz, 8-bit, 20 MS/s, half-duplex, ~€330 genuine. Clones at ~€150 exist but have worse oscillator stability and unverified ESD.
- **bladeRF 2.0 micro xA4**: $480 (~€460); 47 MHz–6 GHz, 12-bit, up to 61.44 MS/s on paper, 2×2 MIMO. Cannot reach rated rate on Pi 5 (see §3).
- **Adalm-Pluto**: ~€220; 325 MHz–3.8 GHz stock, 12-bit. The AD9363→AD9364 hack to 70 MHz–6 GHz is unsupported and a poor base for production.
- **LimeSDR Mini 2.0**: $399 (~€380); 10 MHz–3.5 GHz, 12-bit, 40 MHz BW. Cannot reach 5.8 GHz — disqualifies it for Pod A.
- **USRP B200mini**: ~€900+; 70 MHz–6 GHz, 12-bit, hardware-timestamped. The only one with real sample-accurate timestamps.
- **KrakenSDR**: **$749 list at krakenrf.com (May 2026)**; 5× coherent R820T2 RTL-SDRs in one enclosure, 24 MHz–1.766 GHz, 2.56 MS/s/ch, purpose-built for DoA.

#### Pod assignment (final)

| Pod | Band | Recommended SDR | Approx EUR | Why |
|---|---|---|---|---|
| **A** | 5.8 GHz FPV video | **HackRF One** | ~€330 | Only sub-€400 option that reaches 5.8 GHz. 20 MS/s & 8-bit are fine for analog-FM envelope and OcuSync burst presence. SigDigger/GR-DroneID workflows are proven on HackRF. |
| **B** | 2.4 GHz FPV control / OcuSync / ELRS 2.4 / Wi-Fi | **HackRF One** | ~€330 | Same chassis pattern as A; only antenna/LNA differ. |
| **C** | GNSS L1 jam (1575.42 MHz) | **RTL-SDR Blog V3** + active L1 patch | €30 + €45 | Textbook RTL-SDR use case (JRC/Ljubljana toll-station paper, Lehmann 2020). |
| **D** | 868 MHz EU ISM (ELRS-EU, LoRa, generic SRD) | **RTL-SDR Blog V3** + 868 MHz band-pass filter | €30 + €25 | Re-framed from the original 915 MHz plan. **Self-jam from your own SX1262 TX is the hard problem** — mitigations in §7. |
| **E** | Tactical VHF 30–88 MHz | **RTL-SDR Blog V3** | €30 | 30–88 MHz is above the 24 MHz floor — no direct-sampling mod required. |
| **Master** | DoA / triangulation | **KrakenSDR (1 unit, master site only)** | ~$749 / €720 | See §4/§10. |

All six pods are receive-only. The HackRF *can* transmit; disable it in firmware (use `hackrf_transfer -r` only, no `-t` path) and document this in the BOM.

**Decisions explicitly rejected:**
- **bladeRF for 2.4/5.8 GHz** — Pi 5 USB 3 (RP1) drops samples; you'd be paying €460–€690 for a radio you can't run at rated rate.
- **PlutoSDR for 5.8 GHz** — stock part doesn't reach there; the AD9364 hack is unsupported.
- **LimeSDR Mini 2.0** — 3.5 GHz ceiling kills Pod A; at $399 it's more expensive than the HackRF that *can* cover 5.8 GHz.
- **R820T (no "2") tuner discussions** — R820T is end-of-life since 2018; R820T2 (V3) and the now-discontinued R828D (V4) are the chips that matter. Don't buy any non-Blog clones using "R820T".

---

### 2. Pi 5 + SX1262 LoRa HAT Integration

#### Survey (HF / 868 MHz variants only)

| HAT | LoRa IC | Pi 5? | Notes |
|---|---|---|---|
| **Waveshare SX1262 LoRa HAT** (UART/AT version) | SX1262, may lack TCXO | Yes (electrical), **but** incompatible with raw SPI/RadioLib control | Meshtastic docs explicitly warn: *"The Waveshare SX1262 LoRaWAN Hat might struggle with sending long messages or relaying messages for others."* |
| **Waveshare SX1262 LoRaWAN/GNSS HAT** (Pi-5 SKU) | SX1262 + L76K GPS | Yes | Bonus: GNSS with PPS in one HAT |
| **MeshAdv-Pi v1.1** (chrismyers2000) | Ebyte E22-900M30S = SX1262 + 1 W PA + TCXO + GPS footprint | **Yes — best timing integration; V1.1 routes GPS PPS to GPIO 23** | TCXO present, +30 dBm option. Single-vendor (Etsy) supply risk |
| **RAK WisMesh Pi HAT RAK6421 + RAK13300 (SX1262)** | SX1262 | Yes Pi 4/5 | Best supply chain, ~€60–80 |
| **Seeed WM1302** | SX1302 concentrator | Yes (gateway), wrong tool for end-node mesh | The on-board SX1262 is for LBT only |
| **Adafruit RFM95W** | SX127x (NOT SX1262) | Yes electrically | **Wrong chip family** — does not interop on-air with the existing SX1262 mesh |

#### Pi 5 GPIO/SPI gotchas
- Pi 5 uses the **RP1 I/O chip** instead of BCM-built-in peripherals. `/dev/gpiochip0` → `/dev/gpiochip4` on Pi 5 (RadioLib's `PiHal.h` constructor exposes this as `gpioDevice=4`).
- Use **`lgpio`** (character-device API), not the deprecated `wiringPi`/`pigpio`.
- HW serial-port mapping for GPS differs: **`/dev/ttyAMA0` on Pi ≤4, `/dev/ttyS0` on Pi 5** (per Meshtastic linux-native HAT YAML).
- Pi 5 PPS support is via **GPIO only** — CM4/CM5 have a NIC PPS input, Pi 5 does not. Use `dtoverlay=pps-gpio,gpiopin=18`.

#### Recommended Pi-side LoRa stack
**Buy: RAK WisMesh Pi HAT RAK6421 + RAK13300 SX1262** (best supplier reliability) **or MeshAdv-Pi v1.1** (best timing integration if Etsy lead time is acceptable).

**Software: use RadioLib in C++** via its Non-Arduino Raspberry Pi HAL. This is exactly the library the existing ESP32-C6 firmware uses, so the wire-format code (DetectPacket serialization, AES-128-CCM glue, X25519+Ed25519 handshake) compiles unchanged under g++ on the Pi. The `aminrazaghi/RadioLib-rPi5-SX1262` repo + RadioLib Issue #1200 / Discussion #1187 document Pi 5 + Waveshare SX1262 HAT working with RadioLib once the BUSY pin is wired correctly and `gpioDevice=4` is set. Do **not** use `pyLoRa` / `LoRaRF` — they don't share encoder code and will silently disagree on packet headers/CRC/whitening choices.

If you firewall crypto into a smaller TCB (recommended Option B in §6), don't run RadioLib on the Pi at all — hand off to an ESP32-C6 companion.

---

### 3. Real-Time Detection Pipeline on Pi 5

#### Architecture (recommended layered detector)

```
┌────────────────┐   ring buffer    ┌─────────────────┐
│  SDR (rtl_sdr  │ → shared memory →│ Stage 1: Energy │
│  / hackrf_xfer)│   /dev/shm        │ detector (C,    │
│                │                   │ ~5% CPU/core)   │
└────────────────┘                   └────────┬────────┘
                                              │ threshold + dwell
                                              ▼
                              ┌──────────────────────────────┐
                              │ Stage 2: FFT + signature      │
                              │ classifier (Python+pyFFTW,    │
                              │ runs only on trigger)         │
                              └──────────┬───────────────────┘
                                         │ classified DetectPacket
                                         ▼
                              ┌──────────────────────────────┐
                              │ UART → ESP32-C6 companion →  │
                              │ AES-128-CCM + SX1262 TX      │
                              └──────────────────────────────┘
```

#### Pipeline choices, justified
- **GNU Radio Companion**: prototyping only. Heavy, adds Python/JIT overhead; not for the deployed pod.
- **Custom C with `librtlsdr` + FFTW + liquid-dsp**: deployed-pod stack. ~1 kSLoC, deterministic, fits in one core.
- **Python (NumPy + SciPy + pyFFTW + pyrtlsdr)**: fine for Stage 2 (≤ tens of Hz invocation). Don't put it in the always-on path.

#### CPU/RAM budget — concrete numbers
- **Pi 5 baseline power: 2.7 W idle, peaks at 7 W under stress without cooling** (Tom's Hardware: "it sits at around 50.5 degrees Celsius and consumes around 2.7 Watts" at idle; "Under stress, we hit 86.7°C (7 Watts) and saw the CPU throttle from 2.4 GHz down to 1.5 GHz"). CNX-Software measured up to 8.8 W under all-core `stress -c 4` and ~16.8 W with concurrent USB-disk + video — i.e., expect 7–9 W in your SDR-on-Pi-5 workload.
- **RTL-SDR @ 2.4 MS/s, 4096-pt FFT, Hann, magnitude squared, threshold compare:** comfortably ≤10% of one core on Pi 5.
- **HackRF @ 20 MS/s continuous FFT:** ~30–40% of one core; the layered detector cuts that ~10× because the classifier only runs on energy-threshold cross.
- **bladeRF @ 61.44 MS/s 2×2 MIMO:** Pi 5 cannot sustain this. Per the Raspberry Pi forum thread "Raspberry Pi 5 USB 3.0 read performance is worse than Raspberry Pi 4" (kernel 6.6.31+rpt-rpi-2712, libbladeRF 2.5.0): *"at 20 Msps both the Pi 4 and Pi 5 have a discontinuity … However, the Pi 4 operates without loss after that, whereas the Pi 5 continues to experience loss."* The same thread states an increase to 36 MS/s was needed to see *subsequent* loss after the initial glitch. **Plan ≤30 MS/s on bladeRF on Pi 5, ideally ≤20 MS/s.** This is the primary reason §1 demotes bladeRF.

#### Signature classifier targets
- **GNSS jamming**: noise-floor rise across 2 MHz centred on 1575.42 MHz; spectral-entropy threshold. JRC Ispra / U. Ljubljana toll-station paper (IEEE Sensors 2018) is the reference deployment.
- **Analog 5.8 GHz FPV**: wideband FM video has ~6–8 MHz envelope with characteristic 15.7 kHz (NTSC) / 15.625 kHz (PAL) sync-pulse modulation. HackRF + SigDigger demonstrated decoding in DragonOS.
- **OcuSync / DroneID presence**: ~10 MHz LTE-like OFDM burst, repetition ~500–600 ms. Stage 1 detects burst; for full decode you need an AntSDR E200 + alphafox02 firmware or USRP B200mini + RUB-SysSec/DroneSecurity stack (NDSS 2023).
- **ELRS / FHSS**: without binding phrase, detect the *pattern* — ≥20 hops/s with similar burst length spread over 868.0–868.6 MHz (EU) or 2.4 GHz.
- **LoRa chirp**: matched filter on synthesised up-chirp at SF7–SF12 / BW125 templates (gr-lora_sdr / gr-lora2 reference).

#### Layered-detection citation
The "energy detector always on + classifier on trigger" pattern is the standard cognitive-radio Stage-1/Stage-2 architecture. Reference: Yucek & Arslan, *"A survey of spectrum sensing algorithms for cognitive radio applications,"* IEEE Communications Surveys 2009; Mariani, Giorgetti, Chiani, *"Effects of noise power estimation on energy detection,"* IEEE Trans. Comm. 2011.

---

### 4. PPS / Time Sync for TDOA Across Pi 5 Pods

#### What's actually achievable

| Layer | Accuracy | Source |
|---|---|---|
| Pi 5 sys-clock disciplined by GPS PPS on GPIO 18 + chrony | **Sub-µs (avg ~16.7 ns offset, peak < 1 µs)** | austinsnerdythings.com, Feb 2025 |
| Pi 5 + SFP PTP grandmaster (Oscilloquartz OSA-5401) | **~26 ns** | austinsnerdythings.com, Apr 2026 |
| Pi-to-Pi PTP across LAN (Pi 5 has hw timestamping on built-in NIC PHC) | tens to ~100 ns | geerlingguy/time-pi |
| **RTL-SDR sample-stream timestamp on Pi 5** | **10s–100s of µs (USB-burst jitter dominates)** | direct Pi 5 forum testing |

#### The brutal truth about TDOA on cheap SDRs
None of RTL-SDR, HackRF One, or stock bladeRF 2.0 implements a hardware sample counter exposed to the host and tagged to PPS. Only the USRP family does — Daniel Estévez measured a USRP B205mini PPS-to-sample tag at a constant 8.41 µs ahead of GPS (*"Comparing the GPS timestamp and the UHD timestamp, we see that the UHD timestamp is 8.41 microseconds ahead,"* destevez.net/2022/03/timing-sdr-recordings-with-gps/).

Even with perfectly aligned Pi 5 clocks (~30 ns), the *moment of arrival of a given I/Q sample at userspace* is uncertain by ~20–30 ms of USB burst delay (verified in the Pi 5 vs Pi 4 bladeRF thread). 1 µs ≈ 300 m of position error; 20 ms ≈ 6000 km. Pure host-clock TDOA yields garbage.

Two known workarounds:
1. **Reference-transmitter cross-correlation (Stefan Scholl / DC9ST method, github.com/DC9ST/tdoa-evaluation-rtlsdr).** Each pod simultaneously captures a known strong reference (e.g. DAB+ multiplex at 217 MHz) AND the unknown signal, then cross-correlates the reference between pods to recover per-pod time offset. Demonstrated 10–50 m typical, sometimes "a few meters." **Workable v0.3 path on RTL-SDR.**
2. **PPS injection into the IF** (Lehmann & Suchánek, IEEE 2020, doi 10.1109/PSCC49060.2020.9092398): physically inject the GPS PPS into the SDR's RF/IF path so the receiver itself samples it. Reported worst-case 2.1 µs / ~630 m at 2.4 MS/s. Hardware mod, not v0.2.

For published RTL-SDR + GPS sync research see Wang et al., *"Research on TDOA Multiple Stations Time Synchronization Based on RTL-SDR,"* ACM 2022 (~400 ns / 120 m at 2.4 MS/s after correlation alignment).

#### GPS HAT recommendation
- **ATGM336H module** on MeshAdv-Pi v1.1 routes PPS to GPIO 23 — best integration.
- Otherwise: **u-blox NEO-M9N** breakout (multi-constellation, helps jamming resilience) or **MAX-M10S** (newer, lower power, current production part).
- Avoid NEO-6M clones (single-constellation, often no PPS).

#### Software stack
```
# /boot/firmware/config.txt
dtoverlay=pps-gpio,gpiopin=18      # or 23 for MeshAdv-Pi

# /etc/chrony/chrony.conf
refclock SHM 0 refid GPS precision 1e-1 noselect
refclock PPS /dev/pps0 refid PPS lock GPS prefer
```
Use **chrony**, not `ntpd`. chrony handles SHM-from-gpsd + PPS natively and locks faster.

#### KrakenSDR vs five independent Pi pods — recommendation

**Buy one KrakenSDR for the master site for v0.2 direction-finding. Keep the Pi-pod approach for detection cueing and band coverage, not for TDOA.**

| Approach | Pros | Cons |
|---|---|---|
| 5× Pi 5 + RTL-SDR pods doing TDOA | Geographic spread, multi-band | Real TDOA needs ref-TX cross-correlation; host-only is km error |
| 1× KrakenSDR at master | True phase-coherent DoA, sub-degree bearing, off-the-shelf SW, runs on Pi 4/5 | Single site = no triangulation alone; capped at 1.766 GHz; needs antenna array (~30 cm baseline) |
| **Hybrid (recommended)** | Pi pods detect wideband multi-band; KrakenSDR does DoA when cued; multi-site KrakenSDRs cross-bear | Extra ~€720 |

**Important clarification: KrakenSDR is DoA, not TDOA.** Multi-site KrakenSDRs in Kraken Pro Cloud produce crossed bearings, not hyperbolas. This is actually more robust over short baselines (urban Frankfurt) because phase coherence is locally enforced, not network-synchronised.

---

### 5. Mesh Networking Between Pi-Based Pods and the Master

**Keep the existing wire format — don't switch to Meshtastic or Reticulum.** The existing project has DetectPacket (39 B) and AlertPacket (21 B) under AES-128-CCM with X25519+Ed25519 rekey on 868.1/868.3 MHz. Replacing it with Meshtastic means losing your authenticated rekey ceremony, accepting Meshtastic's PSK-based crypto (weaker for this threat model), and bloating on-air packets to ~60–80 B with protobuf framing.

#### Capacity math under ETSI EN 300 220-2 V3.2.1
The standard defines (per its sub-band table):
- **868.0–868.6 MHz, 1% DC** (sub-band M — your project's main channels)
- **869.4–869.65 MHz, 10% DC** (sub-band P, also allows +27 dBm ERP)
- **869.7–870.0 MHz, 1% DC** (also called sub-band P in some readings of the spec)

At 1% over 1 hour = 36 s/h TX per device. DetectPacket 39 B at SF7BW125 ≈ 155 ms → theoretical **~232 detections/h/device**; AlertPacket 21 B at SF7BW125 ≈ 41 ms → theoretical **~878 alerts/h/master**.

**Realistic safe budget**: ~30 detections/pod/minute peak, ~1/pod/sec sustained. Beyond that, aggregate multiple detections per packet, or **move the master downlink to band P (869.4–869.65 MHz, 10% DC, +27 dBm)** for 10× headroom — worth doing.

#### Should detection→master move to Wi-Fi?
**No, not in v0.2.** Frankfurt deployment is outdoor / mobile; Wi-Fi mesh (802.11s, BATMAN-adv) needs LoS or dense AP coverage. Existing crypto/wire-format is on LoRa — rebuilding for Wi-Fi doubles the codebase. LoRa at SF7BW125 in EU 868 already gives ~3–7 km practical range.

**v0.3 option**: add Wi-Fi as a high-bandwidth IQ-recording side-channel between close-by pods, used only for offline DF evidence transfer. Keep LoRa as always-on control/alert plane.

---

### 6. Pi 5 ↔ ESP32 Architectural Decision

**Recommendation: Option B — Pi 5 + ESP32-C6 companion per pod.**

| Option | Pi 5 power | ESP32 power | TCB size | Codebase | Verdict |
|---|---|---|---|---|---|
| **A — Pi 5 does everything** | 2.7–8.8 W | 0 | Huge (full Linux) | Rewrite RadioLib/AES in Python or port PiHal C++ | ❌ |
| **B — Pi 5 + ESP32-C6 (recommended)** | 2.7–8.8 W | 0.5 W | Small (bare-metal ESP32-C6) | RadioLib code unchanged; Pi sends DetectPacket payload over UART | ✅ |
| **C — All Pi 5 (incl. master)** | 2.7–8.8 W × (N+1) | 0 | Huge × (N+1) | Full rewrite | ❌ |

**Why B wins:**
1. Crypto TCB stays ~30 KB on a chip with no MMU, no shell, no Python. A compromised Pi pod cannot exfiltrate keys — they never leave the ESP32-C6.
2. Wire format guaranteed identical: no protocol drift, no "Pi-pod packets fail CCM on the master once a day" bugs.
3. You already maintain the ESP32-C6 firmware for master + soldier. Companion is the *same* codebase, different message source (UART instead of AD8318 ADC). Net new code: ~200 lines of UART glue.
4. ESP32-C6 idle 0.5 W is negligible next to Pi 5's 2.7–8.8 W.

**Master node**: keep as ESP32-C6 — TDOA / triangulation solve is light (4×4 least-squares per detection, µs on a Cortex-M). If you co-locate the KrakenSDR at the master, its Pi 5 host becomes the de facto DF compute and you keep an ESP32-C6 alongside for the LoRa link.

**Soldier (audio playback) nodes**: stay ESP32-C6, no change.

---

### 7. Power, Enclosure, Field Deployment

#### Per-pod power budget (Pod E baseline)

| Component | Idle | Active |
|---|---|---|
| Pi 5 (active cooler, headless) | 2.7 W | 5–7 W (one core busy) |
| RTL-SDR Blog V3 | 1.0 W | 1.2 W |
| LoRa HAT (RAK13300 SX1262, RX) | 0.05 W | 0.5 W TX bursts |
| GPS HAT (u-blox M10S + active patch) | 0.1 W | 0.15 W |
| ESP32-C6 companion | 0.3 W | 0.5 W TX bursts |
| **Total** | **~4.2 W** | **~7–9 W** |

**Battery life on 20,000 mAh USB-PD pack** (= 72 Wh @ 5 V, ~58 Wh usable after PD-to-5V conversion):
- Pod E (RTL-SDR): 58 Wh / 5.5 W ≈ **~10.5 h**
- Pods A/B (HackRF, USB 3): 58 Wh / 8 W ≈ **~7 h**
- Pods C/D (RTL-SDR + active GPS/LoRa): ~10 h

For >24 h field deployment: pair 20 Ah pack with 30 W solar (~€60), or step up to a 50 Ah LiFePO4 12 V battery + 5 V buck (~€120).

#### Thermal
Pi 5 needs **active cooling** under any sustained SDR load. Tom's Hardware: "Under stress, we hit 86.7°C (7 Watts) and saw the CPU throttle from 2.4 GHz down to 1.5 GHz" without cooling. With the official Active Cooler under load they measured 59.3 °C / 6.8 W. Use the **official Active Cooler (€5)** inside a vented IP54 enclosure, or step up to a passive aluminium enclosure that uses the lid as a heatsink (Argon-ONE-V3 style). For IP65/67 outdoor: vent + Gore-Tex membrane is mandatory to avoid condensation cycles.

#### Antenna isolation (the Pod D problem)
Your SX1262 transmits at 868.1/868.3 MHz at up to +22 dBm (158 mW). An RTL-SDR Blog V3 monitoring 863–870 MHz on the same pod 10 cm away will see +/−40 dBm of self-noise during every TX — front-end desense for hundreds of ms.

Mitigations (apply all three):
1. Physical separation ≥ 2 m between LoRa and RX antennas.
2. **Software TDM**: pause RTL-SDR capture (or gate the classifier) when the ESP32-C6 asserts a "TX active" GPIO.
3. Add an 868 MHz band-stop notch in the RX chain (cheap SAW filters, ~€10) — but this hurts when you actually *want* to monitor 868.

Better still: don't monitor 868 with Pod D. Re-purpose Pod D to watch the LoRaWAN downlink sub-band P (869.4–869.65 MHz) where your own TX is minimal, or 433 MHz EU SRD.

---

### 8. Bill of Materials per Pod Variant (2026 EU retail, EUR incl. 19% VAT)

| Item | Pod A (5.8 GHz) | Pod B (2.4 GHz) | Pod C (L1) | Pod D (868) | Pod E (VHF) |
|---|---|---|---|---|---|
| Raspberry Pi 5 8 GB | 90 | 90 | 90 | 90 | 90 |
| Active Cooler | 5 | 5 | 5 | 5 | 5 |
| 32 GB high-endurance microSD | 12 | 12 | 12 | 12 | 12 |
| **SDR** | HackRF One **330** | HackRF One **330** | RTL-SDR Blog V3 **30** | RTL-SDR Blog V3 **30** | RTL-SDR Blog V3 **30** |
| Band antenna | 5.8 GHz patch/cloverleaf **25** | 2.4 GHz dipole **15** | active L1 patch **45** | 868 MHz omni + cavity BPF **35** | VHF dipole / log-periodic **30** |
| LNA (optional) | 5.8 GHz LNA, 0.5 dB NF **45** | 2.4 GHz LNA **30** | included in patch | (skip) | (skip) |
| LoRa HAT (RAK6421 + RAK13300) | 65 | 65 | 65 | 65 | 65 |
| ESP32-C6 companion + wiring | 12 | 12 | 12 | 12 | 12 |
| GPS HAT or breakout (u-blox M10S) | 35 | 35 | 35 | 35 | 35 |
| IP54 enclosure + cable glands | 35 | 35 | 35 | 35 | 35 |
| 20,000 mAh USB-PD power bank | 45 | 45 | 45 | 45 | 45 |
| Misc (SMA pigtails, screws, thermal pad) | 20 | 20 | 20 | 20 | 20 |
| **Total per pod** | **~€720** | **~€695** | **~€440** | **~€430** | **~€425** |

**Five-pod kit (one of each):** ≈ **€2,710**.
**Add KrakenSDR ($749 ≈ €720 ex-VAT, ~€860 incl. EU VAT/duty) + Krakentenna set (~€180) + Pi 5 host for master DoA (~€110):** ≈ **+€1,150**.
**Grand total v0.2 field kit:** ≈ **€3,860**.

**Compared to the current ESP32-C6 + AD8318 pod (~€80–100):** the multiplier is **~5×** for an RTL-SDR pod and **~7–8×** for a HackRF pod. That cost buys actual signal classification — not just energy threshold — and the ability to add new signature types in software without touching the field hardware.

---

### 9. Threat-Model and Detection-Quality Reality Check

- **8-bit (RTL-SDR/HackRF) vs 12-bit (bladeRF/Pluto/LimeSDR)**: For energy detection of drones/jammers in the field, 8-bit is plenty. 12-bit matters for (a) weak-signal demodulation (OcuSync at long range), (b) coherent passive radar, (c) wide-dynamic-range scenes where a strong nearby Wi-Fi AP would saturate 8-bit ADC and mask a weak drone burst. For your mission (presence detection + classification + cued DoA), **8-bit is the right cost/quality tradeoff for v0.2.**
- **RTL-SDR cannot detect 5.8 GHz analog FPV directly** — tuner stops at 1.766 GHz. Use HackRF/bladeRF (recommended), or a downconverter LNB (5.8 GHz block down to ~1 GHz — hobbyist-grade, flaky).
- **GNSS L1 jamming detection with RTL-SDR + L1 patch is a published, working pattern.** Citations: JRC Ispra + U. Ljubljana toll-station deployment (IEEE Sensors 2018, "GNSS Jammer Detection, Classification and Spectrum Analysis"); U. Ljubljana chirp-jammer evaluation (Sensors 2020); GPSBuster (Hunan/Boise/UTA, side-channel-leakage detection of dormant trackers via HackRF). Use 2 MHz BW centred at 1575.42 MHz; watch noise-floor rise and spectral entropy.
- **FPV drone detection at protocol level vs energy:**
  - **Analog 5.8 GHz FM video**: easy envelope detection. HackRF + SigDigger demonstrated decoding of 5.7 GHz NTSC video on rtl-sdr.com.
  - **DJI OcuSync / DroneID**: open-source decoders exist — RUB-SysSec/DroneSecurity (NDSS 2023, USRP B200mini-based), proto17/dji_droneid, alphafox02/antsdr_dji_droneid (AntSDR E200 firmware). On Pi 5 + HackRF you can do *presence detection* of OcuSync bursts; full decode + operator-locating requires AntSDR or USRP, out of v0.2 scope.
  - **OcuSync O4 / DJI O4**: position telemetry needs commercial DragonScope firmware on AntSDR. Presence-only on stock HW.

---

### 10. Open-Source Projects to Reference / Build On

| Project | Use |
|---|---|
| **KrakenSDR + DSP** (krakenrf.com, github.com/krakenrf) | Master-site DoA receiver; Pi 4/5 host; open-source DAQ + DSP |
| **DC9ST tdoa-evaluation-rtlsdr** | Reference-TX cross-correlation pattern for v0.3 multi-pod TDOA |
| **DragonOS Pi64** (Beta42, Oct 2025) | Pre-baked SDR distro for Pi 5 — RTL-SDR/HackRF/bladeRF drivers, SDR++, SDRAngel, GNU Radio, SatDump, gr-iio, Meshtastic. Use as the base image for Pi pods. |
| **Meshtastic linux-native (meshtasticd)** | Reference for Pi 5 ↔ SX1262 wiring & config.yaml; we are *not* running Meshtastic, but use its documented Pi-5 defaults |
| **jgromes/RadioLib + PiHal** | The library to use if you choose to drive SX1262 directly from the Pi (gpioDevice=4 for Pi 5) |
| **DroneSecurity / antsdr_dji_droneid / proto17/dji_droneid** | DroneID/OcuSync detection signatures |
| **rtl-433** (already in DragonOS) | Ready-made decoders for ~200 ISM-band devices — good for verifying RF chain in the field |
| **Maia SDR** (maia-sdr.org) | FPGA-SDR pattern reference for a future v0.4 pod with on-board FPGA preprocessing (not v0.2) |
| **gr-lora_sdr / gr-lora2** | LoRa-chirp matched-filter reference for the classifier |

---

## Recommendations

### Final recommendation in one paragraph
For v0.2, build **five Pi 5 + ESP32-C6 companion pods** — Pod A and B use **HackRF One** (5.8 GHz and 2.4 GHz), Pods C, D, E use **RTL-SDR Blog V3** (since V4 is now EOL). Pi 5 runs the SDR + layered detector (C energy detector + Python pyFFTW classifier), forwards classified DetectPackets over UART to an ESP32-C6 running the existing RadioLib/AES-128-CCM code unchanged. **Keep the existing ESP32-C6 master and soldier nodes; do not replace them.** Add one **KrakenSDR ($749) at the master site** for true direction-finding, treating it as the DoA cuing target rather than trying to TDOA five independent pods. Use **u-blox MAX-M10S GPS** + chrony with PPS on GPIO 18 for sub-µs system-clock alignment on each pod. Standardise on **RAK WisMesh Pi HAT + RAK13300 SX1262** for the Pi-side LoRa (best supplier reliability) or MeshAdv-Pi v1.1 if you want PPS on the same HAT.

### Staged plan with concrete benchmarks

**Milestone 0 (wk 0–1): single-pod bring-up**
- Pi 5 8 GB + DragonOS Pi64 Beta42; ESP32-C6 companion over UART running existing firmware
- RAK6421 + RAK13300 SX1262 HAT
- *Exit:* ESP32-C6 master receives, decrypts, ACKs 100 DetectPackets from Pi pod indistinguishably from native ESP32-C6 pods

**Milestone 1 (wk 2–3): SDR + detector**
- RTL-SDR Blog V3 on Pod E (VHF); C energy detector with FFTW; Python classifier on trigger
- *Exit:* 24 h sustained ≤ 1% missed-buffer rate, ≤ 50 false alerts/24 h against ground-truth VHF capture

**Milestone 2 (wk 4–5): GPS + multi-pod time sync**
- u-blox M10S + PPS on GPIO 18 on two pods; chrony to < 1 µs offset
- Add timestamp TLV extension to DetectPacket (base packet unchanged)
- *Exit:* master can correlate two pods' DetectPackets for the same event with < 10 µs uncertainty

**Milestone 3 (wk 6–8): high-band pods + KrakenSDR**
- Add Pod A (HackRF 5.8 GHz) and Pod B (HackRF 2.4 GHz)
- Stand up KrakenSDR at master site with Krakentenna set
- Build cue path: Pi pod alert → master ESP32-C6 → master Pi 5 hosting KrakenSDR → DoA in < 2 s
- *Exit:* end-to-end cue → bearing in < 2 s; bearing accuracy < 5° vs known 868 MHz / 433 MHz reference

**Milestone 4 (wk 9–10): hardening**
- IP54 enclosures, solar/battery, 3-pod + master Frankfurt rooftop test
- *Exit:* 48 h unattended uptime, no missed alerts, no duty-cycle violations logged

### Benchmarks that would change the plan
| Threshold | Action |
|---|---|
| Pi 5 bladeRF sample loss < 1% at 60 MS/s (new firmware/kernel) | Re-add bladeRF for Pod A/B; gives 12-bit + wider BW |
| RTL-SDR V4L (R828S) ships with comparable performance | Migrate Pods C/D/E to V4L for better triplexed filtering |
| In-field KrakenSDR DoA accuracy < 5° proven at master site | Add 2nd KrakenSDR at second site → cross-bearing localisation |
| Reference-TX cross-correlation (DC9ST) delivers < 50 m TDOA in Frankfurt | Promote multi-pod TDOA from v0.3 research to v0.4 product |
| Sustained per-pod detection rate > 200/hour | Move alert path to sub-band P (869.4–869.65 MHz, 10% DC) |

### Out-of-scope for v0.2 (defer to v0.3+)
- Sample-accurate TDOA with reference-TX cross-correlation
- DJI DroneID full protocol decoding (needs AntSDR or USRP)
- Networked multi-site KrakenSDR via Kraken Pro Cloud
- bladeRF (revisit when Pi 5 USB 3 driver stabilises, or migrate to CM5 PCIe carrier or x86 N100 host)
- Replacement of the V4 with V4L once it ships

---

## Caveats

1. **RTL-SDR Blog V4 is officially end-of-life as of 14 May 2026** — the company stated *"the last R828D chips that we could possibly obtain were all faulty in some way."* If you had planned around the V4, switch to V3 immediately and track the announced V4L (R828S tuner) for a refresh.
2. **Pi 5 + bladeRF at full rate is not viable today.** Empirical Raspberry Pi forum testing (kernel 6.6.31+rpt-rpi-2712, libbladeRF 2.5.0) shows ongoing sample loss above ~20–36 MS/s, with the Pi 4 *better* than the Pi 5 post-glitch. If you must have 12-bit / 60 MHz BW, use a small Intel N100 mini-PC (~€180) as that pod's host instead of a Pi 5, or wait for a CM5 PCIe carrier.
3. **Pi 5 GPIO PPS has documented periodic jitter.** scottstuff.net (May 2025) showed periodic 2 h jitter cycles on Pi 5 GPIO PPS vs the CM5's NIC PPS input. Sub-µs accuracy is achievable but long-term stability is worse than CM5. If timing budget tightens, plan to migrate master compute to a CM5 carrier.
4. **EU 868 MHz duty cycle is per-device, not per-channel.** Six pods all near 868.1 MHz each at 1% means *per-device* compliance, but the *channel* airtime is 6%. Plan frequency-diversity (868.1, 868.3, 868.5 sub-channels) and listen-before-talk — SX1262 supports CAD natively.
5. **KrakenSDR is direction-of-arrival, not TDOA.** Don't promise TDOA from it; it does correlative interferometry. Multi-site Krakens cross-bear, not hyperbolate.
6. **OcuSync / DroneID decoding requires AntSDR or USRP, not HackRF.** HackRF gives you presence detection only.
7. **Self-jam from co-located SX1262 LoRa TX is a real Pod D problem.** Don't underestimate; design in TDM gating and ≥2 m antenna separation from day one.
8. **Pi 5 thermal**: Tom's Hardware measured CPU throttle from 2.4 GHz → 1.5 GHz at 86.7 °C without active cooling under stress. Active cooling is non-negotiable for any sustained-SDR pod, especially HackRF/USB-3 chassis.
9. **Cost multiplier vs current ESP32-C6 + AD8318 pod is 5–8×.** The Pi-5-SDR pivot is justified only if you actually need classification rather than energy threshold, and only if the v0.2 plan delivers the cued-DoA + multi-band coverage that the AD8318 pod cannot.
