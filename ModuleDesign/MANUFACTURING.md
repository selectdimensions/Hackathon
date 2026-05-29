# Manufacturing — prototype to 1,000,000 pods/month

Scope: the "ball" pod enclosure + PCBA at scale. This is an ops/industrial plan, not
firmware. Enclosure geometry source: [Body/pod/pod_ball.scad](Body/pod/pod_ball.scad).
Costs tie to [POD_BOM_MATRIX.md](POD_BOM_MATRIX.md).

## 1. Two production tiers

| Tier | Volume | Enclosure process | PCBA | Per-pod fixed-bus € |
|---|---|---|---|---|
| **Prototype / pilot** | 1–1,000 | FDM/SLA from `pod_ball.scad` | hand / small-run | €80 → €38 |
| **Mass** | up to **1M/month** | **injection molding** + turnkey PCBA | automated SMT lines | ~€18–25 |

3D printing is for prototypes and field-replaceable one-offs only — it **cannot** reach
mass volume (see §3).

## 2. Design-for-manufacture (injection molding)

The two-hemisphere split in `pod_ball.scad` is already mold-friendly. For the IM tool:

- **Material:** polycarbonate (impact + temp, –40 to +60 °C per the spec) or PC/ABS;
  GNSS "sky window" stays thin (`gnss_wall ≈ 1.4 mm`) and RF-transparent.
- **Wall:** target a uniform ~2.5–3.0 mm; avoid thick/thin transitions (sink marks).
- **Draft:** add ≥1.5° draft to all vertical faces (the prototype `.scad` has none —
  apply draft in the tool model, not the FDM source).
- **Seal:** O-ring groove at the lip (already modeled) **or** ultrasonic weld a TPE gasket;
  pressure-equalise via a bonded Gore-Tex vent (the `vent_d` boss).
- **Inserts:** brass heat-set inserts at the standoffs (replace the `.scad` self-tap pilots).
- **Gate:** sub-gate or hot-tip near the pole opposite the GNSS window to keep the window
  cosmetic and weld-line-free.

## 3. Throughput math — why 3D printing can't, and IM can

**Target:** 1,000,000 pods/month = **2,000,000 shells/month** (two halves per pod).

**FDM (prototype process):** one ~90 mm shell ≈ 1.5–2 h print. One printer ≈ 12–16
shells/day. 2M shells/month ⇒ **~4,000–5,500 printers running 24/7.** Not viable.

**Injection molding (mass process):**
- Cycle time for this size/wall ≈ **35–45 s/shot** → ~85 shots/hour.
- A **16-cavity** tool ⇒ 16 shells/shot ⇒ ~1,360 shells/hour.
- 24/7 at ~85% OEE ⇒ 1,360 × 24 × 30 × 0.85 ≈ **~830k shells/month per machine+tool.**
- 2M shells/month ⇒ **~3 machines** (or 2 with 24-cavity tools, or family tools that mold
  top+bottom in one shot to halve part-handling).
- **Conclusion:** 1M pods/month is **~2–3 IM machines** with high-cavitation tools at a
  mid-size molder — entirely standard. Plan **2 tools** (redundancy / no single point of
  failure) and a 6–10 week tooling lead time + first-article + PPAP.

## 4. PCBA at scale

- **Turnkey contract manufacturer**, panelized (e.g. 4–8 up), automated SMT + AOI + ICT.
  A single SMT line does tens of thousands of boards/day; 1M/month needs a few lines —
  routine for an established CM.
- **Long-lead / allocation-risk parts** to forecast and PO early: GNSS module
  (NEO-M9N/ZED-F9P), SX1262 + the redundant radio, ESP32-S3/C6. Dual-source where possible.
- **Test:** boundary-scan + a powered functional fixture (GNSS fix, both radios TX/RX,
  IMU wake) before potting/sealing. Program + provision keys (NVS) at this stage —
  note the key-isolation requirement in [../SECURITY.md](../SECURITY.md).
- **Decoys** (BOM §2) are a trivial separate line (battery + resistor network); run them
  on cheap board houses to keep the ~€5 target.

## 5. Risks / open items

- Tooling capex + lead time is the gating item — fund tools once the design freezes.
- Cold-weather battery derate (30–50%) drives pack sizing → enclosure internal volume;
  confirm the `outer_d` / cell choice before cutting steel.
- Sealing + drop survival (air-drop, thrown) needs a validated gasket + foam interior;
  add a drop-test spec (ModuleDesign TODO) before mass commit.
- Regulatory: per-region radio certification (CE/RED for EU 868/433/2.4 GHz) on the final
  PCBA + antenna before volume shipment.
