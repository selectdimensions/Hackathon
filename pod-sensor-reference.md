# Distributed Sensing Pod — Master Reference

> Living document. Each pod ("ball") shares a **fixed bus**; the **detection sensor is the variable**.
> A **master node** does the heavy computation; **≥4 receiver pods** (one elevated) report time-stamped
> events back over LoRa so the master can solve for **direction, distance, and speed** of a source,
> then push a human-readable alert (distance + heading) to a person-node in the affected area.

---

## 1. How the system localizes (read this first — it dictates which sensors are useful)

There are only four ways a multi-pod network turns a detection into a *location*. Each sensor in the
catalog is tagged with which it supports.

| Code | Method | What it needs | Best for |
|---|---|---|---|
| **T** | **TDOA** (Time Difference of Arrival) | A sharp, **timestampable transient** + tightly synced clocks across pods | Sound (gunshot, drone, vehicle), RF pulses |
| **B** | **Bearing / AoA** (Angle of Arrival) | An **array or scanner** on one pod → a direction; cross-bearings from ≥2 pods give a fix | Mic arrays, antenna arrays, cameras, scanning radar/LiDAR |
| **R** | **Self-ranging** | Sensor measures **distance to target itself**; ≥3 pods trilaterate | Radar, LiDAR, ultrasonic ToF |
| **D** | **Detect-only** | Presence/level, no geometry by itself | Triggers, anomaly flags, gating other sensors |
| **P** | **Pod self-position** | GNSS + IMU (the fixed bus) | Knowing where each pod *is* |

**Geometry rules that drive your build:**
- For a **2D** fix you need ≥3 pods; for **3D** (incl. elevation) you need **≥4** — which is exactly your spec. The **elevated pod** breaks vertical ambiguity and lowers GDOP (geometric dilution of precision).
- **TDOA timing budget:** sound ≈ **343 m/s**, so **1 ms** of clock error ≈ **0.34 m** of position error — very forgiving. RF travels at *c*, so RF-TDOA needs **ns-level** sync — much harder.
- **Clock sync source = GNSS PPS** (pulse-per-second) at each pod, *not* LoRa. PPS gets you tens-of-ns alignment for free. LoRa is far too coarse for timing.

**Two design constraints that bite people:**
1. **LoRa is a coordination/event link, not a data pipe.** Usable throughput is ~0.3–5 kbps. You ship **event timestamps + extracted features** (peak time, frequency, RSSI, bearing), never raw audio/IQ. Raw correlation happens locally or is summarized before TX.
2. **ESP32 can timestamp + extract features**, but heavy cross-correlation across pods belongs on the **master node**. Pods detect → feature-extract → report.

---

## 2. Fixed bus (every pod has these)

| Block | Recommended part(s) | Why | Active draw | Sleep |
|---|---|---|---|---|
| MCU | **ESP32-S3** (or C6 for 802.15.4) | DSP-capable, I²S, dual-core, cheap | 80–240 mA | 10–150 µA |
| Primary LoRa | **SX1262** module (RAK4270 / E22-900M / Heltec) | Sub-GHz, +22 dBm, low RX current | TX ~118 mA / RX ~5 mA | ~2 µA |
| Redundant LoRa | **SX1278** (same/alt sub-GHz band) *or* **SX1280/SX1281** (2.4 GHz) | SX1278 = band-family redundancy; SX1280/81 = **frequency-diversity** + ranging | TX ~24–120 mA | ~1 µA |
| GNSS | **u-blox NEO-M9N** (timing) → **ZED-F9P** (RTK, cm-level) | Position, elevation, **PPS for sync** | 25–120 mA | — |
| Inertial / wake | **ADXL355** (low-noise) or **ICM-42688** (IMU) | Detect movement → re-trigger GNSS fix | 0.2–0.6 mA | ~µA wake-on-motion |
| Power | LiPo/Li-ion pack + regulator + (optional solar) | Runtime; see §9 budget worksheet | — | — |

**Deploy/move logic (your accelerometer flow):** on deploy, take a GNSS fix (lat/lon/elev) and store it.
Put the IMU in **wake-on-motion**; if the pod is moved past a threshold, it interrupts the ESP32 → force a
fresh GNSS fix → send updated coordinates to the master so the solution geometry stays correct.

---

## 3. LoRa / link-layer modules

Ranges are line-of-sight with a decent antenna; real-world urban = 5–20% of that.

| Module | Chip | Freq (MHz) | TX Power | TX Current | RX Current | Sleep | Range (LOS) |
|---|---|---|---|---|---|---|---|
| RFM95W (HopeRF) | SX1276 | 868/915 | +20 dBm | ~120 mA | 10.8 mA | 0.2 µA | ~15 km |
| RFM96W (HopeRF) | SX1276 | 433/470 | +20 dBm | ~120 mA | 10.8 mA | 0.2 µA | ~15 km |
| RFM98W (HopeRF) | SX1278 | 169/433 | +20 dBm | ~120 mA | 10.8 mA | 0.2 µA | ~15 km |
| Ra-01 / Ra-02 (Ai-Thinker) | SX1278 | 410–525 | +20 dBm | ~120 mA | ~12 mA | 1 µA | ~10–15 km |
| Ra-01S/H | SX1268 | 433 | +22 dBm | ~118 mA | 5.3 mA | 1 µA | ~10 km |
| E22-900M30S (Ebyte) | SX1262+PA | 850–930 | +30 dBm | ~650 mA | ~14 mA | 2 µA | ~10–12 km |
| E22-400M30S (Ebyte) | SX1268+PA | 410–493 | +30 dBm | ~600 mA | ~13 mA | 2 µA | ~10–12 km |
| RAK3172 | STM32WLE5 | 868/915 | +22 dBm | ~118 mA | 4.6 mA | 1.8 µA | ~10 km |
| RAK4270 | SX1262 | 868/915 | +22 dBm | ~118 mA | 4.6 mA | 1.8 µA | ~10 km |
| RN2483 / RN2903 | SX1276 | 433/868 / 915 | +14 / +18 dBm | ~40 mA | ~14 mA | 1.6 µA | ~15 km |
| Murata CMWX1ZZABZ | SX1276+STM32L0 | 868/915 | +20 dBm | ~120 mA | ~6 mA | 1.8 µA | ~15 km |
| Heltec WiFi LoRa 32 V3 | SX1262 | 433/868/915 | +22 dBm | ~118 mA | ~12 mA | ~10 µA | ~3–5 km urban |
| LilyGo T-Beam | SX1276/SX1262 | 433/868/915 | +20 dBm | ~120 mA | ~12 mA | ~10 µA | ~10 km |
| SX1280 / E28 | SX1280 | 2400 | +12.5 dBm | ~24 mA | ~7 mA | 1 µA | few km — **ranging-capable** |
| LR1121 | LR1121 | sub-GHz + 2.4 GHz + S-band | +22 dBm | ~120 mA | ~5 mA | <1 µA | ~10–15 km |

**Caveats:** TX current is at max power (drop 6 dB → current ~halves). Range assumes SF12/BW125/LOS;
SF7 is ~5× shorter but far faster. **+30 dBm parts need duty-cycling** (e.g. 1% in EU868) or you break regs.

---

## 4. Acoustic payloads — *your strongest triangulation option*

Synchronously-sampled MEMS I²S mics + GNSS-PPS timestamps = textbook **acoustic TDOA**. This matches your
sound example directly (compute speed/heading/distance, then voice-alert the person-node).

| Module | Type | Freq Range | Interface | Active | Sleep | Role | Notes |
|---|---|---|---|---|---|---|---|
| INMP441 | MEMS I²S mic | 60 Hz–15 kHz | I²S | ~1.4 mA | µA | **T / B** | Standard ESP32 mic; array-able |
| SPH0645LM4H | MEMS I²S mic | 50 Hz–15 kHz | I²S | ~600 µA | µA | **T / B** | Lower power |
| ICS-43434 | MEMS I²S mic | 50 Hz–20 kHz | I²S | ~1 mA | µA | **T / B** | Wide flat response — good for TDOA |
| MAX9814 | Analog mic + AGC | 20 Hz–20 kHz | Analog (ADC) | ~3 mA | — | **T / D** | Easy, but AGC complicates timing |
| Knowles SPU0410LR5H | Analog ultrasonic | up to ~80 kHz | Analog | ~140 µA | µA | **T / D** | "Bat-band"; needs fast ADC |
| HC-SR04 | Piezo ultrasonic | 40 kHz | Trigger/echo | ~15 mA | — | **R** | Classic ToF rangefinder, 2 cm–4 m |
| JSN-SR04T | Waterproof ultrasonic | 40 kHz | Trigger/echo | ~30 mA | — | **R** | Sealed, outdoor, 0.25–4.5 m |
| MaxBotix MB7389 | Industrial ultrasonic | 42 kHz | UART/analog/PWM | ~3 mA avg | — | **R** | Outdoor-rated, 0.3–5 m |
| Murata MA40S4 (pair) | Piezo transducers | 40 kHz | Analog/driver | varies | — | **R / B** | DIY sonar / phased pair |
| Chirp CH101 / CH201 | MEMS ultrasonic ToF | 175 / 85 kHz | I²C | ~10 µA avg | µA | **R** | Tiny µW sonar, 1 m / 5 m |
| Knowles SPH8878 | Infrasound-capable | 7 Hz–10 kHz | Analog | ~700 µA | µA | **T / D** | Low end goes sub-audible |
| *(sub-Hz infrasound)* | Diff. pressure (e.g. ICP-101xx) | <10 Hz | I²C | ~1 mA | µA | **T / D** | Stock mics rarely reach this |

> **For acoustic TDOA:** prefer **I²S MEMS** (INMP441 / ICS-43434) — no AGC, deterministic latency,
> trivially synchronized to the I²S/PPS clock. One mic per pod gives TDOA across pods; **a small array
> on each pod** also yields per-pod **bearing (B)**, which massively tightens the solution.

---

## 5. RF / SDR receiver payloads

For spectrum sensing, emitter detection, and (hard) RF geolocation. RF-TDOA needs ns sync; RSS/AoA are
easier. Most pods would carry a cheap transceiver; a few "super-pods" carry an SDR.

| Module | Type | Freq Range | RX Sens. | Interface | Active | Role | Notes |
|---|---|---|---|---|---|---|---|
| RTL-SDR v4 | SDR (RX) | 500 kHz–1.766 GHz | ~-130 dBm | USB | ~270 mA | **D / B** | Cheapest wideband; HF via direct-sampling |
| Airspy R2 / Mini | SDR (RX) | 24–1800 MHz | ~-140 dBm | USB | ~250 mA | **D / B** | Lower noise than RTL |
| HackRF One | SDR TX/RX | 1 MHz–6 GHz | ~-100 dBm | USB | ~400 mA | **D / B** | 8-bit, half-duplex, 20 MS/s |
| BladeRF 2.0 micro | SDR TX/RX | 47 MHz–6 GHz | ~-117 dBm | USB | ~1.5 A pk | **D / B / T** | 12-bit, full-duplex, coherent-capable |
| LimeSDR Mini 2.0 | SDR TX/RX | 10 MHz–3.5 GHz | ~-120 dBm | USB | ~700 mA | **D / B** | MIMO variants exist |
| USRP B210 | SDR TX/RX | 70 MHz–6 GHz | ~-125 dBm | USB | ~2 A | **D / B / T** | 2×2 MIMO, 56 MHz BW — coherent |
| ADALM-PLUTO | SDR TX/RX | 70 MHz–6 GHz (mod) | ~-120 dBm | USB | ~600 mA | **D / B** | Hackable |
| CC1101 | Sub-GHz xcvr | 300–928 MHz | -116 dBm | SPI | 16 mA RX | **D** | Cheap, Flipper-style |
| Si4463 | Sub-GHz xcvr | 142–1050 MHz | -126 dBm | SPI | 10–13 mA RX | **D** | Better sensitivity than CC1101 |
| nRF52840 | 2.4 GHz + BLE | 2.4 GHz ISM | -95 dBm | SPI/USB | 4.6 mA RX | **D / B** | BLE direction-finding (AoA) supported |
| ESP32-C6/S3 | WiFi6+BLE+802.15.4 | 2.4 / 5 GHz | -97 dBm | native | 80–240 mA | **D** | Already your MCU |
| AD8307 | RF power detector | 0.5–500 MHz | — | Analog | ~8 mA | **D** | Log-amp dBm meter (RSS) |
| LTC5582 | RF power detector | 40 MHz–10 GHz | — | Analog | ~50 mA | **D** | Wideband power detect |
| SIM7600 | LTE Cat-4 + GNSS | 700 MHz–2.6 GHz | -100 dBm | UART/USB | ~500 mA pk | **D / P** | Cell backhaul + position |
| Quectel BG95 | LTE-M/NB-IoT + GNSS | LTE bands | -114 dBm | UART | ~3 µA PSM | **D / P** | Ultra-low-power backhaul |

> **Wideband coverage on the cheap:** RTL-SDR + HackRF + nRF52 + LTE modem ≈ 500 kHz–6 GHz; add an LNB
> downconverter for satellite L/Ku. **Coherent RF-TDOA** is only realistic on clock-shareable SDRs
> (USRP, BladeRF) with a common reference.

---

## 6. Radar payloads (mmWave & Doppler) — self-ranging + velocity

Radar gives **range + radial velocity (Doppler) + local angle** on a *single* pod — strong for direction
and speed without multi-pod math, and works through glass / in the dark.

| Module | Tech | Freq | Range | Interface | Active | Role | Notes |
|---|---|---|---|---|---|---|---|
| TI IWR6843 | FMCW mmWave | 60–64 GHz | 0.05–80 m | SPI/UART | ~2 W | **R / B** | 3TX/4RX, point cloud + onboard DSP |
| TI AWR1843 | FMCW mmWave (auto) | 76–81 GHz | ≤200 m | SPI/UART | ~2.5 W | **R / B** | Automotive grade |
| TI IWR1443 | FMCW mmWave | 76–81 GHz | ≤80 m | SPI/UART | ~1.5 W | **R / B** | Cheaper eval option |
| Infineon BGT60TR13C | FMCW mmWave | 57–64 GHz | ~10 m | SPI | ~250 mW avg | **R / B** | "Soli" — gesture/presence/breathing |
| Infineon BGT60LTR11 | Doppler | 61 GHz | ~7 m | SPI/analog | ~6 mW | **D** | Tiny presence/motion |
| Acconeer A121 | Pulsed coherent | 60 GHz | 0–20 m | SPI | ~75 mW | **R** | Best µW battery-grade radar |
| Seeed MR60BHA2 | mmWave vitals | 60 GHz | ~1.5 m | UART | ~250 mW | **D** | Breathing / heart rate |
| LD2410B (Hi-Link) | FMCW | 24 GHz | ~6 m | UART | ~75 mA | **R / D** | ~$5 presence sensor |
| RCWL-0516 | Doppler | 3.18 GHz | ~7 m | digital | ~3 mA | **D** | "Microwave PIR", motion only |
| HB100 | Doppler | 10.525 GHz | ~20 m | analog | ~30 mA | **D** | Classic X-band speed/motion |

---

## 7. Optical / vision / LiDAR payloads

Cameras give **bearing** (and, with depth, range); LiDAR/ToF gives **direct range**. Useful for
confirming/classifying what an acoustic or RF trigger detected.

| Module | Type | Spectrum | Res. | Interface | Active | Role | Notes |
|---|---|---|---|---|---|---|---|
| OV2640 | CMOS camera | Visible | 2 MP | DVP/SPI | ~60 mA | **B** | Ubiquitous (ESP32-CAM) |
| OV5640 | CMOS camera | Visible | 5 MP | DVP/MIPI | ~140 mA | **B** | Autofocus variant |
| IMX477 (Pi HQ) | CMOS camera | Visible | 12 MP | MIPI | ~250 mA | **B** | C/CS mount, big sensor |
| OV2640-NoIR | CMOS, no IR filter | Vis + NIR | 2 MP | DVP | ~60 mA | **B** | Night vision w/ IR LED |
| FLIR Lepton 3.5 | LWIR thermal | 8–14 µm | 160×120 | SPI | ~150 mW | **B / D** | Radiometric; people/heat in dark |
| AMG8833 | LWIR thermal grid | 8–14 µm | 8×8 | I²C | ~14 mA | **D / B** | Cheap presence/heat |
| MLX90640 | LWIR thermal | 8–14 µm | 32×24 | I²C | ~23 mA | **B / D** | Mid-tier thermal |
| VL53L1X | ToF LiDAR (1-pt) | 940 nm | 4 m | I²C | ~20 mA | **R** | Tiny dToF rangefinder |
| VL53L5CX | ToF LiDAR (zone) | 940 nm | 8×8, 4 m | I²C | ~37 mA | **R / B** | Multizone ToF |
| TFmini-Plus | 1D LiDAR | 850 nm | 12 m | UART/I²C | ~140 mA | **R** | Cheap altimeter/range |
| RPLIDAR A1/A2 | 2D scanning LiDAR | 785 nm | 360°, 8–18 m | UART | ~400 mA | **R / B** | Hobby SLAM standard |
| Livox Mid-360 | 3D LiDAR | 905 nm | 360°×59°, 70 m | Ethernet | ~6.5 W | **R / B** | Drone/robotics grade |
| Ouster OS1 | 3D LiDAR | 865 nm | 360°, 120 m | Ethernet | ~14 W | **R / B** | Survey/autonomy grade |
| AS7341 | 11-ch spectral | 350–1000 nm | scalar | I²C | ~3 mA | **D** | Spectroscopy-lite / material ID |
| TCS34725 | RGB color | 400–700 nm | scalar | I²C | ~3 mA | **D** | Color ID |
| SI1145 / VEML6075 | UV + ambient | 280–400 nm | scalar | I²C | ~1 mA | **D** | UV index / light gating |

---

## 8. Magnetic, EM, environmental & other payloads

Mostly **detect/anomaly/trigger** roles — good for *gating* the expensive sensors or flagging an event,
not for geometry on their own.

| Module | Senses | Spec | Interface | Active | Role | Notes |
|---|---|---|---|---|---|---|
| HMC5883L / QMC5883 | 3-axis magnetometer | ±8 gauss | I²C | ~100 µA | **D** | Cheap compass / vehicle detect |
| RM3100 | 3-axis magnetometer | ±800 µT, 13 nT | SPI/I²C | ~1 mA | **D / B** | Geomag anomaly / ferrous detect |
| MLX90393 | 3-axis Hall | ±50 mT | I²C/SPI | ~100 µA | **D** | Proximity/position |
| PIR (AM312 / HC-SR501) | Pyroelectric IR | ~5–7 m | digital | ~50 µA | **D** | Body-heat motion trigger |
| MPU-6050 / ICM-42688 | IMU (accel+gyro) | ±16 g / ±2000 dps | I²C/SPI | ~600 µA | **D / P** | Motion/vibration; **pod move-alert** |
| ADXL355 | Low-noise accel | ±8 g, 25 µg/√Hz | SPI | ~200 µA | **D / P** | Seismic/vibration; **bus default** |
| ICP-101xx | Barometric pressure | high-res | I²C | ~1 mA | **D / P** | Elevation aid / infrasound |
| Si7021 / SHT41 | Temp + humidity | ±0.2 °C | I²C | ~150 µA | **D** | Env. baseline |
| BME680 / BME688 | T/RH/P + VOC gas | gas resistance | I²C/SPI | ~3.7 mA pk | **D** | AI gas ID (688) |
| SCD41 | NDIR CO₂ | 400–5000 ppm | I²C | ~15 mA avg | **D** | True CO₂ (occupancy) |
| SGP41 | VOC + NOx | index 0–500 | I²C | ~3 mA | **D** | Indoor air quality |
| PMS5003 / SPS30 | Laser particulate | PM1/2.5/10 | UART | ~80 mA | **D** | Smoke/dust |
| MQ-series | Specific gases | CO/CH4/NH3… | analog | ~150 mA (heater) | **D** | Cheap, power-hungry |
| Geiger (SBM-20 + driver) | Ionizing radiation | β/γ | pulse | ~20 mA | **D** | DIY dosimeter |
| Radiacode 103 | Scintillator + spectro | γ spectroscopy | USB/BLE | ~30 mA | **D** | Pocket spectrum analyzer |
| ACS712 / INA219 | Current sense | ±5–30 A | analog/I²C | ~10 mA | **P** | Battery/health telemetry |

---

## 9. Power-budget worksheet (fill per pod build)

Estimate average draw, then runtime = `battery_mAh ÷ avg_mA`.

| Block | Part | State | Current (mA) | Duty % | Avg (mA) |
|---|---|---|---|---|---|
| MCU | ESP32-S3 | active/sleep | | | |
| LoRa #1 | SX1262 | RX-listen | | | |
| LoRa #1 | SX1262 | TX-burst | | | |
| LoRa #2 | SX1278/1280 | RX/standby | | | |
| GNSS | NEO-M9N | fix/PPS | | | |
| IMU | ADXL355 | wake-on-motion | | | |
| **Sensor** | *(variable)* | active | | | |
| **Sensor** | *(variable)* | sleep | | | |
| | | | | **Σ avg** | |

`Runtime (h) ≈ battery_mAh ÷ Σ_avg_mA`  ·  add ~20% derate for converter loss, cold, aging.

---

## 10. Quick chooser by what you want to localize

| Target | Best primary sensor | Method | Notes |
|---|---|---|---|
| Gunshot / blast | I²S MEMS array (ICS-43434) | **TDOA + B** | Your flagship case; voice-alert distance/heading |
| Drone (acoustic) | I²S mic + classifier | **TDOA** | Prop signature; pair w/ RF for confirm |
| Drone (RF) | RTL-SDR / nRF52 | **D / B** | 2.4/5.8 GHz control + video links |
| Vehicle | Magnetometer + mic | **D → TDOA** | Mag triggers, mic ranges |
| Person/presence | mmWave (LD2410/A121) or PIR | **R / D** | mmWave works through glass / motionless |
| Speed of a mover | Doppler radar (HB100) or mmWave | **R + velocity** | Direct radial speed |
| RF emitter | SDR (coherent: USRP/BladeRF) | **B / T** | RF-TDOA is hard (ns sync) |

---

*Legend — Localization role: **T** TDOA · **B** bearing/AoA · **R** self-range · **D** detect-only · **P** pod self-position.*
*Power figures are typical active values at stated conditions; verify against the datasheet for your exact module.*
