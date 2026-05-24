// AudioCues.h — cue_id -> filename table.
// Master picks a cue_id; soldier looks it up here and plays the .wav from LittleFS.
// Keep in sync with UserNotification/audio_manifest.md and UserNotification/clips/.
// The audio-cue-curator agent enforces consistency.

#ifndef RFTM_AUDIOCUES_H
#define RFTM_AUDIOCUES_H

#include <stdint.h>

namespace rftm {

// Cue ID ranges (see SECURITY.md / audio_manifest.md):
//   0x00-0x0F  Cardinals + ordinals  (bearing)
//   0x10-0x1F  Distance
//   0x20-0x2F  Threat class
//   0x30-0x3F  Time-to-impact
//   0x40-0x4F  Comms recommendations
//   0x50-0x5F  Fine-grained bearing (30° steps, MP3 navigation library)
//   0x60-0x6F  Fine-grained distance (km, MP3 navigation library)
//   0xF0-0xFF  System
//
// 0x00-0x4F and 0xF0-0xFF resolve to UserNotification/clips/*.wav (8 kHz mono).
// 0x50-0x6F resolve to AudioClips/<lang>/*.mp3 (espeak-ng/Piper TTS, en + fr).
enum CueId : uint8_t {
  CUE_NONE             = 0x00,
  CUE_BEAR_N           = 0x01,
  CUE_BEAR_NE          = 0x02,
  CUE_BEAR_E           = 0x03,
  CUE_BEAR_SE          = 0x04,
  CUE_BEAR_S           = 0x05,
  CUE_BEAR_SW          = 0x06,
  CUE_BEAR_W           = 0x07,
  CUE_BEAR_NW          = 0x08,

  CUE_DIST_VERY_CLOSE  = 0x10,  // <25 m
  CUE_DIST_CLOSE       = 0x11,  // 25-50 m
  CUE_DIST_NEAR        = 0x12,  // 50-100 m
  CUE_DIST_MEDIUM      = 0x13,  // 100-200 m
  CUE_DIST_FAR         = 0x14,  // 200-500 m
  CUE_DIST_VERY_FAR    = 0x15,  // 500-1000 m
  CUE_DIST_DISTANT     = 0x16,  // >1000 m

  CUE_THREAT_FPV       = 0x20,
  CUE_THREAT_DRONE     = 0x21,
  CUE_THREAT_JAMMER    = 0x22,
  CUE_THREAT_LOITER    = 0x23,
  CUE_THREAT_INCOMING  = 0x24,

  CUE_TTI_10S          = 0x30,
  CUE_TTI_30S          = 0x31,
  CUE_TTI_60S          = 0x32,

  CUE_USE_CHAN_1       = 0x40,
  CUE_USE_CHAN_2       = 0x41,
  CUE_USE_CHAN_3       = 0x42,
  CUE_SWITCH_BACKUP    = 0x4F,

  CUE_SYS_NODE_DOWN    = 0xF0,
  CUE_SYS_GPS_LOST     = 0xF1,
  CUE_SYS_BATTERY_LOW  = 0xF2,
  CUE_SYS_ALL_CLEAR    = 0xF3,

  // Fine-grained bearing (every 30°). MP3 library under AudioClips/<lang>/.
  CUE_DEG_030          = 0x50,
  CUE_DEG_060          = 0x51,
  CUE_DEG_090          = 0x52,
  CUE_DEG_120          = 0x53,
  CUE_DEG_150          = 0x54,
  CUE_DEG_180          = 0x55,
  CUE_DEG_210          = 0x56,
  CUE_DEG_240          = 0x57,
  CUE_DEG_270          = 0x58,
  CUE_DEG_300          = 0x59,
  CUE_DEG_330          = 0x5A,
  CUE_DEG_360          = 0x5B,

  // Fine-grained distance (kilometres). MP3 library under AudioClips/<lang>/.
  CUE_KM_01            = 0x60,
  CUE_KM_02            = 0x61,
  CUE_KM_03            = 0x62,
  CUE_KM_04            = 0x63,
  CUE_KM_05            = 0x64,
  CUE_KM_06            = 0x65,
  CUE_KM_07            = 0x66,
  CUE_KM_08            = 0x67,
  CUE_KM_09            = 0x68,
  CUE_KM_10            = 0x69,
};

// Filename table. Soldier looks up via cue_id_to_filename(cue_id).
// Path is relative to LittleFS root: "/clips/<filename>"
struct CueEntry {
  uint8_t     cue_id;
  const char* filename;
};

static const CueEntry CUE_TABLE[] = {
  {CUE_BEAR_N,            "bear_n.wav"},
  {CUE_BEAR_NE,           "bear_ne.wav"},
  {CUE_BEAR_E,            "bear_e.wav"},
  {CUE_BEAR_SE,           "bear_se.wav"},
  {CUE_BEAR_S,            "bear_s.wav"},
  {CUE_BEAR_SW,           "bear_sw.wav"},
  {CUE_BEAR_W,            "bear_w.wav"},
  {CUE_BEAR_NW,           "bear_nw.wav"},
  {CUE_DIST_VERY_CLOSE,   "dist_very_close.wav"},
  {CUE_DIST_CLOSE,        "dist_close.wav"},
  {CUE_DIST_NEAR,         "dist_near.wav"},
  {CUE_DIST_MEDIUM,       "dist_medium.wav"},
  {CUE_DIST_FAR,          "dist_far.wav"},
  {CUE_DIST_VERY_FAR,     "dist_very_far.wav"},
  {CUE_DIST_DISTANT,      "dist_distant.wav"},
  {CUE_THREAT_FPV,        "threat_fpv.wav"},
  {CUE_THREAT_DRONE,      "threat_drone.wav"},
  {CUE_THREAT_JAMMER,     "threat_jammer.wav"},
  {CUE_THREAT_LOITER,     "threat_loiter.wav"},
  {CUE_THREAT_INCOMING,   "threat_incoming.wav"},
  {CUE_TTI_10S,           "tti_10s.wav"},
  {CUE_TTI_30S,           "tti_30s.wav"},
  {CUE_TTI_60S,           "tti_60s.wav"},
  {CUE_USE_CHAN_1,        "chan_1.wav"},
  {CUE_USE_CHAN_2,        "chan_2.wav"},
  {CUE_USE_CHAN_3,        "chan_3.wav"},
  {CUE_SWITCH_BACKUP,     "switch_backup.wav"},
  {CUE_SYS_NODE_DOWN,     "sys_node_down.wav"},
  {CUE_SYS_GPS_LOST,      "sys_gps_lost.wav"},
  {CUE_SYS_BATTERY_LOW,   "sys_battery_low.wav"},
  {CUE_SYS_ALL_CLEAR,     "sys_all_clear.wav"},
  // 0x50-0x5F: AudioClips/<lang>/deg_*.mp3
  {CUE_DEG_030,           "deg_030.mp3"},
  {CUE_DEG_060,           "deg_060.mp3"},
  {CUE_DEG_090,           "deg_090.mp3"},
  {CUE_DEG_120,           "deg_120.mp3"},
  {CUE_DEG_150,           "deg_150.mp3"},
  {CUE_DEG_180,           "deg_180.mp3"},
  {CUE_DEG_210,           "deg_210.mp3"},
  {CUE_DEG_240,           "deg_240.mp3"},
  {CUE_DEG_270,           "deg_270.mp3"},
  {CUE_DEG_300,           "deg_300.mp3"},
  {CUE_DEG_330,           "deg_330.mp3"},
  {CUE_DEG_360,           "deg_360.mp3"},
  // 0x60-0x6F: AudioClips/<lang>/dist_*.mp3
  {CUE_KM_01,             "dist_01.mp3"},
  {CUE_KM_02,             "dist_02.mp3"},
  {CUE_KM_03,             "dist_03.mp3"},
  {CUE_KM_04,             "dist_04.mp3"},
  {CUE_KM_05,             "dist_05.mp3"},
  {CUE_KM_06,             "dist_06.mp3"},
  {CUE_KM_07,             "dist_07.mp3"},
  {CUE_KM_08,             "dist_08.mp3"},
  {CUE_KM_09,             "dist_09.mp3"},
  {CUE_KM_10,             "dist_10.mp3"},
};
static constexpr size_t CUE_TABLE_LEN = sizeof(CUE_TABLE) / sizeof(CUE_TABLE[0]);

inline const char* cue_id_to_filename(uint8_t cue_id) {
  for (size_t i = 0; i < CUE_TABLE_LEN; ++i) {
    if (CUE_TABLE[i].cue_id == cue_id) return CUE_TABLE[i].filename;
  }
  return nullptr;
}

// Helper: convert AlertPacket bearing_deg (0..255 = 0..360°) to nearest 8-cardinal cue.
inline uint8_t bearing_to_cardinal_cue(uint8_t bearing_deg) {
  // 0..255 -> octant (0..7). Add 16 (half-octant) to center the bins.
  uint8_t octant = static_cast<uint8_t>((bearing_deg + 16) / 32) & 0x07;
  static const uint8_t map_[8] = {
    CUE_BEAR_N, CUE_BEAR_NE, CUE_BEAR_E, CUE_BEAR_SE,
    CUE_BEAR_S, CUE_BEAR_SW, CUE_BEAR_W, CUE_BEAR_NW,
  };
  return map_[octant];
}

// Helper: AlertPacket.distance_code -> CUE_DIST_*.
inline uint8_t distance_code_to_cue(uint8_t distance_code) {
  static const uint8_t map_[] = {
    CUE_DIST_VERY_CLOSE, CUE_DIST_CLOSE, CUE_DIST_NEAR, CUE_DIST_MEDIUM,
    CUE_DIST_FAR, CUE_DIST_VERY_FAR, CUE_DIST_DISTANT, CUE_DIST_DISTANT,
  };
  return map_[distance_code & 0x07];
}

// Helper: AlertPacket bearing_deg (0..255 = 0..360°) -> nearest 30° MP3 cue.
// 0° rounds up to CUE_DEG_360 to match the AudioClips naming.
inline uint8_t bearing_deg_to_step30_cue(uint8_t bearing_deg) {
  uint16_t deg = static_cast<uint16_t>(bearing_deg) * 360u / 256u;  // 0..359
  uint8_t step = static_cast<uint8_t>((deg + 15u) / 30u);           // 0..12
  if (step == 0) step = 12;
  if (step > 12) step = 12;
  return static_cast<uint8_t>(CUE_DEG_030 + (step - 1));
}

// Helper: metres -> nearest 1-km MP3 cue (clamped 1..10 km).
inline uint8_t meters_to_km_cue(uint16_t meters) {
  uint16_t km = (static_cast<uint32_t>(meters) + 500u) / 1000u;
  if (km < 1) km = 1;
  if (km > 10) km = 10;
  return static_cast<uint8_t>(CUE_KM_01 + (km - 1));
}

}  // namespace rftm

#endif  // RFTM_AUDIOCUES_H
