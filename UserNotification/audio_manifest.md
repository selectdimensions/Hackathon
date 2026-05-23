# Audio Cue Manifest

Source of truth for the cue_id ↔ filename ↔ phrase mapping. Must stay in sync with [`../shared/AudioCues.h`](../shared/AudioCues.h) and the actual `clips/*.wav` files. The `audio-cue-curator` agent verifies all three.

## Format requirements (per clip)

- 8000 Hz, mono, 16-bit PCM (`pcm_s16le`)
- ≤ 2 seconds duration (~32 KB)
- Naming matches the `filename` column exactly

## Cues

### Bearing (cardinals + ordinals) — 0x00–0x0F

| cue_id | Name | Filename | Spoken phrase |
|---|---|---|---|
| 0x01 | `CUE_BEAR_N` | `bear_n.wav` | "north" |
| 0x02 | `CUE_BEAR_NE` | `bear_ne.wav` | "northeast" |
| 0x03 | `CUE_BEAR_E` | `bear_e.wav` | "east" |
| 0x04 | `CUE_BEAR_SE` | `bear_se.wav` | "southeast" |
| 0x05 | `CUE_BEAR_S` | `bear_s.wav` | "south" |
| 0x06 | `CUE_BEAR_SW` | `bear_sw.wav` | "southwest" |
| 0x07 | `CUE_BEAR_W` | `bear_w.wav` | "west" |
| 0x08 | `CUE_BEAR_NW` | `bear_nw.wav` | "northwest" |

### Distance — 0x10–0x1F

| cue_id | Name | Filename | Spoken phrase |
|---|---|---|---|
| 0x10 | `CUE_DIST_VERY_CLOSE` | `dist_very_close.wav` | "twenty-five meters" |
| 0x11 | `CUE_DIST_CLOSE`      | `dist_close.wav` | "fifty meters" |
| 0x12 | `CUE_DIST_NEAR`       | `dist_near.wav` | "one hundred meters" |
| 0x13 | `CUE_DIST_MEDIUM`     | `dist_medium.wav` | "two hundred meters" |
| 0x14 | `CUE_DIST_FAR`        | `dist_far.wav` | "five hundred meters" |
| 0x15 | `CUE_DIST_VERY_FAR`   | `dist_very_far.wav` | "one thousand meters" |
| 0x16 | `CUE_DIST_DISTANT`    | `dist_distant.wav` | "distant" |

### Threat class — 0x20–0x2F

| cue_id | Name | Filename | Spoken phrase |
|---|---|---|---|
| 0x20 | `CUE_THREAT_FPV`      | `threat_fpv.wav` | "FPV drone" |
| 0x21 | `CUE_THREAT_DRONE`    | `threat_drone.wav` | "drone" |
| 0x22 | `CUE_THREAT_JAMMER`   | `threat_jammer.wav` | "jammer" |
| 0x23 | `CUE_THREAT_LOITER`   | `threat_loiter.wav` | "loitering munition" |
| 0x24 | `CUE_THREAT_INCOMING` | `threat_incoming.wav` | "incoming" |

### Time-to-impact — 0x30–0x3F

| cue_id | Name | Filename | Spoken phrase |
|---|---|---|---|
| 0x30 | `CUE_TTI_10S` | `tti_10s.wav` | "ten seconds" |
| 0x31 | `CUE_TTI_30S` | `tti_30s.wav` | "thirty seconds" |
| 0x32 | `CUE_TTI_60S` | `tti_60s.wav` | "one minute" |

### Comms recommendations — 0x40–0x4F

| cue_id | Name | Filename | Spoken phrase |
|---|---|---|---|
| 0x40 | `CUE_USE_CHAN_1` | `chan_1.wav` | "use channel one" |
| 0x41 | `CUE_USE_CHAN_2` | `chan_2.wav` | "use channel two" |
| 0x42 | `CUE_USE_CHAN_3` | `chan_3.wav` | "use channel three" |
| 0x4F | `CUE_SWITCH_BACKUP` | `switch_backup.wav` | "switch to backup" |

### System — 0xF0–0xFF

| cue_id | Name | Filename | Spoken phrase |
|---|---|---|---|
| 0xF0 | `CUE_SYS_NODE_DOWN`   | `sys_node_down.wav` | "node down" |
| 0xF1 | `CUE_SYS_GPS_LOST`    | `sys_gps_lost.wav` | "GPS lost" |
| 0xF2 | `CUE_SYS_BATTERY_LOW` | `sys_battery_low.wav` | "battery low" |
| 0xF3 | `CUE_SYS_ALL_CLEAR`   | `sys_all_clear.wav` | "all clear" |