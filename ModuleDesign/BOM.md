# Bill of Materials — v0.2 Pi 5 + SDR pods

Per-pod BOM for the v0.2 hardware pivot (Raspberry Pi 5 + SDR + ESP32-C6 companion).
Source of the numbers and rationale: [../docs/V02_PIVOT.md](../docs/V02_PIVOT.md) §8.
Prices are 2026 EU retail, EUR incl. 19% VAT, and are planning estimates only.

## Pod assignment

| Pod | Band | SDR | Notes |
|---|---|---|---|
| **A** | 5.8 GHz FPV video | HackRF One | Only sub-€400 option reaching 5.8 GHz |
| **B** | 2.4 GHz FPV control / OcuSync / ELRS 2.4 / Wi-Fi | HackRF One | Same chassis as A; antenna/LNA differ |
| **C** | GNSS L1 jam (1575.42 MHz) | RTL-SDR Blog V3 + active L1 patch | RTL-SDR Blog V3 (R820T2) — V4 is EOL (2026-05-14) |
| **D** | 868 MHz EU ISM (ELRS-EU, LoRa, generic SRD) | RTL-SDR Blog V3 + 868 BPF | Self-jam vs own SX1262 TX — see antenna isolation below |
| **E** | Tactical VHF 30–88 MHz | RTL-SDR Blog V3 | Above the 24 MHz floor — no direct-sampling mod |
| **Master** | DoA / direction-finding | KrakenSDR (1 unit, master site only) | DoA, not TDOA — see pivot doc §4 |

All pods are **receive-only**. The HackRF can transmit; disable TX in firmware
(`hackrf_transfer -r` only, never `-t`).

## Per-pod cost

| Item | Pod A (5.8 GHz) | Pod B (2.4 GHz) | Pod C (L1) | Pod D (868) | Pod E (VHF) |
|---|---|---|---|---|---|
| Raspberry Pi 5 8 GB | 90 | 90 | 90 | 90 | 90 |
| Active Cooler | 5 | 5 | 5 | 5 | 5 |
| 32 GB high-endurance microSD | 12 | 12 | 12 | 12 | 12 |
| SDR | HackRF One **330** | HackRF One **330** | RTL-SDR Blog V3 **30** | RTL-SDR Blog V3 **30** | RTL-SDR Blog V3 **30** |
| Band antenna | 5.8 GHz patch/cloverleaf **25** | 2.4 GHz dipole **15** | active L1 patch **45** | 868 MHz omni + cavity BPF **35** | VHF dipole / log-periodic **30** |
| LNA (optional) | 5.8 GHz LNA, 0.5 dB NF **45** | 2.4 GHz LNA **30** | included in patch | (skip) | (skip) |
| LoRa HAT (RAK6421 + RAK13300) | 65 | 65 | 65 | 65 | 65 |
| ESP32-C6 companion + wiring | 12 | 12 | 12 | 12 | 12 |
| GPS HAT or breakout (u-blox M10S) | 35 | 35 | 35 | 35 | 35 |
| IP54 enclosure + cable glands | 35 | 35 | 35 | 35 | 35 |
| 20,000 mAh USB-PD power bank | 45 | 45 | 45 | 45 | 45 |
| Misc (SMA pigtails, screws, thermal pad) | 20 | 20 | 20 | 20 | 20 |
| **Total per pod** | **~€720** | **~€695** | **~€440** | **~€430** | **~€425** |

> **Note on the LoRa HAT line:** in the recommended **Option B**, the SX1262 is owned
> by the ESP32-C6 companion, not a Pi HAT — see [../docs/V02_PIVOT.md](../docs/V02_PIVOT.md) §6.
> The RAK6421+RAK13300 line is retained as a budget placeholder for the SX1262 + carrier;
> finalize against the actual companion-board design before ordering.

## Kit totals

- **Five-pod kit (one of each):** ≈ **€2,710**
- **Master DoA add-on:** KrakenSDR (~€720 ex-VAT, ~€860 incl. EU VAT/duty) + Krakentenna set (~€180) + Pi 5 host (~€110) ≈ **+€1,150**
- **Grand total v0.2 field kit:** ≈ **€3,860**

## Cost multiplier vs v0.1 AD8318 pod

The current ESP32-C6 + AD8318 log-detector pod is ~€80–100. The pivot multiplier is
**~5×** for an RTL-SDR pod and **~7–8×** for a HackRF pod. That buys actual signal
classification (not just energy threshold) and software-only signature updates.

## Power & thermal (per pod)

From pivot doc §7:

| State | Power |
|---|---|
| Idle (Pi 5 + RTL-SDR + LoRa RX + GPS + ESP32-C6) | ~4.2 W |
| Active (one core busy, TX bursts) | ~7–9 W |

- **Active cooling is mandatory** — without it the Pi 5 throttles 2.4→1.5 GHz at ~86.7 °C.
- 20,000 mAh USB-PD pack (~58 Wh usable): RTL-SDR pods ≈ 10 h, HackRF (USB-3) pods ≈ 7 h.
- For >24 h: add 30 W solar (~€60) or a 50 Ah LiFePO4 12 V battery + 5 V buck (~€120).

## Antenna isolation (Pod D)

Co-located SX1262 TX (+22 dBm) desenses the RX SDR for hundreds of ms. Apply all three:

1. ≥ 2 m physical separation between LoRa TX and RX SDR antennas.
2. Software TDM: gate the SDR/classifier while the ESP32-C6 asserts a `TX_ACTIVE` GPIO.
3. 868 MHz band-stop SAW notch (~€10) in the RX chain.

Better still, point Pod D's RX at sub-band P (869.4–869.65 MHz) or 433 MHz EU SRD,
where the pod's own TX is minimal.
