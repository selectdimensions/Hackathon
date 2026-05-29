// RadioLink.h — radio-agnostic transport over RadioLib's PhysicalLayer.
//
// A node owns 1..N radios: a primary SX1262 (sub-GHz) plus an optional
// redundant radio — SX1278 (band-family backup, 137-525 MHz) or SX1280/1281
// (2.4 GHz frequency diversity + ranging). The encrypted wire format is
// PHY-agnostic (see Crypto.h / Protocol.h), so the *same* ciphertext bytes go
// out whichever radio is chosen; the redundant radio is a transport choice
// only and never changes the protocol.
//
// Concrete radio objects (SX1262 / SX1278 / SX1280) are created and configured
// in the sketch with their board pin map, because the freq/SF/BW/power setters
// live on the derived classes. RadioLink then drives the common data-plane
// (transmit / startReceive / readData / CAD) through the PhysicalLayer* base.
//
// Reuse: descriptor factories below pull their parameters from LoRaConfig.h so
// there is a single source of truth for the SX1262 sub-band g/P settings.

#ifndef RFTM_RADIOLINK_H
#define RFTM_RADIOLINK_H

#include <stddef.h>
#include <stdint.h>

#include <RadioLib.h>  // PhysicalLayer base + SX1262 / SX1278 / SX1280

#include "LoRaConfig.h"

namespace rftm {

// Which silicon a channel drives. Maps to a RadioLib derived class in the sketch.
enum RadioChip : uint8_t {
  RADIO_SX1262 = 0,  // sub-GHz primary, 150-960 MHz (433 + 868)
  RADIO_SX1278 = 1,  // sub-GHz redundant, 137-525 MHz (433) — band-family backup
  RADIO_SX1280 = 2,  // 2.4 GHz redundant (SX1280/1281) — freq diversity + ranging
};

// Duty-cycle regime for the channel's band (drives the EU auditor, gap F3).
enum DutySubBand : uint8_t {
  DUTY_EU868_G = 0,  // 868.0-868.6 MHz, 1%
  DUTY_EU868_P = 1,  // 869.4-869.65 MHz, 10%, +27 dBm
  DUTY_EU433   = 2,  // 433 MHz EU SRD
  DUTY_ISM2400 = 3,  // 2.4 GHz — no duty cycle, power-limited
};

// Static config for one radio: intended PHY settings + metadata. Applied to the
// concrete radio in the sketch; retained here for failover + duty accounting.
struct RadioDescriptor {
  RadioChip   chip;
  float       freq_mhz;
  float       bw_khz;
  uint8_t     sf;
  uint8_t     cr;         // 4/x coding-rate denominator (5..8)
  int8_t      power_dbm;
  uint8_t     sync_word;
  uint16_t    preamble;
  DutySubBand duty;
};

// ---- Default descriptors (single source of truth = LoRaConfig.h) ----

// Primary uplink: SX1262 on 868.1 MHz, sub-band g (1%).
inline RadioDescriptor sx1262_uplink_g() {
  return {RADIO_SX1262, FREQ_A_MHZ, BANDWIDTH_HZ / 1000.0f, SF_UPLINK,
          CODING_RATE, TX_POWER_DBM, SYNC_WORD_PRIVATE, PREAMBLE_SYMBOLS,
          DUTY_EU868_G};
}

// Current downlink: SX1262 on 868.3 MHz, sub-band g (1%) — master -> soldier.
inline RadioDescriptor sx1262_downlink_g() {
  return {RADIO_SX1262, FREQ_B_MHZ, BANDWIDTH_HZ / 1000.0f, SF_DOWNLINK,
          CODING_RATE, TX_POWER_DBM, SYNC_WORD_PRIVATE, PREAMBLE_SYMBOLS,
          DUTY_EU868_G};
}

// High-rate downlink: SX1262 on sub-band P (10%, +27 dBm) — master -> soldier.
inline RadioDescriptor sx1262_downlink_p() {
  return {RADIO_SX1262, FREQ_B_HIGH_RATE_MHZ, BANDWIDTH_HZ / 1000.0f, SF_DOWNLINK,
          CODING_RATE, TX_POWER_DBM_SUBBAND_P, SYNC_WORD_PRIVATE, PREAMBLE_SYMBOLS,
          DUTY_EU868_P};
}

// Redundant 2.4 GHz channel: SX1280/1281, frequency diversity vs sub-GHz jamming.
inline RadioDescriptor sx1280_redundant_2g4() {
  return {RADIO_SX1280, 2400.0f, BANDWIDTH_HZ / 1000.0f, SF_UPLINK,
          CODING_RATE, 12 /* dBm */, SYNC_WORD_PRIVATE, PREAMBLE_SYMBOLS,
          DUTY_ISM2400};
}

// Redundant 433 MHz channel: SX1278, band-family backup on the same sub-GHz plane.
inline RadioDescriptor sx1278_redundant_433() {
  return {RADIO_SX1278, 433.5f, BANDWIDTH_HZ / 1000.0f, SF_UPLINK,
          CODING_RATE, TX_POWER_DBM, SYNC_WORD_PRIVATE, PREAMBLE_SYMBOLS,
          DUTY_EU433};
}

// One radio channel: a configured RadioLib PhysicalLayer + its descriptor.
class RadioChannel {
 public:
  RadioChannel() : phy_(nullptr) {}

  // The sketch creates + begin()s the concrete radio, then binds it here.
  void bind(PhysicalLayer* phy, const RadioDescriptor& d) {
    phy_ = phy;
    desc_ = d;
  }
  bool bound() const { return phy_ != nullptr; }
  const RadioDescriptor& descriptor() const { return desc_; }

  // ---- Data-plane (PhysicalLayer base API; returns RadioLib status codes) ----
  int16_t transmit(const uint8_t* buf, size_t len) {
    return phy_ ? phy_->transmit(const_cast<uint8_t*>(buf), len)
                : RADIOLIB_ERR_UNKNOWN;
  }
  int16_t startReceive() {
    return phy_ ? phy_->startReceive() : RADIOLIB_ERR_UNKNOWN;
  }
  int16_t readData(uint8_t* buf, size_t len) {
    return phy_ ? phy_->readData(buf, len) : RADIOLIB_ERR_UNKNOWN;
  }
  // CAD before TX (LBT). True if the channel is currently busy.
  bool channelBusy() {
    return phy_ && phy_->scanChannel() == RADIOLIB_PREAMBLE_DETECTED;
  }

 private:
  PhysicalLayer*  phy_;
  RadioDescriptor desc_;
};

// A node's radio set: index 0 = primary, 1.. = redundant. CAD-gated TX tries
// the primary first and fails over to the next bound radio on busy/error.
// Backoff/retry counts come from the CAD_* constants in LoRaConfig.h.
template <uint8_t N>
class RadioSet {
 public:
  RadioChannel& operator[](uint8_t i) { return ch_[i]; }
  static constexpr uint8_t size() { return N; }

  // Returns the index of the radio that sent the frame, or -1 if all failed.
  int8_t transmitWithFailover(const uint8_t* buf, size_t len) {
    for (uint8_t i = 0; i < N; ++i) {
      if (!ch_[i].bound()) continue;
      if (ch_[i].channelBusy()) continue;  // busy — try the next radio
      if (ch_[i].transmit(buf, len) == RADIOLIB_ERR_NONE) {
        return static_cast<int8_t>(i);
      }
    }
    return -1;
  }

 private:
  RadioChannel ch_[N];
};

}  // namespace rftm

#endif  // RFTM_RADIOLINK_H
