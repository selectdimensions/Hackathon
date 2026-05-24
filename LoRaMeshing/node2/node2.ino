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

#define NODE_ID     2
#define NETWORK_ID  42
#define LORA_FREQ   868.0
#define TX_INTERVAL 11000
#define MAX_TTL     6

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
volatile bool rxFlag  = false;

void onDio1() { rxFlag = true; }

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

void printRadioStatus(const char* label) {
  //Serial.print("[DBG] ");
  Serial.print(label);
  //Serial.print(" | BUSY=");
  Serial.println(digitalRead(4));
}

int safeTransmit(uint8_t* data, size_t len) {
  unsigned long t = millis();
  while (digitalRead(4) == HIGH) {
    if (millis() - t > 500) {
      Serial.println("[ERR] BUSY timeout before standby");
      return -99;
    }
  }
  int s = radio.standby();
  //Serial.print("[DBG] standby() returned: "); Serial.println(s);

  t = millis();
  while (digitalRead(4) == HIGH) {
    if (millis() - t > 500) {
      Serial.println("[ERR] BUSY timeout after standby");
      return -99;
    }
  }

  //printRadioStatus("pre-TX");
  s = radio.transmit(data, len);
  //Serial.print("[DBG] transmit() returned: "); Serial.println(s);
  return s;
}

void startRx() {
  int s = radio.startReceive();
  //Serial.print("[DBG] startReceive() returned: "); Serial.println(s);
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

  int state = safeTransmit((uint8_t*)&p, sizeof(p));
  if (state != RADIOLIB_ERR_NONE) {
    //Serial.print("[TX FAILED] code="); Serial.println(state);
    pinMode(3, OUTPUT);
    digitalWrite(3, LOW); delay(50);
    digitalWrite(3, HIGH); delay(200);
    int rs = radio.begin(LORA_FREQ);
    radio.setOutputPower(-9);
    radio.setSpreadingFactor(9);
    radio.setBandwidth(125.0);
    radio.setCodingRate(7);
    //Serial.print("[DBG] Re-init after reset: "); Serial.println(rs);
  }

  radio.setDio1Action(onDio1);
  startRx();
}

void handleRx() {
  //Serial.println("[DBG] RX interrupt fired");
  uint8_t buf[sizeof(Packet)];
  size_t  len = sizeof(buf);

  int state = radio.readData(buf, len);
  //Serial.print("[DBG] readData() returned: "); Serial.print(state);
  Serial.print(" len="); Serial.println(len);

  if (state != RADIOLIB_ERR_NONE) {
    startRx();
    return;
  }
  if (len != sizeof(Packet)) {
    Serial.print("[RX] wrong length, got "); Serial.println(len);
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
  if (p.dst == NODE_ID || p.dst == 255) Serial.println(">>> ACCEPTED");

  if (p.src != NODE_ID && p.ttl > 0) {
    p.ttl--;
    radio.clearDio1Action();
    delay(random(50, 200));
    safeTransmit((uint8_t*)&p, sizeof(p));
    radio.setDio1Action(onDio1);
  }
  startRx();
}

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

  //Serial.print("[DBG] BUSY before begin: "); Serial.println(digitalRead(4));

  int state = radio.begin(LORA_FREQ);
  //Serial.print("[DBG] begin() returned: "); Serial.println(state);
  if (state != RADIOLIB_ERR_NONE) {
    Serial.print("Radio init failed: "); Serial.println(state);
    while (true);
  }

  radio.setOutputPower(-9);      // low power for close-range testing
  radio.setSpreadingFactor(9);
  radio.setBandwidth(125.0);
  radio.setCodingRate(7);

  //Serial.print("[DBG] BUSY after config: "); Serial.println(digitalRead(4));

  radio.setDio1Action(onDio1);
  lastTx = millis();             // no stagger offset — different intervals handle desync

  startRx();
  Serial.println("Mesh Ready");

  //Serial.print("[DBG] DIO1 pin interrupt capable: ");
//Serial.println(digitalPinToInterrupt(21));
}

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