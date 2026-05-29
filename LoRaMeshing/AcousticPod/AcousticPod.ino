// AcousticPod.ino — acoustic detection pod (v0.3-hardware, WS3b).
// ESP32-S3/C6 + SX1262 LoRa + I2S MEMS mic (INMP441 / ICS-43434) + GPS-PPS.
//
// The flagship localization path: a sharp acoustic transient (gunshot, drone
// rotor onset, vehicle) is timestamped against the GNSS-PPS-disciplined clock and
// reported as a DetectPacket{sensor_class = SENSOR_ACOUSTIC}. The master solves
// 3D acoustic TDOA across >=4 pods (one elevated) — see shared/Triangulate.h and
// DataAnalysisLog/triangulate.py. Sound at ~343 m/s means 1 ms of clock error is
// only ~0.34 m, so PPS sync is far more than good enough (gap C1).
//
// FreeRTOS tasks:
//   task_acoustic     — read I2S, detect onset, timestamp, enqueue DetectPacket
//   task_gps_pps      — capture micros() on PPS; track GNSS unix time for the epoch
//   task_lora_tx      — drain TX queue, CAD-gated TX on Freq A (encrypted)
//   task_lora_rx      — listen on Freq B for MSG_REKEY
//   task_heartbeat    — periodic liveness
//
// Shared headers (Protocol.h, LoRaConfig.h, Crypto.h, RadioLink.h, PinnedKeys.h)
// are copied here by shared/sync_shared.ps1 — do NOT edit them in this dir.

#include <Arduino.h>
#include <RadioLib.h>
#include <TinyGPSPlus.h>
#include <driver/i2s.h>
#include <math.h>

#include "Protocol.h"
#include "LoRaConfig.h"
#include "Crypto.h"
#include "RadioLink.h"
// #include "PinnedKeys.h"  // generated; uncomment after gen_pinned_header.ps1

using namespace rftm;

// ----- Per-node identity (set at provisioning) -----
static uint8_t MY_NODE_ID = 0x10;  // acoustic pod (0x01..0x7F)
static uint8_t MY_X25519_PRIV[32]  = { /* loaded from NVS */ };
static uint8_t MY_ED25519_PRIV[64] = { /* loaded from NVS, unused on pods */ };

// ----- Pin map (confirm against ModuleDesign/Elect/) -----
static const int PIN_LORA_NSS  = 7;
static const int PIN_LORA_DIO1 = 5;
static const int PIN_LORA_RST  = 4;
static const int PIN_LORA_BUSY = 6;
static const int PIN_GPS_PPS   = 3;
static const int PIN_GPS_RX    = 16;  // ESP32 <- GPS TX
static const int PIN_GPS_TX    = 17;  // ESP32 -> GPS RX
static const int PIN_TX_ACTIVE = 2;   // HIGH during LoRa TX (self-jam gate, B6)
// I2S MEMS mic (INMP441 / ICS-43434), L/R tied low => left channel.
static const int PIN_I2S_BCLK  = 12;
static const int PIN_I2S_WS    = 13;
static const int PIN_I2S_DIN   = 14;

// ----- Acoustic front-end config -----
static const uint32_t I2S_SAMPLE_RATE = 16000;
static const int      I2S_BLOCK       = 256;   // samples per read
// Onset detection: instantaneous block RMS must exceed the rolling noise floor
// by ONSET_FACTOR and clear ONSET_ABS_MIN, with a refractory gap between events.
static const float    ONSET_FACTOR      = 6.0f;
static const float    ONSET_ABS_MIN     = 1.0e6f;  // raw mean-square floor (tune)
static const uint32_t ONSET_REFRACT_MS  = 250;

// ----- Radio + GPS objects -----
SX1262 radio = new Module(PIN_LORA_NSS, PIN_LORA_DIO1, PIN_LORA_RST, PIN_LORA_BUSY);
RadioSet<1> g_radios;  // primary SX1262; grow to <2> for a redundant radio
TinyGPSPlus gps;
HardwareSerial GpsSerial(1);

// ----- Crypto session state -----
static SessionKey g_session_current;
static uint16_t   g_nonce_counter = 0;

// ----- GPS-PPS time base -----
// At each PPS rising edge we latch micros(); g_pps_unix_us is the GNSS unix time
// (in us) of that edge. An onset's absolute time = g_pps_unix_us + (micros() -
// g_pps_micros). All pods share the GNSS timeline, so cross-pod arrival-time
// differences are valid TDOA observables across second boundaries.
static volatile uint64_t g_pps_micros   = 0;
static volatile bool     g_pps_seen     = false;
static uint64_t          g_pps_unix_us  = 0;

static void IRAM_ATTR isr_pps() {
  g_pps_micros = micros();
  g_pps_seen = true;
}

// Civil date/time -> unix seconds (Howard Hinnant's days-from-civil algorithm).
static uint64_t civil_to_unix_s(int y, unsigned m, unsigned d,
                                unsigned hh, unsigned mm, unsigned ss) {
  y -= (m <= 2);
  const int era = (y >= 0 ? y : y - 399) / 400;
  const unsigned yoe = static_cast<unsigned>(y - era * 400);
  const unsigned doy = (153 * (m + (m > 2 ? -3 : 9)) + 2) / 5 + d - 1;
  const unsigned doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
  const long long days = static_cast<long long>(era) * 146097 + static_cast<long long>(doe) - 719468;
  return static_cast<uint64_t>(days * 86400LL + hh * 3600 + mm * 60 + ss);
}

// ----- TX queue -----
static QueueHandle_t g_tx_queue;

// ============================================================
// I2S helpers
// ============================================================

static void i2s_mic_init() {
  i2s_config_t cfg = {
    .mode = static_cast<i2s_mode_t>(I2S_MODE_MASTER | I2S_MODE_RX),
    .sample_rate = I2S_SAMPLE_RATE,
    .bits_per_sample = I2S_BITS_PER_SAMPLE_32BIT,   // INMP441 = 24-bit in 32-bit slot
    .channel_format = I2S_CHANNEL_FMT_ONLY_LEFT,
    .communication_format = I2S_COMM_FORMAT_STAND_I2S,
    .intr_alloc_flags = ESP_INTR_FLAG_LEVEL1,
    .dma_buf_count = 4,
    .dma_buf_len = I2S_BLOCK,
    .use_apll = false,
    .tx_desc_auto_clear = false,
  };
  i2s_pin_config_t pins = {
    .bck_io_num = PIN_I2S_BCLK,
    .ws_io_num = PIN_I2S_WS,
    .data_out_num = I2S_PIN_NO_CHANGE,
    .data_in_num = PIN_I2S_DIN,
  };
  i2s_driver_install(I2S_NUM_0, &cfg, 0, nullptr);
  i2s_set_pin(I2S_NUM_0, &pins);
}

// ============================================================
// Tasks
// ============================================================

static void task_acoustic(void* /*arg*/) {
  static int32_t samples[I2S_BLOCK];
  float    noise_floor_ms = ONSET_ABS_MIN;  // rolling mean-square baseline (EMA)
  uint32_t last_onset_ms  = 0;

  for (;;) {
    size_t n_bytes = 0;
    if (i2s_read(I2S_NUM_0, samples, sizeof(samples), &n_bytes, portMAX_DELAY) != ESP_OK) {
      continue;
    }
    const size_t count = n_bytes / sizeof(int32_t);
    if (count == 0) continue;

    // Block mean-square. INMP441 packs 24-bit left-justified in 32-bit; >>8.
    double sum_sq = 0.0;
    for (size_t i = 0; i < count; ++i) {
      const double s = static_cast<double>(samples[i] >> 8);
      sum_sq += s * s;
    }
    const float mean_sq = static_cast<float>(sum_sq / count);

    const uint32_t now_ms = millis();
    const bool armed = (now_ms - last_onset_ms) > ONSET_REFRACT_MS;
    if (armed && mean_sq > noise_floor_ms * ONSET_FACTOR && mean_sq > ONSET_ABS_MIN) {
      // Onset: timestamp against the GNSS-PPS-disciplined clock.
      const uint64_t onset_us =
          g_pps_unix_us + (g_pps_seen ? (micros() - g_pps_micros) : 0);
      last_onset_ms = now_ms;

      DetectPacket pkt = {};
      pkt.version          = PROTOCOL_VERSION;
      pkt.msg_type         = MSG_DETECT;
      pkt.node_id          = MY_NODE_ID;
      pkt.band_id          = BAND_UNKNOWN;     // acoustic is not an RF band
      pkt.sensor_class     = SENSOR_ACOUSTIC;
      pkt.pps_timestamp_us = onset_us;         // TDOA primary key (absolute GNSS us)
      pkt.rssi_dbm         = static_cast<int16_t>(10.0f * log10f(mean_sq + 1.0f)); // level proxy
      pkt.snr_db           = static_cast<uint8_t>(
          fminf(63.0f, fmaxf(0.0f, 10.0f * log10f(mean_sq / (noise_floor_ms + 1.0f)))));
      pkt.noise_floor_dbm  = 0;                // n/a for acoustic; reserved
      pkt.lat_e7           = static_cast<int32_t>(gps.location.lat() * 1e7);
      pkt.lon_e7           = static_cast<int32_t>(gps.location.lng() * 1e7);
      pkt.altitude_m       = static_cast<int16_t>(gps.altitude.meters());
      pkt.flags            = 0;
      pkt.battery_pct      = 90;               // TODO: battery divider ADC
      pkt.seq              = static_cast<uint16_t>(now_ms & 0xFFFF);
      pkt.crc16 = crc16_ccitt(reinterpret_cast<const uint8_t*>(&pkt),
                              sizeof(pkt) - sizeof(uint16_t));
      xQueueSend(g_tx_queue, &pkt, 0);
    }

    // Update the rolling noise floor only when quiet (slow EMA).
    if (mean_sq < noise_floor_ms * ONSET_FACTOR) {
      noise_floor_ms = 0.98f * noise_floor_ms + 0.02f * mean_sq;
      if (noise_floor_ms < 1.0f) noise_floor_ms = 1.0f;
    }
  }
}

static void task_gps_pps(void* /*arg*/) {
  pinMode(PIN_GPS_PPS, INPUT);
  attachInterrupt(digitalPinToInterrupt(PIN_GPS_PPS), isr_pps, RISING);
  GpsSerial.begin(9600, SERIAL_8N1, PIN_GPS_RX, PIN_GPS_TX);
  for (;;) {
    while (GpsSerial.available()) gps.encode(GpsSerial.read());
    // The PPS edge marks the start of the GNSS second; pair it with the parsed
    // date/time so onsets get an absolute unix-us timestamp.
    if (gps.time.isValid() && gps.date.isValid()) {
      g_pps_unix_us = civil_to_unix_s(gps.date.year(), gps.date.month(), gps.date.day(),
                                      gps.time.hour(), gps.time.minute(), gps.time.second())
                      * 1000000ULL;
    }
    vTaskDelay(pdMS_TO_TICKS(50));
  }
}

static void task_lora_tx(void* /*arg*/) {
  DetectPacket pkt;
  uint8_t out[64];
  for (;;) {
    if (xQueueReceive(g_tx_queue, &pkt, portMAX_DELAY) == pdTRUE) {
      if (!g_session_current.valid) continue;  // no key yet — wait for rekey
      size_t n = aead_encrypt(g_session_current, MY_NODE_ID, g_nonce_counter++,
                              reinterpret_cast<const uint8_t*>(&pkt), sizeof(pkt),
                              out, sizeof(out));
      if (n == 0) continue;

      radio.setFrequency(FREQ_A_MHZ);
      digitalWrite(PIN_TX_ACTIVE, HIGH);  // gate co-located/redundant RX (B6)
      for (uint8_t attempt = 0; attempt < CAD_MAX_RETRIES; ++attempt) {
        if (g_radios.transmitWithFailover(out, n) >= 0) break;
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
      // TODO: verify_rekey + derive_session_key (see SensorNode/MasterNode).
      g_nonce_counter = 0;
    }
    vTaskDelay(pdMS_TO_TICKS(10));
  }
}

static void task_heartbeat(void* /*arg*/) {
  for (;;) {
    vTaskDelay(pdMS_TO_TICKS(30000));
    // TODO: build + enqueue MSG_HEARTBEAT / MSG_POSITION on deploy + on-move re-fix.
  }
}

// ============================================================
// Setup / loop
// ============================================================

void setup() {
  Serial.begin(115200);
  delay(200);

  // TODO: load MY_NODE_ID, MY_X25519_PRIV from encrypted NVS.

  if (radio.begin(FREQ_A_MHZ, BANDWIDTH_HZ / 1000.0f, SF_UPLINK,
                  CODING_RATE, SYNC_WORD_PRIVATE, TX_POWER_DBM,
                  PREAMBLE_SYMBOLS) != RADIOLIB_ERR_NONE) {
    Serial.println(F("LoRa init failed — halting."));
    while (true) { delay(1000); }
  }
  g_radios[0].bind(&radio, sx1262_uplink_g());

  pinMode(PIN_TX_ACTIVE, OUTPUT);
  digitalWrite(PIN_TX_ACTIVE, LOW);

  i2s_mic_init();
  g_tx_queue = xQueueCreate(8, sizeof(DetectPacket));

  xTaskCreate(task_acoustic,  "acoustic", 8192, nullptr, 4, nullptr);
  xTaskCreate(task_gps_pps,   "gps_pps",  4096, nullptr, 3, nullptr);
  xTaskCreate(task_lora_tx,   "lora_tx",  4096, nullptr, 5, nullptr);
  xTaskCreate(task_lora_rx,   "lora_rx",  4096, nullptr, 5, nullptr);
  xTaskCreate(task_heartbeat, "hb",       2048, nullptr, 1, nullptr);

  Serial.println(F("AcousticPod up. Awaiting rekey + listening for transients."));
}

void loop() { vTaskDelay(portMAX_DELAY); }
