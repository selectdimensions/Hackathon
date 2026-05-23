# Architecture

## Subsystems

```mermaid
flowchart LR
    subgraph "Hackathon/ (monorepo)"
        Shared["shared/<br/>Protocol.h, Crypto.h,<br/>AudioCues.h, LoRaConfig.h"]
        Agents[".claude/agents/<br/>protocol reviewer, builder,<br/>auditor, validator, curator"]
        Scripts["scripts/<br/>check_protocol.py,<br/>check_audio_cues.py,<br/>check_eu_duty_cycle.py"]
    end

    Shared -.->|sync_shared.ps1| LM[LoRaMeshing/]
    Shared -.->|sync_shared.ps1| Rx[Rx/]
    Shared -.->|read-only ref| DAL[DataAnalysisLog/]
    Shared -.->|cue_id table| UN[UserNotification/]

    LM -->|deploys to| Pods[Sensor Pods + Master]
    Rx -->|deploys to| SoldierHW[Soldier Hardware]
    UN -->|LittleFS upload| SoldierHW

    Pods -->|serial JSON| DAL
    ModDes[ModuleDesign/] -.->|enclosures, PCB| Pods
    ModDes -.->|enclosures, PCB| SoldierHW
```

## Packet life-cycle (one detection)

```mermaid
sequenceDiagram
    autonumber
    participant RF as RF Frontend
    participant Pod as Sensor Pod (ESP32-C6)
    participant LoRaA as 868.1 MHz (Freq A)
    participant Master as Master Node
    participant LoRaB as 868.3 MHz (Freq B)
    participant Soldier as Soldier Node
    participant I2S as MAX98357A + Speaker

    RF->>Pod: Analog detector trips threshold
    Pod->>Pod: Build DetectPacket {ts_pps, rssi, snr, lat/lon, ...}
    Pod->>Pod: AES-128-CCM encrypt under K_session[epoch]
    Pod->>LoRaA: TX (CAD-gated, 39 B on-air, ~155 ms)
    LoRaA->>Master: RX on Freq A
    Master->>Master: Verify CCM tag, decrypt, CRC check
    Master->>Master: Insert into node registry, run TDOA solve
    Master->>Master: Compute bearing, distance, threat_class, cue_id
    Master->>Master: Build AlertPacket, AES-128-CCM encrypt
    Master->>LoRaB: TX (21 B on-air, ~41 ms)
    LoRaB->>Soldier: RX on Freq B
    Soldier->>Soldier: Verify CCM tag, decrypt, CRC check
    Soldier->>Soldier: Lookup cue_id → filename in AudioCues.h
    Soldier->>I2S: Stream WAV from LittleFS to I2S DAC
    I2S->>I2S: "threat bearing two-seven-zero, FPV"
```

## Key rotation life-cycle

```mermaid
stateDiagram-v2
    [*] --> Provisioning : First boot
    Provisioning --> WaitingForRekey : Pinned keys loaded from NVS
    WaitingForRekey --> ActiveEpoch : RekeyPacket verified, K_session derived
    ActiveEpoch --> RekeyPending : 45-75 min jitter timer fires (master only)
    RekeyPending --> ActiveEpoch : New epoch broadcast + acknowledged
    ActiveEpoch --> Recovery : 2 hours since last valid rekey received
    Recovery --> WaitingForRekey : Drop session, wait for next master rekey
    Recovery --> [*] : Operator intervention (re-provision)
```

## TDOA math (overview)

```mermaid
flowchart LR
    P1[Pod 1<br/>t_arrival_1<br/>lat,lon known] -->|Δt_12 = t1-t2| Solver
    P2[Pod 2<br/>t_arrival_2<br/>lat,lon known] -->|Δt_23 = t2-t3| Solver
    P3[Pod 3<br/>t_arrival_3<br/>lat,lon known] --> Solver
    Solver["Hyperbolic intersection<br/>(Bancroft closed-form<br/>or iterative LS)"] --> Emitter[Emitter location<br/>± error ellipse]
    Solver -.->|fallback if any pod<br/>missing PPS sync| RSSI[RSSI multilateration<br/>log-distance model]
```

Each pod must have:
- Surveyed lat/lon (or live GNSS lock, ideally both)
- GPS-PPS pin wired to GPIO interrupt; `micros()` captured on PPS rising edge gives sub-microsecond cross-node sync.
- Same view of the emitter — detection threshold must trip on all ≥3 pods within the ~10 ms sync window for TDOA to be solvable.

## Sub-band frequency plan (per pod variant)

| Pod variant | Frontend | Detection method | Output to packet |
|---|---|---|---|
| **A — 5.8 GHz FPV video** | 5.8 GHz LNA → AD8318 log detector → ADC | Power threshold + dwell time | `band_id=BAND_5800_MHZ`, `rssi_dbm` from log-detector mapping |
| **B — 2.4 GHz FPV control** | 2.4 GHz LNA → AD8318 → ADC | Power threshold + FHSS pattern detect | `band_id=BAND_2400_MHZ`, `flags.FREQ_HOPPER` set on dwell pattern |
| **C — GNSS L1 jam** | 1.575 GHz SAW → LNA → log detector | Noise-floor rise vs baseline | `band_id=BAND_GNSS_L1`, `flags.GNSS_JAM_SUSPECTED` |
| **D — 900 MHz / ELRS** | 900 MHz LNA → log detector | Power + LoRa-chirp shape detect | `band_id=BAND_433_915_MHZ` |
| **E (future) — 30–88 MHz tactical** | HF/VHF SDR (RTL-SDR v4 or similar) | Wideband sweep + carrier classify | `band_id=BAND_30_88_MHZ` |

The master node's "which channel is unjammed" recommendation comes from comparing `noise_floor_dbm` reports across pods over time and picking the lowest-noise band.
