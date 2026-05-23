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
  uint8_t  band_id;
  uint32_t recv_ms;
};
static const size_t MAX_PODS = 16;
static PodReport g_registry[MAX_PODS];
static SemaphoreHandle_t g_reg_mtx;

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
    // TODO:
    //  1. Scan registry for 3+ pods with same band_id reporting within 10 ms PPS window.
    //  2. Compute Δt_ij = pps_us_i - pps_us_j.
    //  3. Solve hyperbolic intersection (Bancroft closed-form or LS).
    //  4. Fallback to RSSI multilateration if any pod's pps_us == 0.
    //  5. Build AlertPacket with bearing/distance/threat_class/cue_id.
    //  6. Enqueue for TX.
  }
}

static void task_lora_tx_b(void* /*arg*/) {
  for (;;) {
    vTaskDelay(pdMS_TO_TICKS(100));
    // TODO: drain alert TX queue, AEAD-encrypt under current session, TX on Freq B.
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

  g_reg_mtx = xSemaphoreCreateMutex();
  memset(g_registry, 0, sizeof(g_registry));

  xTaskCreate(task_lora_rx_a,   "rx_a",      4096, nullptr, 5, nullptr);
  xTaskCreate(task_triangulate, "triang",    8192, nullptr, 3, nullptr);
  xTaskCreate(task_lora_tx_b,   "tx_b",      4096, nullptr, 5, nullptr);
  xTaskCreate(task_rekey,       "rekey",     4096, nullptr, 2, nullptr);
  xTaskCreate(task_serial_out,  "ser_out",   4096, nullptr, 1, nullptr);

  Serial.println(F("MasterNode up. Initial rekey on first rekey-task tick."));
}

void loop() { vTaskDelay(portMAX_DELAY); }