// MasterNode.ino — receives sensor detections, runs TDOA+RSSI triangulation,
// broadcasts encrypted alerts to soldier nodes, and periodically rekeys.
//
// FreeRTOS tasks:
//   task_lora_rx_a    — receive DetectPacket on Freq A, decrypt, decoding -> registry
//   task_triangulate  — when >=3 pods report same emitter in sync window: solve
//   task_lora_tx_b    — emit AlertPacket on Freq B (encrypted)
//   task_rekey        — every 45..75 min: build, sign, broadcast RekeyPacket
//   task_serial_out   — JSON log to USB serial for DataAnalysisLog/
//
// Shared headers copied here by shared/sync_shared.ps1.

#include <Arduino.h>
#include <RadioLib.h>
#include <ArduinoJson.h>

#include "Protocol.h"
#include "LoRaConfig.h"
#include "Crypto.h"
#include "RadioLink.h"
#include "Triangulate.h"
// #include "PinnedKeys.h"  // generated; uncomment after gen_pinned_header.ps1

using namespace rftm;

// ----- Master identity -----
static const uint8_t MY_NODE_ID = NODE_ID_MASTER;
static uint8_t MY_ED25519_PRIV[64] = { /* from NVS */ };
static uint8_t MY_X25519_PRIV[32]  = { /* from NVS */ };

// ----- Pin map (placeholder — confirm with carrier board) -----
static const int PIN_LORA_NSS  = 7;
static const int PIN_LORA_DIO1 = 5;
static const int PIN_LORA_RST  = 4;
static const int PIN_LORA_BUSY = 6;

SX1262 radio = new Module(PIN_LORA_NSS, PIN_LORA_DIO1, PIN_LORA_RST, PIN_LORA_BUSY);
// Master hosts the primary sub-GHz radio here; additional radios (SX1278 433,
// SX1280 2.4 GHz) are added as more concrete Modules + g_radios[i].bind(...).
RadioSet<1> g_radios;

// ----- Session state -----
static SessionKey g_session_current;
static uint8_t    g_current_epoch = 0;
static uint16_t   g_master_nonce  = 0;

// ----- Node registry -----
struct PodReport {
  uint8_t  node_id;
  uint64_t pps_us;
  int16_t  rssi_dbm;
  int32_t  lat_e7;
  int32_t  lon_e7;
  int16_t  alt_m;
  uint8_t  band_id;
  uint8_t  sensor_class;
  uint32_t recv_ms;
};
static const size_t MAX_PODS = 16;
static PodReport g_registry[MAX_PODS];
static SemaphoreHandle_t g_reg_mtx;

// Master's surveyed position — the observer reference for bearing/distance.
static const double MASTER_LAT = 50.100000;
static const double MASTER_LON = 14.420000;

// Acoustic correlation window: pods detecting the same transient arrive within
// (baseline / speed-of-sound); 4 s covers ~1.3 km of pod spread.
static const uint32_t SYNC_WINDOW_MS = 4000;

// Solved alerts awaiting encrypted TX on Freq B.
static QueueHandle_t g_alert_queue;

// ============================================================
// Tasks
// ============================================================

static void task_lora_rx_a(void* /*arg*/) {
  uint8_t buf[64];
  uint8_t pt[64];
  for (;;) {
    radio.setFrequency(FREQ_A_MHZ);
    int len = radio.receive(buf, sizeof(buf));
    if (len <= 0) { vTaskDelay(pdMS_TO_TICKS(5)); continue; }

    // Envelope: [EP, NC_hi, NC_lo, ciphertext..., tag(8)]
    if (len < static_cast<int>(3 + sizeof(DetectPacket) + AEAD_TAG_LEN)) continue;

    // TODO: identify sender from inner plaintext after trial-decrypt.
    // For scaffolding we attempt with current session against a best-guess sender.
    // Proper impl: master keeps a hint table or accepts both current + previous epoch.

    // Placeholder decrypt:
    // size_t pt_len = aead_decrypt(g_session_current, sender_id, buf, len, pt, sizeof(pt));
    // if (pt_len < sizeof(DetectPacket)) continue;
    // const DetectPacket* d = reinterpret_cast<const DetectPacket*>(pt);
    // if (d->version != PROTOCOL_VERSION) continue;
    // if (crc16_ccitt(pt, sizeof(DetectPacket) - 2) != d->crc16) continue;

    // Insert into registry (scaffold — replace with real fields):
    // xSemaphoreTake(g_reg_mtx, portMAX_DELAY);
    //   ... update_registry(d);
    // xSemaphoreGive(g_reg_mtx);
  }
}

static void task_triangulate(void* /*arg*/) {
  for (;;) {
    vTaskDelay(pdMS_TO_TICKS(250));

    // Collect recent acoustic reports with valid GNSS-PPS timestamps. Acoustic
    // TDOA is the precise path (gap C1); >=4 pods (one elevated) give a 3D fix.
    AcousticObs obs[MAX_PODS];
    size_t k = 0;
    const uint32_t now = millis();

    xSemaphoreTake(g_reg_mtx, portMAX_DELAY);
    for (size_t i = 0; i < MAX_PODS && k < MAX_PODS; ++i) {
      const PodReport& r = g_registry[i];
      if (r.node_id == 0) continue;
      if (r.sensor_class != SENSOR_ACOUSTIC) continue;
      if (r.pps_us == 0) continue;                     // no timestamp
      if (now - r.recv_ms > SYNC_WINDOW_MS) continue;  // stale
      obs[k].lat = r.lat_e7 / 1e7;
      obs[k].lon = r.lon_e7 / 1e7;
      obs[k].alt_m = r.alt_m;
      obs[k].t_us = r.pps_us;
      ++k;
    }
    xSemaphoreGive(g_reg_mtx);

    if (k < 4) continue;  // (RF-only sets would fall back to RSSI multilat — TODO)

    GeoFix fix = tri_solve_acoustic_tdoa(obs, k);
    if (!fix.ok) continue;

    float bearing_deg = 0.0f, dist_m = 0.0f;
    tri_bearing_distance(MASTER_LAT, MASTER_LON, fix.lat, fix.lon, &bearing_deg, &dist_m);

    AlertPacket a = {};
    a.version       = PROTOCOL_VERSION;
    a.msg_type      = MSG_ALERT;
    a.bearing_deg   = static_cast<uint8_t>(lroundf(fmodf(bearing_deg, 360.0f) * 256.0f / 360.0f));
    a.distance_code = tri_distance_code(dist_m);
    a.threat_class  = THREAT_UNKNOWN;  // TODO: acoustic classifier -> ThreatClass
    a.tti_sec       = 0xFF;            // TODO: closing-speed estimate from solve history
    a.confidence    = 80;
    a.cue_id        = 0;               // TODO: map bearing/dist -> AudioCues cue_id
    a.crc16 = crc16_ccitt(reinterpret_cast<const uint8_t*>(&a),
                          sizeof(a) - sizeof(uint16_t));
    xQueueSend(g_alert_queue, &a, 0);
  }
}

static void task_lora_tx_b(void* /*arg*/) {
  AlertPacket a;
  uint8_t out[64];
  for (;;) {
    if (xQueueReceive(g_alert_queue, &a, portMAX_DELAY) != pdTRUE) continue;
    if (!g_session_current.valid) continue;
    size_t n = aead_encrypt(g_session_current, MY_NODE_ID, g_master_nonce++,
                            reinterpret_cast<const uint8_t*>(&a), sizeof(a),
                            out, sizeof(out));
    if (n == 0) continue;
    // NOTE: single radio shared with RX/rekey — a radio mutex is a TODO; for now
    // we retune per-op (scaffold). Alerts go on Freq B (downlink).
    radio.setFrequency(FREQ_B_MHZ);
    g_radios.transmitWithFailover(out, n);
  }
}

static void task_rekey(void* /*arg*/) {
  for (;;) {
    // Sleep nominal +/- jitter
    int32_t jitter = (esp_random() % (2 * REKEY_JITTER_MS)) - static_cast<int32_t>(REKEY_JITTER_MS);
    uint32_t sleep_ms = REKEY_INTERVAL_NOMINAL_MS + jitter;
    if (sleep_ms < REKEY_INTERVAL_MIN_MS) sleep_ms = REKEY_INTERVAL_MIN_MS;
    if (sleep_ms > REKEY_INTERVAL_MAX_MS) sleep_ms = REKEY_INTERVAL_MAX_MS;
    vTaskDelay(pdMS_TO_TICKS(sleep_ms));

    // Build rekey:
    //   1. Generate ephemeral X25519 keypair.
    //   2. Bump epoch.
    //   3. Construct RekeyPacket{..., eph_pub, sig}.
    //   4. Sign with MY_ED25519_PRIV over (sizeof(RekeyPacket)-64) bytes.
    //   5. Broadcast on Freq B (it's ~108 B, chunked across 2 LoRa frames).
    //   6. Update g_session_current locally (so master can decrypt its own packets).
    g_current_epoch++;
    g_master_nonce = 0;
  }
}

static void task_serial_out(void* /*arg*/) {
  StaticJsonDocument<512> doc;
  for (;;) {
    vTaskDelay(pdMS_TO_TICKS(1000));
    // TODO: serialize recent detections / alerts to USB serial (newline-delimited JSON)
    // for ingestion by DataAnalysisLog/parse_log.py.
  }
}

// ============================================================
// Setup / loop
// ============================================================

void setup() {
  Serial.begin(115200);
  delay(200);

  // TODO: load MY_ED25519_PRIV, MY_X25519_PRIV from encrypted NVS.

  if (radio.begin(FREQ_B_MHZ, BANDWIDTH_HZ / 1000.0f, SF_DOWNLINK,
                  CODING_RATE, SYNC_WORD_PRIVATE, TX_POWER_DBM,
                  PREAMBLE_SYMBOLS) != RADIOLIB_ERR_NONE) {
    Serial.println(F("LoRa init failed — halting."));
    while (true) { delay(1000); }
  }
  g_radios[0].bind(&radio, sx1262_uplink_g());  // primary RX plane (868.1 MHz)

  g_reg_mtx = xSemaphoreCreateMutex();
  memset(g_registry, 0, sizeof(g_registry));
  g_alert_queue = xQueueCreate(8, sizeof(AlertPacket));

  xTaskCreate(task_lora_rx_a,   "rx_a",      4096, nullptr, 5, nullptr);
  xTaskCreate(task_triangulate, "triang",    8192, nullptr, 3, nullptr);
  xTaskCreate(task_lora_tx_b,   "tx_b",      4096, nullptr, 5, nullptr);
  xTaskCreate(task_rekey,       "rekey",     4096, nullptr, 2, nullptr);
  xTaskCreate(task_serial_out,  "ser_out",   4096, nullptr, 1, nullptr);

  Serial.println(F("MasterNode up. Initial rekey on first rekey-task tick."));
}

void loop() { vTaskDelay(portMAX_DELAY); }
