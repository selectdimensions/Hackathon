// LoRaConfig.h — radio parameters and timing budgets.
// Shared between sensor / master / soldier sketches via shared/sync_shared.ps1.

#ifndef RFTM_LORACONFIG_H
#define RFTM_LORACONFIG_H

#include <stdint.h>

namespace rftm {

// ---- Frequency plan (EU 868 sub-band g, 1% duty cycle, 36 s/hour) ----
static constexpr float FREQ_A_MHZ = 868.1f;  // sensor -> master (uplink)
static constexpr float FREQ_B_MHZ = 868.3f;  // master -> soldier + rekey (downlink)

// ---- LoRa modulation ----
static constexpr uint8_t  SF_UPLINK         = 9;    // sensor -> master
static constexpr uint8_t  SF_DOWNLINK       = 7;    // master -> soldier (faster, shorter range OK)
static constexpr uint32_t BANDWIDTH_HZ      = 125000;
static constexpr uint8_t  CODING_RATE       = 5;    // 4/5
static constexpr int8_t   TX_POWER_DBM      = 14;   // EU max
static constexpr uint16_t PREAMBLE_SYMBOLS  = 8;
static constexpr uint8_t  SYNC_WORD_PRIVATE = 0x12; // private network

// ---- Airtime estimates (informational; verify with the EU duty-cycle auditor) ----
// DetectPacket (28 plaintext + 3 envelope + 8 tag = 39 B) @ SF9/125/CR4/5 ~= 155 ms
// AlertPacket  (10 plaintext + 3 envelope + 8 tag = 21 B) @ SF7/125/CR4/5 ~=  41 ms
// RekeyPacket  (108 B, chunked across 2 frames)         @ SF9/125/CR4/5 ~= 410 ms

// ---- Duty-cycle budget (hourly, per device, EU 868.0–868.6) ----
static constexpr uint32_t DUTY_CYCLE_BUDGET_MS_PER_HOUR = 36000;  // 1% of 3600 s

// ---- Crypto / rekey timing ----
// Rotation interval: 60 min ± 15 min jitter (allowed range per SECURITY.md: 30..120 min).
static constexpr uint32_t REKEY_INTERVAL_MIN_MS = 30 * 60 * 1000UL;  // hard floor
static constexpr uint32_t REKEY_INTERVAL_MAX_MS = 2 * 60 * 60 * 1000UL; // hard ceiling
static constexpr uint32_t REKEY_INTERVAL_NOMINAL_MS = 60 * 60 * 1000UL; // 60 min
static constexpr uint32_t REKEY_JITTER_MS         = 15 * 60 * 1000UL;  // ±15 min

// Receivers retain the previous epoch's key for this long after a rekey,
// to handle in-flight packets sent right at the cutover.
static constexpr uint32_t REKEY_GRACE_MS = 5 * 60 * 1000UL;

// ---- CSMA-CA (CAD before TX) ----
static constexpr uint16_t CAD_BACKOFF_MIN_MS = 50;
static constexpr uint16_t CAD_BACKOFF_MAX_MS = 500;
static constexpr uint8_t  CAD_MAX_RETRIES    = 5;

}  // namespace rftm

#endif  // RFTM_LORACONFIG_H