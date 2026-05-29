#include <RadioLib.h>
#include <SPI.h>

SPIClass spi(FSPI);

LLCC68 radio = new Module(
  10,   // NSS
  21,   // DIO1
  3,    // RESET
  4,    // BUSY
  spi
);

// =====================
// CONFIG — set NODE_ID to 2 on the second device
// =====================
#define NODE_ID     1
#define NETWORK_ID  42
#define LORA_FREQ   868.0
#define TX_INTERVAL 7000   // ms between broadcasts
#define MAX_TTL     6

// =====================
// PACKET STRUCT (fixed-size, byte-packed)
// =====================
#pragma pack(push, 1)
struct Packet {
  uint8_t  network;
  uint8_t  src;
  uint8_t  dst;
  uint16_t id;
  uint8_t  ttl;
  char     msg[48];
};
#pragma pack(pop)

uint16_t      counter = 0;
unsigned long lastTx  = 0;

// =====================
// INTERRUPT FLAG — set by RadioLib's callback
// =====================
volatile bool rxFlag = false;
void onDio1() { rxFlag = true; }   // plain function, RadioLib handles IRAM

// =====================
// DUPLICATE CACHE
// =====================
struct Seen { uint8_t src; uint16_t id; };
Seen seen[30];
int  seenIdx = 0;

bool seenBefore(uint8_t src, uint16_t id) {
  for (int i = 0; i < 30; i++)
    if (seen[i].src == src && seen[i].id == id) return true;
  return false;
}
void remember(uint8_t src, uint16_t id) {
  seen[seenIdx] = {src, id};
  seenIdx = (seenIdx + 1) % 30;
}

// =====================
// RADIO HELPERS
// =====================
void startRx() {
  radio.startReceive();
}

void sendPacket(uint8_t dst, const char* msg) {
  radio.clearDio1Action();

  Packet p;
  p.network = NETWORK_ID;
  p.src     = NODE_ID;
  p.dst     = dst;
  p.id      = counter++;
  p.ttl     = MAX_TTL;
  strncpy(p.msg, msg, sizeof(p.msg) - 1);
  p.msg[sizeof(p.msg) - 1] = '\0';
  remember(p.src, p.id);

  Serial.print("[TX] to="); Serial.print(p.dst);
  Serial.print(" id=");     Serial.print(p.id);
  Serial.print(" msg=");    Serial.println(p.msg);

  radio.standby();                                    // ← release RX before TX
  int state = radio.transmit((uint8_t*)&p, sizeof(p));
  if (state != RADIOLIB_ERR_NONE) {
    Serial.print("[TX ERR] "); Serial.println(state);
  }

  radio.setDio1Action(onDio1);
  startRx();
}

void relayPacket(Packet &p) {
  p.ttl--;
  Serial.print("[RELAY] src="); Serial.print(p.src);
  Serial.print(" id=");         Serial.println(p.id);

  radio.clearDio1Action();
  delay(random(50, 200));
  radio.standby();                                    // ← same here
  radio.transmit((uint8_t*)&p, sizeof(p));
  radio.setDio1Action(onDio1);
  startRx();
}

// =====================
// RECEIVE HANDLER
// =====================
void handleRx() {
  uint8_t buf[sizeof(Packet)];
  size_t  len = sizeof(buf);

  int state = radio.readData(buf, len);
  if (state != RADIOLIB_ERR_NONE) {
    Serial.print("[RX ERR] ");
    Serial.println(state);
    startRx();
    return;
  }

  if (len != sizeof(Packet)) {
    Serial.print("[RX] bad length: ");
    Serial.println(len);
    startRx();
    return;
  }

  Packet p;
  memcpy(&p, buf, sizeof(p));
  p.msg[sizeof(p.msg) - 1] = '\0';

  if (p.network != NETWORK_ID) { startRx(); return; }
  if (seenBefore(p.src, p.id)) { startRx(); return; }
  remember(p.src, p.id);

  Serial.println("\n--- RX ---");
  Serial.print("from="); Serial.print(p.src);
  Serial.print(" dst="); Serial.print(p.dst);
  Serial.print(" id=");  Serial.print(p.id);
  Serial.print(" ttl="); Serial.print(p.ttl);
  Serial.print(" msg="); Serial.println(p.msg);

  if (p.dst == NODE_ID || p.dst == 255)
    Serial.println(">>> ACCEPTED");

  if (p.src != NODE_ID && p.ttl > 0)
    relayPacket(p);
  else
    startRx();
}

// =====================
// SETUP
// =====================
void setup() {
  Serial.begin(115200);
  delay(1500);
  Serial.print("\nLLCC68 Mesh Node ");
  Serial.println(NODE_ID);

  spi.begin(6, 2, 7, 10);
  spi.setFrequency(8000000);
  delay(200);

  pinMode(3, OUTPUT);
  digitalWrite(3, LOW);  delay(50);
  digitalWrite(3, HIGH); delay(200);

  int state = radio.begin(LORA_FREQ);
  if (state != RADIOLIB_ERR_NONE) {
    Serial.print("Radio init failed: ");
    Serial.println(state);
    while (true);
  }

  radio.setOutputPower(14);
  radio.setSpreadingFactor(9);
  radio.setBandwidth(125.0);
  radio.setCodingRate(7);

  // Use RadioLib's own DIO1 callback setter
  radio.setDio1Action(onDio1);

  // Stagger TX start: node 1 starts at t=0, node 2 waits half an interval
  // This prevents them from always transmitting simultaneously
  lastTx = millis() - TX_INTERVAL + (NODE_ID - 1) * (TX_INTERVAL / 2);

  startRx();
  Serial.println("Mesh Ready");
}

// =====================
// LOOP
// =====================
void loop() {
  if (rxFlag) {
    rxFlag = false;
    handleRx();
  }

  if (millis() - lastTx > TX_INTERVAL) {
    lastTx = millis();
    char msg[48];
    snprintf(msg, sizeof(msg), "Hello from node %d (cnt=%d)", NODE_ID, counter);
    sendPacket(255, msg);
  }
}
