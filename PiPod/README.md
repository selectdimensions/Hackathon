# PiPod — Raspberry Pi 5 SDR sensor pod (v0.2)

Pi-side host for the v0.2 hardware pivot. Each pod runs an SDR + a two-stage
detector and forwards **classified `DetectPacket` payloads over UART** to an
ESP32-C6 companion that owns the SX1262 and runs the existing RadioLib /
AES-128-EAX firmware unchanged.

Rationale, SDR selection, and milestones: [../docs/V02_PIVOT.md](../docs/V02_PIVOT.md).
Issue/change backlog: [../V02_GAP_ANALYSIS.md](../V02_GAP_ANALYSIS.md).

> **Status: scaffold.** Files here establish structure and contracts. DSP bodies
> are skeletons with TODOs — they have not been run against real SDR hardware.

## Option B — the Pi does NOT have a LoRa HAT

The SX1262 is owned by the **ESP32-C6 companion**, not a Pi HAT. Keeping crypto on
the bare-metal ESP32-C6 holds the trusted computing base to ~30 KB; a compromised Pi
cannot exfiltrate session keys because they never reach it. The Pi↔ESP32-C6 link is
one-way (Pi → ESP32-C6) carrying detection metadata only — never key material. See
[../SECURITY.md](../SECURITY.md) (Pi pod threat model — gap A4, pending) and the HAT
survey in [../docs/V02_PIVOT.md](../docs/V02_PIVOT.md) §2 (reference only; we reject
the Pi-side-RadioLib "Option A").

## Layout

| Path | Purpose | Gap |
|---|---|---|
| `detector/` | Always-on C energy detector (librtlsdr/libhackrf + FFTW, `/dev/shm` ring buffer) | E1 |
| `classifier/` | Python signature classifiers, invoked only on energy-threshold trigger | E2 |
| `uart_bridge/` | Pi→ESP32-C6 framing — `uart_proto.{md,h}` | E3 |
| `docs/pps.md` | GPS PPS distribution to both Pi (chrony) and ESP32-C6 | C3 |
| `systemd/` | Service unit + chrony example | A1 |
| `REFERENCES.md` | Upstream projects we build on | E4 |
| `.github/workflows/build.yml` | arm64 C build + Python lint/test | F1 |

## Base image

Use **DragonOS Pi64** (Beta42 or newer) — it ships RTL-SDR/HackRF/bladeRF drivers,
GNU Radio, SDR++, and rtl-433 preconfigured for Pi 5. See `REFERENCES.md`.

## Pi 5 GPIO / SPI gotchas (from pivot doc §2)

- Pi 5 uses the **RP1** I/O chip: GPIO character device is `/dev/gpiochip4` (not 0).
- Use **lgpio** (chardev API), not the deprecated wiringPi/pigpio.
- GPS UART is `/dev/ttyS0` on Pi 5 (was `/dev/ttyAMA0` on Pi ≤4).
- PPS is GPIO-only on Pi 5: `dtoverlay=pps-gpio,gpiopin=18`.

## Power & thermal

~4.2 W idle, ~7–9 W active. **Active cooling is mandatory** (throttles at ~86.7 °C
without it). Battery life and solar options: [../ModuleDesign/BOM.md](../ModuleDesign/BOM.md).

## Per-pod SDR (see BOM)

| Pod | Band | SDR |
|---|---|---|
| A | 5.8 GHz FPV video | HackRF One |
| B | 2.4 GHz FPV control / OcuSync / ELRS 2.4 | HackRF One |
| C | GNSS L1 jam | RTL-SDR Blog V3 + active L1 patch |
| D | 868 MHz EU ISM | RTL-SDR Blog V3 + 868 BPF |
| E | Tactical VHF 30–88 MHz | RTL-SDR Blog V3 |
