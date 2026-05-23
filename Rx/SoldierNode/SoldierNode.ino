// SoldierNode.ino — receives encrypted alerts from master, plays audio cues.
// ESP32-C6 + SX1262 LoRa + MAX98357A I2S DAC.
//
// FreeRTOS tasks:
//   task_lora_rx     — receive + decrypt AlertPacket / AllClear / ChannelRec / Rekey on Freq B
//   task_audio_play  — pop cue_id from queue, stream WAV from LittleFS to I2S
//
// Shared headers copied here by shared/sync_shared.ps1.

#include <Arduino.h>
#include <RadioLib.h>
#include <LittleFS.h>
#include <driver/i2s.h>

#include "Protocol.h"
#include "LoRaConfig.h"
#include "AudioCues.h"
#include "Crypto.h"
// #include "PinnedKeys.h"  // generated; uncomment after gen_pinned_header.ps1

using namespace rftm;

// ----- Soldier identity -----
static uint8_t MY_NODE_ID = 0xA0;
static uint8_t MY_X25519_PRIV[32]  = { /* from NVS */ };
static uint8_t MY_ED25519_PRIV[64] = { /* from NVS */ };

// ----- Pin map -----
static const int PIN_LORA_NSS  = 7;
static const int PIN_LORA_DIO1 = 5;
static const int PIN_LORA_RST  = 4;
static const int PIN_LORA_BUSY = 6;
// MAX98357A I2S DAC
static const int PIN_I2S_BCLK  = 12;
static const int PIN_I2S_LRCLK = 13;
static const int PIN_I2S_DIN   = 14;

SX1262 radio = new Module(PIN_LORA_NSS, PIN_LORA_DIO1, PIN_LORA_RST, PIN_LORA_BUSY);

// ----- Crypto -----
static SessionKey g_session_current;

// ----- Cue queue -----
static QueueHandle_t g_cue_queue;  // holds uint8_t cue_id values

// ============================================================
// I2S helpers
// ============================================================

static void i2s_init_8k_mono() {
  i2s_config_t cfg = {
    .mode = (i2s_mode_t)(I2S_MODE_MASTER | I2S_MODE_TX),
    .sample_rate = 8000,
    .bits_per_sample = I2S_BITS_PER_SAMPLE_16BIT,
    .channel_format = I2S_CHANNEL_FMT_ONLY_LEFT,
    .communication_format = I2S_COMM_FORMAT_STAND_I2S,
    .intr_alloc_flags = ESP_INTR_FLAG_LEVEL1,
    .dma_buf_count = 4,
    .dma_buf_len   = 256,
    .use_apll = false,
    .tx_desc_auto_clear = true,
  };
  i2s_pin_config_t pins = {
    .bck_io_num   = PIN_I2S_BCLK,
    .ws_io_num    = PIN_I2S_LRCLK,
    .data_out_num = PIN_I2S_DIN,
    .data_in_num  = I2S_PIN_NO_CHANGE,
  };
  i2s_driver_install(I2S_NUM_0, &cfg, 0, nullptr);
  i2s_set_pin(I2S_NUM_0, &pins);
}

static void play_wav(const char* path) {
  File f = LittleFS.open(path, "r");
  if (!f) return;
  // Skip 44-byte WAV header (assumes canonical 8 kHz mono 16-bit PCM —
  // the audio-cue-curator agent enforces this).
  f.seek(44);
  uint8_t buf[512];
  size_t  written;
  while (f.available()) {
    size_t n = f.read(buf, sizeof(buf));
    if (n == 0) break;
    i2s_write(I2S_NUM_0, buf, n, &written, portMAX_DELAY);
  }
  f.close();
}

// ============================================================
// Tasks
// ============================================================

static void task_lora_rx(void* /*arg*/) {
  uint8_t buf[128];
  uint8_t pt[64];
  for (;;) {
    radio.setFrequency(FREQ_B_MHZ);
    int len = radio.receive(buf, sizeof(buf));
    if (len <= 0) { vTaskDelay(pdMS_TO_TICKS(5)); continue; }

    // Detect message type. AAD includes msg_type so we must trial-decrypt OR
    // peek at the first plaintext byte after decrypt. Simpler: REKEY is the
    // only un-encrypted message — try it first.
    if (len >= static_cast<int>(sizeof(RekeyPacket))
        && buf[1] == MSG_REKEY) {
      RekeyPacket rk;
      memcpy(&rk, buf, sizeof(rk));
      // TODO: verify_rekey(rk, NODE_master_ED25519_PUB);
      // TODO: derive_session_key(MY_X25519_PRIV, rk.eph_x25519_pub, rk.new_epoch,
      //                          rk.master_node_id, g_session_current);
      // g_session_current.valid_since_ms = millis();
      continue;
    }

    // Encrypted path — decrypt as AlertPacket (most frequent).
    // size_t pt_len = aead_decrypt(g_session_current, NODE_ID_MASTER, buf, len, pt, sizeof(pt));
    // if (pt_len == sizeof(AlertPacket)) {
    //   const AlertPacket* a = reinterpret_cast<const AlertPacket*>(pt);
    //   if (a->version != PROTOCOL_VERSION) continue;
    //   if (crc16_ccitt(pt, sizeof(AlertPacket) - 2) != a->crc16) continue;
    //   uint8_t cue = a->cue_id;
    //   xQueueSend(g_cue_queue, &cue, 0);
    // }
  }
}

static void task_audio_play(void* /*arg*/) {
  uint8_t cue;
  for (;;) {
    if (xQueueReceive(g_cue_queue, &cue, portMAX_DELAY) == pdTRUE) {
      const char* fname = cue_id_to_filename(cue);
      if (!fname) continue;
      char path[64];
      snprintf(path, sizeof(path), "/clips/%s", fname);
      play_wav(path);
    }
  }
}

// ============================================================
// Setup / loop
// ============================================================

void setup() {
  Serial.begin(115200);
  delay(200);

  // TODO: load MY_NODE_ID, private keys from encrypted NVS.

  if (!LittleFS.begin(true)) {
    Serial.println(F("LittleFS mount failed."));
  }

  i2s_init_8k_mono();

  if (radio.begin(FREQ_B_MHZ, BANDWIDTH_HZ / 1000.0f, SF_DOWNLINK,
                  CODING_RATE, SYNC_WORD_PRIVATE, TX_POWER_DBM,
                  PREAMBLE_SYMBOLS) != RADIOLIB_ERR_NONE) {
    Serial.println(F("LoRa init failed — halting."));
    while (true) { delay(1000); }
  }

  g_cue_queue = xQueueCreate(8, sizeof(uint8_t));

  xTaskCreate(task_lora_rx,    "rx",     4096, nullptr, 5, nullptr);
  xTaskCreate(task_audio_play, "audio",  4096, nullptr, 3, nullptr);

  Serial.println(F("SoldierNode up. Awaiting rekey + alerts."));
}

void loop() { vTaskDelay(portMAX_DELAY); }