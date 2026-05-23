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
//   0xF0-0xFF  System
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

}  // namespace rftm

#endif  // RFTM_AUDIOCUES_H