# Pod BOM Matrix — fixed bus + variable sensor (v0.3-hardware)

Every pod ("ball") shares a **fixed bus**; the **detection sensor is the variable**.
Total pod cost = fixed-bus cost + chosen sensor cost (+ enclosure/battery, shared).
Parts, currents, and localization roles are sourced from
[../pod-sensor-reference.md](../pod-sensor-reference.md); see it for alternatives.
Prices are planning estimates (EUR, low-volume retail) and fall sharply at scale (§4).

Localization role legend: **T** TDOA · **B** bearing/AoA · **R** self-range ·
**D** detect-only · **P** pod self-position.

---

## 1. Fixed bus (every pod)

| Block | Part | Active | Sleep | Unit € (qty 1) | Notes |
|---|---|---|---|---|---|
| MCU | ESP32-S3 (acoustic/DSP) or ESP32-C6 (802.15.4) | 80–240 mA | 10–150 µA | 4 | S3 for I²S/DSP pods; C6 where Thread/Zigbee needed |
| Primary LoRa | SX1262 module (RAK4270 / E22-900M) | TX ~118 mA / RX ~5 mA | ~2 µA | 8 | Sub-GHz 433/868, +22 dBm |
| Redundant radio | SX1278 (433, band-family) **or** SX1280/1281 (2.4 GHz, freq-diversity + ranging) | TX 24–120 mA | ~1 µA | 6 | Pick per role; see [RadioLink.h](../shared/RadioLink.h) |
| GNSS + PPS | u-blox NEO-M9N (→ ZED-F9P for RTK) | 25–120 mA | — | 18 | Position + elevation + **PPS for sync** |
| Inertial / wake | ADXL355 (low-noise) or ICM-42688 | 0.2–0.6 mA | ~µA | 6 | Wake-on-motion → GNSS re-fix (P) |
| Power | Li-ion pack + regulator (+ optional solar) | — | — | 14 | Sized per §3 of pod-sensor-reference |
| Enclosure | "ball" shell + gasket + gland (see [MANUFACTURING.md](MANUFACTURING.md)) | — | — | 9 | FDM proto now; injection-mold at scale |
| Misc | antenna(s), pigtails, PCB, fasteners | — | — | 15 | |
| **Fixed-bus subtotal** | | **~4.5 W peak** | **~tens of µA** | **~€80** | before the variable sensor |

> **Deploy/move logic:** GNSS fix on deploy is stored; the IMU sits in wake-on-motion,
> and any movement past threshold forces a fresh GNSS fix that is reported to the master
> so the triangulation geometry stays correct.

---

## 2. Variable sensor (pick one per pod)

| Sensor class | Representative part | Interface | Active | Role | +€ | Pod total ≈ |
|---|---|---|---|---|---|---|
| **Acoustic (flagship)** | ICS-43434 I²S MEMS (×1, or ×3-4 array for per-pod bearing) | I²S | ~1 mA (×N) | **T / B** | 2 (×N) | **~€85** |
| **Ultrasonic ToF** | Chirp CH201 (MEMS sonar) | I²C | ~10 µA avg | **R** | 9 | ~€90 |
| **RF detect (cheap)** | CC1101 / Si4463 sub-GHz xcvr | SPI | 10–16 mA RX | **D** | 4 | ~€85 |
| **RF wideband (super-pod)** | RTL-SDR Blog V3 (RX) | USB (needs Linux host) | ~270 mA | **D / B** | 30 | ~€110 + host |
| **mmWave radar** | Acconeer A121 (µW) or TI IWR6843 (rich) | SPI / SPI+UART | 75 mW / ~2 W | **R / B** | 12 / 35 | ~€95 / ~€120 |
| **EO / imagery** | OV5640 (vis) or FLIR Lepton 3.5 (thermal) | DVP/MIPI / SPI | 140 mA / 150 mW | **B** | 12 / 180 | ~€95 / ~€265 |
| **Magnetometer (vehicle)** | RM3100 | SPI/I²C | ~1 mA | **D / B** | 7 | ~€90 |
| **Decoy** | battery + resistor network (RF impedance mimic), no MCU/sensor | — | — | — | — | **~€5–10** |

> Notes: acoustic is the cheapest path to a *precise* fix (TDOA) — see C1 reconciliation
> in [../TACTICAL_SENSOR_NETWORK_SPEC.md](../TACTICAL_SENSOR_NETWORK_SPEC.md) §2. Wideband-RF
> "super-pods" need a Linux host (Pi 5) — see [../docs/V02_PIVOT.md](../docs/V02_PIVOT.md)
> and the [../PiPod/](../PiPod/) pipeline; they are a minority of the fleet.

---

## 3. Representative pod variants

| Variant | Sensor | Pod € (qty 1) | Peak power | Primary localization |
|---|---|---|---|---|
| Acoustic gunshot/UAV | ICS-43434 ×4 array | ~€90 | ~5 W | TDOA + per-pod bearing |
| Cheap RF tripwire | CC1101 | ~€85 | ~4.6 W | detect → cue other pods |
| mmWave mover | Acconeer A121 | ~€95 | ~4.6 W | self-range + velocity |
| Thermal watch | FLIR Lepton 3.5 | ~€265 | ~4.7 W | bearing (confirm) |
| Wideband RF super-pod | RTL-SDR V3 + Pi 5 host | ~€110 + ~€220 host | ~9 W | detect + DoA (cued) |
| Decoy | none | ~€5–10 | ~µW | — (attrition / deception) |

A 10 km × 10 km deployment per the tactical spec (~46 real pods + ~50 decoys) is dominated
by acoustic + cheap-RF pods, with a handful of mmWave / super-pods and a decoy scatter.

---

## 4. Cost at scale (order-of-magnitude)

Low-volume retail (qty 1) is the worst case. Expect roughly:

| Quantity | Fixed-bus €/pod | Driver |
|---|---|---|
| 1 (proto) | ~€80 | retail parts, FDM enclosure |
| 100 | ~€55 | reel parts, small PCBA run, FDM/SLA shells |
| 1,000 | ~€38 | volume PCBA, soft-tool / cast enclosure |
| 1,000,000 / month | **~€18–25** | injection-molded shell, turnkey PCBA, bonded GNSS/IMU |

The enclosure + PCBA cost collapse at the 1M/month tier depends entirely on tooling and
contract-manufacturing decisions — see [MANUFACTURING.md](MANUFACTURING.md). Decoys stay
~€5 at any scale and are the cheapest way to raise the adversary's cost to defeat the net.

---

*This matrix is a living estimate. Update the part picks and prices as the design firms up;
keep it in sync with [../pod-sensor-reference.md](../pod-sensor-reference.md).*
