// SensorNode.ino — RF-threat detection sensor pod.
// ESP32-C6 + SX1262 LoRa + (per-variant) RF frontend + GPS-PPS.
//
// FreeRTOS tasks:
//   task_rf_detect   — sample analog detector, threshold + classify
//   task_gps_pps     — capture micros() on PPS, parse NMEA for lat/lon
//   task_lora_tx     — drain TX queue, CAD-gated TX on Freq A (encrypted)
//   task_lora_rx     — listen on Freq B for MSG_REKEY broadcasts
//   task_heartbeat   — every 30 s emit MSG_HEARTBEAT if no detections
//
// Shared headers (Protocol.h, LoRaConfig.h, Crypto.h, PinnedKeys.h) are
// copied here by shared/sync_shared.ps1 — do NOT edit them in this dir.

#include <Arduino.h>
#include <RadioLib.h>
#include <TinyGPSPlus.h>

#include "Protocol.h"
#include "LoRaConfig.h"
#include "Crypto.h"
#include "RadioLink.h"
// #include "PinnedKeys.h"  // generated; uncomment after running gen_pinned_header.ps1

using namespace rftm;

// ----- Per-node identity (set at provisioning) -----
// These constants are placeholders. The provision.ino sketch writes them to NVS;
// this sketch reads them from NVS at boot. For dev, override here:
static uint8_t MY_NODE_ID = 0x01;
static uint8_t MY_X25519_PRIV[32]    = { /* loaded from NVS */ };
static uint8_t MY_ED25519_PRIV[64]   = { /* loaded from NVS, unused on pods */ };

// ----- Pin map (ESP32-C6 + external SX1262 module) -----
// TODO: confirm with your carrier-board schematic (ModuleDesign/Elect/).
static const int PIN_LORA_NSS  = 7;
static const int PIN_LORA_DIO1 = 5;
static const int PIN_LORA_RST  = 4;
static const int PIN_LORA_BUSY = 6;
static const int PIN_GPS_PPS   = 3;
static const int PIN_GPS_RX    = 16;  // ESP32-C6 -> GPS TX
static const int PIN_GPS_TX    = 17;  // ESP32-C6 -> GPS RX
static const int PIN_RF_DETECT_ADC = 1;  // band-specific analog frontend
static const int PIN_TX_ACTIVE     = 2;  // HIGH during LoRa TX — gates co-located SDR
                                          // and the redundant radio's RX (self-jam, B6)

// ----- Radio + GPS objects -----
// Primary SX1262 (sub-GHz). A redundant SX1278/SX1280 would be added as a second
// concrete Module + g_radios[1].bind(...) for failover (see shared/RadioLink.h).
SX1262 radio = new Module(PIN_LORA_NSS, PIN_LORA_DIO1, PIN_LORA_RST, PIN_LORA_BUSY);
RadioSet<1> g_radios;  // index 0 = primary; grow to RadioSet<2> for a redundant radio
TinyGPSPlus gps;
HardwareSerial GpsSerial(1);

// ----- Crypto session state -----
static SessionKey g_session_current;
static SessionKey g_session_previous;
static uint16_t   g_nonce_counter = 0;

// ----- PPS capture -----
static volatile uint64_t g_pps_micros = 0;
static void IRAM_ATTR isr_pps() { g_pps_micros = micros(); }

// ----- TX queue -----
static QueueHandle_t g_tx_queue;

// ============================================================
// Tasks
// ============================================================

static void task_rf_detect(void* /*arg*/) {
  analogReadResolution(12);
  for (;;) {
    int raw = analogRead(PIN_RF_DETECT_ADC);
    // TODO: per-band calibration mapping ADC -> dBm.
    int16_t rssi_dbm = static_cast<int16_t>(-90 + (raw / 40));

    static const int16_t DETECT_THRESHOLD_DBM = -75;
    if (rssi_dbm > DETECT_THRESHOLD_DBM) {
      DetectPacket pkt = {};
      pkt.version          = PROTOCOL_VERSION;
      pkt.msg_type         = MSG_DETECT;
      pkt.node_id          = MY_NODE_ID;
      pkt.band_id          = BAND_5800_MHZ;  // TODO: build-time set per pod variant
      pkt.sensor_class     = SENSOR_RF;       // TODO: per-variant (acoustic/mmWave/EO/...)
      pkt.pps_timestamp_us = g_pps_micros;
      pkt.rssi_dbm         = rssi_dbm;
      pkt.snr_db           = 20;   // TODO: derived from detector AGC
      pkt.noise_floor_dbm  = -95;  // TODO: rolling baseline
      pkt.lat_e7           = static_cast<int32_t>(gps.location.lat() * 1e7);
      pkt.lon_e7           = static_cast<int32_t>(gps.location.lng() * 1e7);
      pkt.altitude_m       = static_cast<int16_t>(gps.altitude.meters());
      pkt.flags            = 0;
      pkt.battery_pct      = 80;  // TODO: ADC on battery divider
      pkt.seq              = static_cast<uint16_t>(millis() & 0xFFFF);
      pkt.crc16 = crc16_ccitt(reinterpret_cast<const uint8_t*>(&pkt),
                              sizeof(pkt) - sizeof(uint16_t));
      xQueueSend(g_tx_queue, &pkt, 0);
    }
    vTaskDelay(pdMS_TO_TICKS(20));
  }
}

static void task_gps_pps(void* /*arg*/) {
  pinMode(PIN_GPS_PPS, INPUT);
  attachInterrupt(digitalPinToInterrupt(PIN_GPS_PPS), isr_pps, RISING);
  GpsSerial.begin(9600, SERIAL_8N1, PIN_GPS_RX, PIN_GPS_TX);
  for (;;) {
    while (GpsSerial.available()) gps.encode(GpsSerial.read());
    vTaskDelay(pdMS_TO_TICKS(50));
  }
}

static void task_lora_tx(void* /*arg*/) {
  DetectPacket pkt;
  uint8_t out[64];
  for (;;) {
    if (xQueueReceive(g_tx_queue, &pkt, portMAX_DELAY) == pdTRUE) {
      if (!g_session_current.valid) {
        // No key yet — drop. We'll join once master broadcasts a rekey.
        continue;
      }
      size_t n = aead_encrypt(g_session_current, MY_NODE_ID, g_nonce_counter++,
                              reinterpret_cast<const uint8_t*>(&pkt), sizeof(pkt),
                              out, sizeof(out));
      if (n == 0) continue;

      // CSMA: CAD-gated TX with random backoff on busy. transmitWithFailover()
      // tries the primary radio (and any redundant radios) once each; we wrap it
      // in the backoff/retry loop from LoRaConfig.h.
      // PIN_TX_ACTIVE is held HIGH across the TX window so a co-located SDR (or
      // the redundant radio) can gate its RX and avoid front-end desense (B6).
      radio.setFrequency(FREQ_A_MHZ);
      digitalWrite(PIN_TX_ACTIVE, HIGH);
      for (uint8_t attempt = 0; attempt < CAD_MAX_RETRIES; ++attempt) {
        if (g_radios.transmitWithFailover(out, n) >= 0) break;  // sent
        uint16_t backoff = CAD_BACKOFF_MIN_MS +
                           (esp_random() % (CAD_BACKOFF_MAX_MS - CAD_BACKOFF_MIN_MS));
        vTaskDelay(pdMS_TO_TICKS(backoff));
      }
      digitalWrite(PIN_TX_ACTIVE, LOW);
    }
  }
}

static void task_lora_rx(void* /*arg*/) {
  uint8_t buf[128];
  for (;;) {
    radio.setFrequency(FREQ_B_MHZ);
    int len = radio.receive(buf, sizeof(buf));
    if (len > 2 && buf[1] == MSG_REKEY && len >= static_cast<int>(sizeof(RekeyPacket))) {
      RekeyPacket rk;
      memcpy(&rk, buf, sizeof(rk));
      // TODO: verify_rekey(rk, MASTER_master_ED25519_PUB) against PinnedKeys.h
      // TODO: derive_session_key(MY_X25519_PRIV, rk.eph_x25519_pub, rk.new_epoch,
      //                          rk.master_node_id, g_session_current);
      // g_session_current.valid_since_ms = millis();
      g_nonce_counter = 0;
    }
    vTaskDelay(pdMS_TO_TICKS(10));
  }
}

static void task_heartbeat(void* /*arg*/) {
  for (;;) {
    vTaskDelay(pdMS_TO_TICKS(30000));
    // TODO: build + enqueue MSG_HEARTBEAT packet
  }
}

// ============================================================
// Setup / loop
// ============================================================

void setup() {
  Serial.begin(115200);
  delay(200);

  // TODO: load MY_NODE_ID, MY_X25519_PRIV, MY_ED25519_PRIV from encrypted NVS.

  if (radio.begin(FREQ_A_MHZ, BANDWIDTH_HZ / 1000.0f, SF_UPLINK,
                  CODING_RATE, SYNC_WORD_PRIVATE, TX_POWER_DBM,
                  PREAMBLE_SYMBOLS) != RADIOLIB_ERR_NONE) {
    Serial.println(F("LoRa init failed — halting."));
    while (true) { delay(1000); }
  }
  g_radios[0].bind(&radio, sx1262_uplink_g());  // primary: 868.1 MHz, sub-band g

  pinMode(PIN_TX_ACTIVE, OUTPUT);
  digitalWrite(PIN_TX_ACTIVE, LOW);

  g_tx_queue = xQueueCreate(8, sizeof(DetectPacket));

  xTaskCreate(task_rf_detect, "rf_detect", 4096, nullptr, 4, nullptr);
  xTaskCreate(task_gps_pps,   "gps_pps",   4096, nullptr, 3, nullptr);
  xTaskCreate(task_lora_tx,   "lora_tx",   4096, nullptr, 5, nullptr);
  xTaskCreate(task_lora_rx,   "lora_rx",   4096, nullptr, 5, nullptr);
  xTaskCreate(task_heartbeat, "hb",        2048, nullptr, 1, nullptr);

  Serial.println(F("SensorNode up. Awaiting rekey from master."));
}

void loop() { vTaskDelay(portMAX_DELAY); }
