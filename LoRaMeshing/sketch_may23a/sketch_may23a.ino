// =============================================
// ESP32 LED Blink Example
// Works with most ESP32 development boards
// =============================================

#define LED_PIN 2     // Built-in LED pin on most ESP32 boards (GPIO2)

void setup() {
  pinMode(LED_PIN, OUTPUT);     // Set the LED pin as output
  Serial.begin(115200);         // Optional: for debugging
  Serial.println("ESP32 LED Blink Started!");
}

void loop() {
  digitalWrite(LED_PIN, HIGH);  // Turn LED ON
  Serial.println("LED ON");
  delay(1000);                  // Wait 1 second

  digitalWrite(LED_PIN, LOW);   // Turn LED OFF
  Serial.println("LED OFF");
  delay(1000);                  // Wait 1 second
}
