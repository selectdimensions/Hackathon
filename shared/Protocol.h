// Protocol.h — wire-format contract for the RF-threat detection mesh.
// Single source of truth. Copied into each sketch dir by shared/sync_shared.ps1.
// Any change here is a `proto:` commit and must increment the version byte
// of every struct it touches. See CONTRIBUTING.md and the lora-protocol-reviewer agent.

#ifndef RFTM_PROTOCOL_H
#define RFTM_PROTOCOL_H

#include <stdint.h>

namespace rftm {

// ---- Protocol version ----
static constexpr uint8_t PROTOCOL_VERSION = 0x01;

// ---- Message types ----
enum MsgType : uint8_t {
  MSG_DETECT      = 0x01,  // sensor pod -> master   (encrypted)
  MSG_HEARTBEAT   = 0x02,  // sensor pod -> master   (encrypted)
  MSG_ALERT       = 0x10,  // master -> soldier      (encrypted)
  MSG_ALL_CLEAR   = 0x11,  // master -> soldier      (encrypted)
  MSG_CHANNEL_REC = 0x20,  // master -> soldier      (encrypted)
  MSG_CONFIG      = 0x30,  // master -> sensor       (encrypted, future)
  MSG_REKEY       = 0x40,  // master broadcast       (Ed25519-signed, NOT encrypted)
};

// ---- Band IDs (which sensor pod frontend produced the report) ----
enum BandId : uint8_t {
  BAND_UNKNOWN     = 0x00,
  BAND_30_88_MHZ   = 0x01,  // tactical comms (Azart / Akveduk)
  BAND_433_868_MHZ = 0x02,  // EU 868 ISM (ELRS-EU, LoRa, generic SRD) + 433 EU SRD
  BAND_GNSS_L1     = 0x03,  // 1.575 GHz GPS / 1.602 GLONASS — jam detector
  BAND_2400_MHZ    = 0x04,  // DJI control, ELRS 2.4
  BAND_5800_MHZ    = 0x05,  // FPV video — highest-priority kamikaze indicator
};

// ---- Threat classes (used in AlertPacket) ----
enum ThreatClass : uint8_t {
  THREAT_UNKNOWN          = 0,
  THREAT_FPV_VIDEO        = 1,
  THREAT_FPV_CONTROL      = 2,
  THREAT_GNSS_JAM         = 3,
  THREAT_TACTICAL_JAM     = 4,
  THREAT_ISR_DRONE        = 5,
  THREAT_LOITER_MUNITION  = 6,
};

// ---- Node ID conventions ----
// 0x01..0x7F = sensor pod
// 0x80       = master
// 0xA0..0xBF = soldier
// 0xFF       = broadcast
static constexpr uint8_t NODE_ID_MASTER    = 0x80;
static constexpr uint8_t NODE_ID_BROADCAST = 0xFF;

// ---- Flags (DetectPacket.flags) ----
static constexpr uint8_t FLAG_GNSS_JAM_SUSPECTED = 0x01;
static constexpr uint8_t FLAG_FREQ_HOPPER        = 0x02;
static constexpr uint8_t FLAG_CW                 = 0x04;
static constexpr uint8_t FLAG_LOW_BATTERY        = 0x08;

// =====================================================================
// On-air envelope (every packet except MSG_REKEY):
//
//     +----+--------+--------------------------+--------+
//     | EP |  NC    |  ENCRYPTED PAYLOAD       | TAG(8) |
//     +----+--------+--------------------------+--------+
//      1B    2B          10..28 B               8B
//
// EP   = epoch byte (which session key)
// NC   = nonce counter (per sender, resets each rekey)
// TAG  = AES-128-CCM 8-byte authentication tag
//
// AAD  = [version, msg_type, sender_node_id, EP]  (5 bytes, sent in clear
//        as the first 5 bytes of the encrypted blob's outer header, then
//        bound by the CCM AAD input)
//
// Nonce[13] = [EP, node_id_hi, node_id_lo, NC_hi, NC_lo, 0,0,0,0,0,0,0,0]
// =====================================================================

struct __attribute__((packed)) EnvelopeHeader {
  uint8_t  epoch;          // EP — which session key to use
  uint16_t nonce_counter;  // NC — per-sender monotonic
};
static_assert(sizeof(EnvelopeHeader) == 3, "EnvelopeHeader layout drift");

static constexpr uint8_t  AEAD_TAG_LEN     = 8;   // truncated CCM tag
static constexpr uint8_t  AEAD_NONCE_LEN   = 13;  // CCM nonce
static constexpr uint8_t  SESSION_KEY_LEN  = 16;  // AES-128

// =====================================================================
// Sensor -> Master detection packet (encrypted body)
// Target on-air: 30 plaintext + 3 envelope + 8 tag = 41 bytes
// =====================================================================
struct __attribute__((packed)) DetectPacket {
  uint8_t  version;          // PROTOCOL_VERSION
  uint8_t  msg_type;         // MSG_DETECT
  uint8_t  node_id;          // sending pod's ID
  uint8_t  band_id;          // BandId
  uint64_t pps_timestamp_us; // us since GPS-PPS rising edge — TDOA primary key
  int16_t  rssi_dbm;         // detected emitter RSSI, signed
  uint8_t  snr_db;           // 0..63 clipped
  uint8_t  noise_floor_dbm;  // band's ambient noise floor
  int32_t  lat_e7;           // pod own lat * 1e7
  int32_t  lon_e7;           // pod own lon * 1e7
  uint8_t  flags;            // FLAG_* bits
  uint8_t  battery_pct;      // 0..100
  uint16_t seq;              // sequence (dedup at master)
  uint16_t crc16;            // CRC-16/CCITT over all preceding bytes
};
static_assert(sizeof(DetectPacket) == 30, "DetectPacket layout drift — update ARCHITECTURE.md airtime table");

// =====================================================================
// Sensor -> Master heartbeat (encrypted body). Sent every 30 s if no
// detections have triggered. Lets master tell live pods from dead ones.
// =====================================================================
struct __attribute__((packed)) HeartbeatPacket {
  uint8_t  version;          // PROTOCOL_VERSION
  uint8_t  msg_type;         // MSG_HEARTBEAT
  uint8_t  node_id;
  uint8_t  battery_pct;
  uint8_t  noise_floor_dbm;
  uint16_t uptime_min;
  uint16_t crc16;
};
static_assert(sizeof(HeartbeatPacket) == 9, "HeartbeatPacket layout drift");

// =====================================================================
// Master -> Soldier alert packet (encrypted body)
// Target on-air: 10 plaintext + 3 envelope + 8 tag = 21 bytes
// =====================================================================
struct __attribute__((packed)) AlertPacket {
  uint8_t  version;          // PROTOCOL_VERSION
  uint8_t  msg_type;         // MSG_ALERT
  uint8_t  bearing_deg;      // 0..255 = 0..360° relative to TRUE NORTH (≈1.4°)
  uint8_t  distance_code;    // log-scale: 0=<25m, 1=25-50, 2=50-100, 3=100-200, ... 7=>1km
  uint8_t  threat_class;     // ThreatClass
  uint8_t  tti_sec;          // time-to-impact estimate; 0xFF = unknown
  uint8_t  confidence;       // 0..100
  uint8_t  cue_id;           // index into UserNotification/audio_manifest.md
  uint16_t crc16;
};
static_assert(sizeof(AlertPacket) == 10, "AlertPacket layout drift — update ARCHITECTURE.md airtime table");

// =====================================================================
// Master -> Soldier "all clear" (encrypted body)
// =====================================================================
struct __attribute__((packed)) AllClearPacket {
  uint8_t  version;
  uint8_t  msg_type;         // MSG_ALL_CLEAR
  uint16_t cleared_since_ms; // how long no threats observed
  uint8_t  cue_id;           // typically a "stand down" clip
  uint16_t crc16;
};
static_assert(sizeof(AllClearPacket) == 7, "AllClearPacket layout drift");

// =====================================================================
// Master -> Soldier channel recommendation (encrypted body)
// "use Motorola channel N for clear comms" — picked from least-jammed sub-band
// =====================================================================
struct __attribute__((packed)) ChannelRecPacket {
  uint8_t  version;
  uint8_t  msg_type;         // MSG_CHANNEL_REC
  uint8_t  recommended_band; // BandId of clearest band
  uint8_t  motorola_channel; // 1..16 (or 0 = unknown)
  uint8_t  cue_id;           // "switch to channel three"
  uint16_t crc16;
};
static_assert(sizeof(ChannelRecPacket) == 7, "ChannelRecPacket layout drift");

// =====================================================================
// Master broadcast rekey (Ed25519-signed, NOT encrypted).
// See SECURITY.md "Rekey protocol" for the verification sequence.
// =====================================================================
struct __attribute__((packed)) RekeyPacket {
  uint8_t  version;
  uint8_t  msg_type;             // MSG_REKEY
  uint8_t  master_node_id;       // NODE_ID_MASTER (0x80)
  uint8_t  new_epoch;            // EP that this key activates
  uint64_t valid_from_unix_ms;   // master's clock; replay defence
  uint8_t  eph_x25519_pub[32];   // master's ephemeral X25519 public key
  uint8_t  master_ed25519_sig[64]; // signature over all preceding bytes
};
static_assert(sizeof(RekeyPacket) == 108, "RekeyPacket layout drift");

// =====================================================================
// CRC-16/CCITT (poly 0x1021, init 0xFFFF). Defence-in-depth with AES-CCM tag.
// =====================================================================
inline uint16_t crc16_ccitt(const uint8_t* data, size_t len, uint16_t init = 0xFFFF) {
  uint16_t crc = init;
  for (size_t i = 0; i < len; ++i) {
    crc ^= static_cast<uint16_t>(data[i]) << 8;
    for (int b = 0; b < 8; ++b) {
      crc = (crc & 0x8000) ? static_cast<uint16_t>((crc << 1) ^ 0x1021) : static_cast<uint16_t>(crc << 1);
    }
  }
  return crc;
}

}  // namespace rftm

#endif  // RFTM_PROTOCOL_H
