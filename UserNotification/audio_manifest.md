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

## Fine-grained TTS library — 0x50–0x6F

These cues resolve to MP3 files under `AudioClips/<lang>/` (English + French), **not** to `UserNotification/clips/`. They were generated with espeak-ng (Piper drop-in supported via `AudioClips/generate_piper_clips.sh`) and are designed for plain-append concatenation — e.g. "two hundred and seventy degrees, five kilometres" is `deg_270.mp3` + `dist_05.mp3`.

Format: mono, 22050 Hz, MP3 32 kbps, ≤ 8 KB each — see [AudioClips/README.md](../AudioClips/README.md). These deliberately violate the 8 kHz mono WAV format used by `0x00-0x4F`/`0xF0` because they're consumed off-device (web demo, Raspberry Pi audio), not by the soldier-node ESP32-C6 I2S DAC.

### Fine-grained bearing (30° steps) — 0x50–0x5B

| cue_id | Name | Filename | Spoken phrase |
|---|---|---|---|
| 0x50 | `CUE_DEG_030` | `deg_030.mp3` | "thirty degrees" |
| 0x51 | `CUE_DEG_060` | `deg_060.mp3` | "sixty degrees" |
| 0x52 | `CUE_DEG_090` | `deg_090.mp3` | "ninety degrees" |
| 0x53 | `CUE_DEG_120` | `deg_120.mp3` | "one hundred twenty degrees" |
| 0x54 | `CUE_DEG_150` | `deg_150.mp3` | "one hundred fifty degrees" |
| 0x55 | `CUE_DEG_180` | `deg_180.mp3` | "one hundred eighty degrees" |
| 0x56 | `CUE_DEG_210` | `deg_210.mp3` | "two hundred ten degrees" |
| 0x57 | `CUE_DEG_240` | `deg_240.mp3` | "two hundred forty degrees" |
| 0x58 | `CUE_DEG_270` | `deg_270.mp3` | "two hundred seventy degrees" |
| 0x59 | `CUE_DEG_300` | `deg_300.mp3` | "three hundred degrees" |
| 0x5A | `CUE_DEG_330` | `deg_330.mp3` | "three hundred thirty degrees" |
| 0x5B | `CUE_DEG_360` | `deg_360.mp3` | "three hundred sixty degrees" |

### Fine-grained distance (km) — 0x60–0x69

| cue_id | Name | Filename | Spoken phrase |
|---|---|---|---|
| 0x60 | `CUE_KM_01` | `dist_01.mp3` | "one kilometre" |
| 0x61 | `CUE_KM_02` | `dist_02.mp3` | "two kilometres" |
| 0x62 | `CUE_KM_03` | `dist_03.mp3` | "three kilometres" |
| 0x63 | `CUE_KM_04` | `dist_04.mp3` | "four kilometres" |
| 0x64 | `CUE_KM_05` | `dist_05.mp3` | "five kilometres" |
| 0x65 | `CUE_KM_06` | `dist_06.mp3` | "six kilometres" |
| 0x66 | `CUE_KM_07` | `dist_07.mp3` | "seven kilometres" |
| 0x67 | `CUE_KM_08` | `dist_08.mp3` | "eight kilometres" |
| 0x68 | `CUE_KM_09` | `dist_09.mp3` | "nine kilometres" |
| 0x69 | `CUE_KM_10` | `dist_10.mp3` | "ten kilometres" |
