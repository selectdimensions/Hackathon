# PITCH — RF-Threat Detection Mesh

**Format:** 5-minute brief + 3-minute live demo = 8 minutes total.
**Audience:** Belgian government / defence procurement, plus a 12-year-old in the room.
**Voice rule:** verbs first, one breath per bullet, story over spec.

---

## Slide 1 — Hook *(0:00 → 0:20)*

### Detect the drone before it detects you.

- **Save lives** with a pocket-sized box, not a truck-sized jammer.
- **Protect** airports, embassies, prisons, power grids.
- **Built in a weekend.** Designed to scale to all of Belgium.

---

## Slide 2 — The problem *(0:20 → 1:05)*

### Belgium has two jammers. The drones have thousands.

- **Jam everything** → you break your own GPS, your own radios, your own ambulances.
- **Buy more jammers** → millions per unit, slow to move, one frequency at a time.
- **Buy RF scanners** → suitcase-sized, broadband, need a specialist to read them.
- **Today's gap:** a hobby drone costs less than a phone. Stopping it costs more than a house.

---

## Slide 3 — Flip the question *(1:05 → 1:50)*

### Don't jam. **Listen.**

- **Detect** the exact band the threat uses — 5.8 GHz video, 2.4 GHz control, GPS jam, ELRS.
- **Locate** it with three cheap sensors and a stopwatch — that's all TDOA math is.
- **Warn** the soldier or guard by voice — *"bearing 270, FPV, 5 km"* — in under half a second.
- **Decide** the response with full info, instead of blinding everyone in the building.

---

## Slide 4 — How it works *(1:50 → 2:50)*

### Three boxes. One radio. One earpiece.

- **Sensor pod** → sniffs one specific RF band, stamps the time, encrypts, sends.
- **Master node** → collects 3+ pods, solves the geometry, picks the audio cue.
- **Soldier node** → plays the cue through an earpiece. No screen. No training.
- **Talks over LoRa** at 868 MHz — EU-legal, licence-free, kilometres of range.
- **Encrypts everything** end-to-end with AES-128. Keys rotate every hour. Capture a node, learn nothing.

> *Show the README mermaid diagram on this slide.*

---

## Slide 5 — Why this beats what Belgium owns today *(2:50 → 3:40)*

### Specific beats broadband. Cheap beats heroic.

| | Today's kit | Our mesh |
|---|---|---|
| **Cost per unit** | military-grade, six-to-seven figures | commodity ESP32-C6 + SX1262 carrier |
| **Form factor** | suitcase / vehicle | pocket / belt |
| **Coverage model** | a handful, nationally | hundreds, gridded |
| **Operator load** | trained RF technician | no screen — voice only |
| **Detects** | broadband, noisy | one band, surgical |
| **Action** | jam everything | inform, then choose |

- **Adds new frequencies** by swapping a daughterboard, not buying a new box.
- **Adds new languages** by dropping in an MP3 folder — already EN + FR, Dutch is one afternoon.

---

## Slide 6 — Modular for the next threat *(3:40 → 4:10)*

### Same mesh. New senses.

- **Today** — RF: FPV video, FPV control, GPS jam, ELRS.
- **Next quarter** — acoustic: drone rotor signatures, gunshot direction.
- **Later** — seismic, magnetic, chemical. Same LoRa, same encryption, same audio cue.
- **Master node already speaks JSON** — plugs straight into Motorola DMR/P25, MQTT, Grafana.

---

## Slide 7 — Scale to Belgium *(4:10 → 4:40)*

### A national grid, not a national bill.

- **30,500 km²** of Belgium. One master per cell, four pods per master.
- **EU duty-cycle compliant by design** — under 36 seconds on-air per hour, audited in code.
- **Replace two jammers with two thousand listeners** for a fraction of the price.
- **Day-1 wins** — Brussels Airport perimeter. Embassy row. Prison drone drops.

---

## Slide 8 — The ask *(4:40 → 5:00)*

### Fund a 10-site pilot. Prove it on Belgian soil.

- **Pilot** — one airport, one prison, one embassy. 30 days.
- **Cost** — orders of magnitude under a single legacy jammer.
- **Deliverable** — every detection, geolocated, logged, signed.
- **Partner with us** before someone else sells the country a worse answer.

---

# LIVE DEMO *(5:00 → 8:00 — 3 minutes)*

**Run from repo root:**
```powershell
python -m http.server 8000
# open http://localhost:8000/demo/
```

## Beat 1 — Early warning: a drone closes on the line *(5:00 → 6:00)*

- **Open** the `early_warning` scenario — it's already selected by default.
- **Point** at the forward screen — "fifteen pods in three rows; one slot takes a real BladeRF/Pi the day we have one."
- **Press Play.** A drone enters 10 km out and closes at 60 km/h.
- **Listen** as the earpiece counts the range down — *"…ten kilometres → nine kilometres → eight…"* — bearing and distance updating the whole way in.
- **Watch** the drone marker flare red the instant it crosses inside the 2 km ring.
- **Click ⬇ ndjson** — "every alert is signed JSON. Ready for the national log on day one."

## Beat 2 — GPS jammer at the embassy *(6:00 → 7:00)*

- **Switch** to the `gnss_jammer` scenario.
- **Press Play.** Embassy GPS noise floor spikes.
- **Show** the master picking the GNSS L1 band, not the FPV bands — "surgical, not blanket."
- **Toggle FR** audio — *"deux cent soixante-dix degrés…"* — "Dutch is one folder away."

## Beat 3 — Multi-threat + the future *(7:00 → 7:45)*

- **Switch** to `multi_threat`. Drone and jam at the same time.
- **Two cues** queue back-to-back. The soldier knows both threats without looking down.
- **Point** at the empty Pod E slot in the architecture diagram — "this is where the acoustic sensor plugs in next quarter. Same encryption, same audio cue, no firmware rewrite."

## Close *(7:45 → 8:00)*

- **Pause.** Look at the audience.
- **"This whole demo ran offline, on a laptop, with parts you can order tonight."**
- **"Belgium can have this by Christmas."**
- **Thank you.**

---

## Speaker quick-reference

| Beat | Slide / scenario | Anchor line |
|---|---|---|
| 0:00 | Slide 1 | "Detect the drone before it detects you." |
| 0:20 | Slide 2 | "Belgium has two jammers. The drones have thousands." |
| 1:05 | Slide 3 | "Don't jam. Listen." |
| 1:50 | Slide 4 | "Three boxes. One radio. One earpiece." |
| 2:50 | Slide 5 | "Specific beats broadband. Cheap beats heroic." |
| 3:40 | Slide 6 | "Same mesh. New senses." |
| 4:10 | Slide 7 | "A national grid, not a national bill." |
| 4:40 | Slide 8 | "Partner with us before someone else sells the country a worse answer." |
| 5:00 | demo / early_warning | "Ten kilometres… nine… eight — nine minutes of warning." |
| 6:00 | demo / gnss_jammer | "Surgical, not blanket." |
| 7:00 | demo / multi_threat | "Same encryption, same audio cue, no firmware rewrite." |
| 7:45 | close | "Belgium can have this by Christmas." |

---

## Source-of-truth references

- Architecture diagram + security model — [README.md](README.md)
- Packet lifecycle + sub-band table (Pod A–E) — [ARCHITECTURE.md](ARCHITECTURE.md)
- Demo scenarios + audio toggles — [demo/README.md](demo/README.md)
- Wire format (39 B detect, 21 B alert) — [shared/Protocol.h](shared/Protocol.h)
- Bearing / distance cue map — [shared/AudioCues.h](shared/AudioCues.h)
- EU 36 s/hour duty-cycle audit — [.claude/agents/eu-duty-cycle-auditor.md](.claude/agents/eu-duty-cycle-auditor.md)
