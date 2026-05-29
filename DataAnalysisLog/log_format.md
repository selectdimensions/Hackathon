# Log Format

The master node emits **newline-delimited JSON** (ndjson) over USB serial at 115200 baud. Each line is one event.

## Event types

| Field `event` | Description |
|---|---|
| `detect` | Master received a `DetectPacket` from a sensor pod |
| `alert` | Master transmitted an `AlertPacket` to soldier nodes |
| `rekey` | Master transmitted a `RekeyPacket` (every 45–75 min) |
| `decrypt_fail` | Inbound packet failed AES-EAX tag verification |
| `crc_fail` | Inbound packet passed AEAD but failed inner CRC-16 |
| `boot` | Master booted |

## `detect` schema

```json
{
  "ts_unix_ms": 1748020800000,
  "event": "detect",
  "node_id": 1,
  "band_id": 5,
  "band_name": "5800_MHZ",
  "pps_timestamp_us": 17480208001234,
  "rssi_dbm": -62,
  "snr_db": 14,
  "noise_floor_dbm": -98,
  "lat": 50.123456,
  "lon": 14.654321,
  "flags": ["FREQ_HOPPER"],
  "battery_pct": 78,
  "seq": 14223,
  "rx_freq_hz": 868100000,
  "rx_rssi_dbm": -88,
  "epoch": 7,
  "on_air_ms": 288
}
```

## `alert` schema

```json
{
  "ts_unix_ms": 1748020800180,
  "event": "alert",
  "target_node_id": 160,
  "bearing_deg": 192,
  "distance_code": 3,
  "distance_label": "100-200m",
  "threat_class": 1,
  "threat_label": "FPV_VIDEO",
  "tti_sec": 30,
  "confidence": 78,
  "cue_id": 32,
  "cue_label": "CUE_THREAT_FPV",
  "tx_freq_hz": 868300000,
  "epoch": 7,
  "on_air_ms": 41,
  "solve_method": "tdoa",
  "solve_residual_m": 8.2
}
```

`solve_method` is one of `"rssi_lsq"` (weighted Gauss-Newton multilateration on inverse-path-loss ranges — the demo's primary), `"tdoa"` (time-difference-of-arrival, requires PPS on every contributing pod), or `"rssi"` (RSSI-power-weighted centroid fallback). Parsers should treat unknown values as opaque pass-throughs.

## `rekey` schema

```json
{
  "ts_unix_ms": 1748023200000,
  "event": "rekey",
  "old_epoch": 7,
  "new_epoch": 8,
  "next_rekey_in_ms": 3517000,
  "tx_freq_hz": 868300000,
  "on_air_ms": 412
}
```

## Duty-cycle audit

`parse_log.py --report-duty-cycle` groups events by `(node_id, sub_band, hour_bucket)` and sums `on_air_ms`. EU sub-band g (868.0–868.6) budget: **36000 ms/hour**.

The `eu-duty-cycle-auditor` agent runs this automatically and fails the build at 100% utilization.

## Versioning

This schema is at **v1**. Breaking changes increment the version and add a `schema_version` field. v1 omits the field for brevity (`schema_version` absent ⇒ v1).
