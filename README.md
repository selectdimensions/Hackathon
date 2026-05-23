# Hackathon — RF-Threat Detection Mesh

ESP32-C6 + SX1262 LoRa sensor pods detect hostile RF emitters (FPV drones, GNSS jammers, tactical radio jamming), triangulate them via TDOA, and warn dismounted soldiers via pre-recorded audio cues over an encrypted LoRa downlink.

## Architecture at a glance

```mermaid
flowchart TB
    PodA["Pod A<br/>5.8 GHz FPV video"]
    PodB["Pod B<br/>2.4 GHz FPV control"]
    PodC["Pod C<br/>GNSS L1 jam"]
    PodD["Pod D<br/>900 MHz / ELRS"]

    Master["Master Node<br/>TDOA + RSSI solve<br/>Rekey broadcaster"]
    Soldier1["Soldier Node 1<br/>I2S DAC -> audio"]
    Soldier2["Soldier Node 2<br/>I2S DAC -> audio"]

    PodA -- "868.1 MHz<br/>DetectPacket (39B enc)" --> Master
    PodB -- "868.1 MHz<br/>DetectPacket (39B enc)" --> Master
    PodC -- "868.1 MHz<br/>DetectPacket (39B enc)" --> Master
    PodD -- "868.1 MHz<br/>DetectPacket (39B enc)" --> Master

    Master -- "868.3 MHz<br/>AlertPacket (21B enc)<br/>bearing + dist + cue_id" --> Soldier1
    Master -- "868.3 MHz<br/>AlertPacket (21B enc)" --> Soldier2

    Master -. "Rekey broadcast<br/>every 45-75 min<br/>(Ed25519-signed)" .-> PodA
    Master -. "Rekey broadcast" .-> PodB
    Master -. "Rekey broadcast" .-> Soldier1

    Master -. "USB serial JSON<br/>(future: MQTT)" .-> Analytics[("DataAnalysisLog<br/>triangulation harness")]
```

```mermaid
sequenceDiagram
    participant P as Sensor Pod
    participant M as Master Node
    participant S as Soldier Node
    Note over M,S: Every 45-75 min (jittered)
    M->>P: MSG_REKEY (Ed25519-signed, X25519 eph pubkey)
    M->>S: MSG_REKEY (same broadcast)
    Note over P,M: Both derive K_session via X25519 + HKDF
    P->>M: DetectPacket (AES-128-CCM under K_session)
    M->>M: TDOA + RSSI solve
    M->>S: AlertPacket (AES-128-CCM under K_session)
    S->>S: Play audio cue (cue_id -> WAV from LittleFS)
```

See [ARCHITECTURE.md](ARCHITECTURE.md) for full detail, [shared/Protocol.h](shared/Protocol.h) for the wire format, [SECURITY.md](SECURITY.md) for SSH + LoRa crypto policy.

## Security highlights

- **All LoRa packets encrypted + authenticated** with AES-128-CCM (8-byte tag).
- **Session keys rotate every 45–75 min** (60 min ± 15 min jitter), via Ed25519-signed X25519 rekey broadcast → HKDF-SHA256.
- **Per-node Ed25519 identity keys**, pinned at provisioning. No PKI, no PSK, no shared secrets in repo.
- **Forward secrecy** — ephemeral X25519 on every rekey; past traffic stays safe even if a long-term key leaks later.
- **GitHub auth: SSH-only** with passphrase-protected ed25519 key + `ssh-agent`. No PATs, no HTTPS remotes.

## Clone

```powershell
git clone git@github.com:selectdimensions/Hackathon.git
```

SSH must be set up first — see [SECURITY.md](SECURITY.md).

## Repo layout (monorepo)

| Path | Responsibility |
|---|---|
| `shared/` | Wire-format headers + crypto helpers — single source of truth |
| `shared/keys/pinned/` | Per-node Ed25519 + X25519 public keys (committed) |
| `LoRaMeshing/` | Sensor + master firmware (FreeRTOS dual-task RX/TX + rekey state machine) |
| `Rx/` | Soldier-node receiver firmware + audio playback |
| `ModuleDesign/` | Enclosure CAD + SX1262 carrier-board KiCad |
| `DataAnalysisLog/` | JSON log schema + triangulation harness + MQTT bridge TODO |
| `UserNotification/` | Pre-recorded audio cue library + manifest |
| `scripts/` | Deterministic agent-check equivalents (CI + pre-commit) |
| `.claude/agents/` | Project-scoped Claude Code subagents |

## Branch model

- `main` — tagged releases only
- `develop` — integration, default working branch
- `feat/<name>` — feature branches off `develop`

Conventional commit prefixes: `feat:`, `fix:`, `proto:` (wire-format change), `crypto:` (key-handling change), `chore:`, `docs:`. See [CONTRIBUTING.md](CONTRIBUTING.md).

## Build

1. Install Arduino IDE 2.x + `esp32` board package ≥ 3.0 (RISC-V support).
2. Install libraries: `RadioLib`, `ArduinoJson`, `TinyGPSPlus`, `rweather Crypto`.
3. Provision keys: `shared/keys/gen_node_key.ps1 <node_id>` (offline, on a trusted machine).
4. Generate pinned header: `shared/keys/gen_pinned_header.ps1`.
5. Sync shared headers: `shared/sync_shared.ps1`.
6. Open `LoRaMeshing/SensorNode/SensorNode.ino` (or `MasterNode`, or `Rx/SoldierNode`), select board "ESP32C6 Dev Module", flash.

## Status

v0.1 — framework scaffold only. Firmware bodies are skeletons. Out-of-scope (Motorola DMR/P25 bridge, MQTT/Grafana analytics, TTS pipeline) is documented in [DataAnalysisLog/TODO_motorola_bridge.md](DataAnalysisLog/TODO_motorola_bridge.md).
