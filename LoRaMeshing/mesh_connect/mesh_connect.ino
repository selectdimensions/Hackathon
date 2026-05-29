#include <RadioLib.h>
#include <SPI.h>

SPIClass spi(FSPI);

// =====================
// LLCC68 RADIO
// =====================
LLCC68 radio = new Module(
  10,   // NSS
  21,   // DIO1
  3,    // RESET
  4,    // BUSY
  spi
);

// =====================
// CONFIG
// =====================
#define NODE_ID 1
#define NETWORK_ID 42

#define LORA_FREQ 868.0
#define TX_INTERVAL 1000
#define MAX_TTL 6

// =====================
// PACKET STRUCT
// =====================
struct Packet {
  uint8_t network;
  uint8_t src;
  uint8_t dst;
  uint16_t id;
  uint8_t ttl;
  String msg;
};

uint16_t counter = 0;
unsigned long lastTx = 0;

// =====================
// SIMPLE DUPLICATE CACHE
// =====================
struct Seen {
  uint8_t src;
  uint16_t id;
};

Seen seen[30];
int seenIndex = 0;

bool seenBefore(uint8_t src, uint16_t id) {
  for (int i = 0; i < 30; i++) {
    if (seen[i].src == src && seen[i].id == id) return true;
  }
  return false;
}

void remember(uint8_t src, uint16_t id) {
  seen[seenIndex] = {src, id};
  seenIndex = (seenIndex + 1) % 30;
}

// =====================
// SERIAL PACKET FORMAT
// network,src,dst,id,ttl,msg
// =====================
String encode(Packet &p) {
  return String(p.network) + "," +
         String(p.src) + "," +
         String(p.dst) + "," +
         String(p.id) + "," +
         String(p.ttl) + "," +
         p.msg;
}

bool decode(String s, Packet &p) {
  int i[5];

  i[0] = s.indexOf(',');
  for (int n = 1; n < 5; n++) {
    i[n] = s.indexOf(',', i[n - 1] + 1);
    if (i[n] < 0) return false;
  }

  p.network = s.substring(0, i[0]).toInt();
  p.src = s.substring(i[0] + 1, i[1]).toInt();
  p.dst = s.substring(i[1] + 1, i[2]).toInt();
  p.id = s.substring(i[2] + 1, i[3]).toInt();
  p.ttl = s.substring(i[3] + 1, i[4]).toInt();
  p.msg = s.substring(i[4] + 1);

  return true;
}

// =====================
// SEND PACKET
// =====================
void sendPacket(uint8_t dst, String msg) {
  Packet p;

  p.network = NETWORK_ID;
  p.src = NODE_ID;
  p.dst = dst;
  p.id = counter++;
  p.ttl = MAX_TTL;
  p.msg = msg;

  String out = encode(p);

  Serial.print("TX: ");
  Serial.println(out);

  radio.transmit(out);
  radio.startReceive();
}

// =====================
// RECEIVE + RELAY
// =====================
void receiveLoop() {
  String data;

  int state = radio.receive(data);

  if (state != RADIOLIB_ERR_NONE) return;

  Packet p;
  if (!decode(data, p)) return;
  if (p.network != NETWORK_ID) return;

  if (seenBefore(p.src, p.id)) return;
  remember(p.src, p.id);

  Serial.println("\n--- RX ---");
  Serial.println(p.msg);

  // message for me or broadcast
  if (p.dst == NODE_ID || p.dst == 255) {
    Serial.println("ACCEPTED");
  }

  // relay logic
  if (p.src != NODE_ID && p.ttl > 0) {
    p.ttl--;

    String out = encode(p);

    delay(random(50, 200)); // reduce collisions

    radio.transmit(out);

    Serial.println("RELAYED");
  }
}

// =====================
// SETUP
// =====================
void setup() {
  Serial.begin(115200);
  delay(1500);

  Serial.println("\nLLCC68 Mesh Node Starting...");

  spi.begin(6, 2, 7, 10);
  spi.setFrequency(8000000);

  delay(200);

  pinMode(3, OUTPUT);
  digitalWrite(3, LOW);
  delay(50);
  digitalWrite(3, HIGH);
  delay(200);

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

  Serial.println("Mesh Ready");
}

// =====================
// LOOP
// =====================
void loop() {
  receiveLoop();

  if (millis() - lastTx > TX_INTERVAL) {
    lastTx = millis();

    sendPacket(255, "Hello from node " + String(NODE_ID));
  }

}
